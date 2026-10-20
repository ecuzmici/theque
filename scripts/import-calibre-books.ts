/**
 * Calibre import: bring each EPUB of a Calibre library into theque.
 *
 * The input is a JSON export of the Calibre library (one object per book,
 * with `epub_path` set to an absolute path or null). The script matches each
 * book to a book item of one profile. For a book without an item, it finds a
 * canonical book URL and proposes a new item. The script writes a proposal
 * file and a manifest for `npm run book:attach`.
 *
 * Usage:
 *   npm run books:import-calibre -- --input calibre-books.json --user <uuid>          # dry run (default): writes nothing to the database
 *   npm run books:import-calibre -- --apply --from <proposal.json>                    # inserts the `create` rows, then enriches them
 *   npm run books:import-calibre -- --apply --from <proposal.json> --no-enrich        # inserts only; the enrichment cron picks the rows up
 *
 * Options:
 *   --out-dir <dir>   Folder for the proposal, the manifest and the applied file (default .backfill)
 *   --no-enrich       With --apply: do not run enrichment after the inserts
 *
 * The dry run reads the database and calls the Open Library API, one request
 * at a time. The apply step inserts exactly the `create` rows of the proposal.
 * It inserts each row the same way as `POST /api/capture`, and then runs the
 * same enrichment. It writes `<itemId>\t<epubPath>\t<title>` lines for the
 * attach rows and the new rows. Then run:
 *   npm run book:attach -- --manifest <manifest.tsv> --dir /
 *
 * (The npm script passes --conditions=react-server so the "server-only" guard
 * in the imported admin and enrichment modules resolves to its no-op build.)
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env (or .env.local).
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { loadEnvConfig } from "@next/env";

import type { Json } from "../src/lib/database.types";
import {
  calibreYear,
  cleanBookTitle,
  displayAuthorName,
  goodreadsId,
  normalizeIsbn,
  pickOpenLibraryDoc,
  planCalibreMatches,
  authorSurname,
  type CalibreBook,
  type LibraryBook,
  type OpenLibraryDoc,
  type SkippedBook,
} from "../src/lib/import/calibre-match";
import { chooseSubtitle } from "../src/lib/enrichment/subtitle";
import { enrichItem } from "../src/lib/jobs/enrich-item";
import { checkQuota, MAX_ITEMS_PER_USER } from "../src/lib/quotas";
import { createAdminClient } from "../src/lib/supabase/admin";
import { domainFromCanonicalUrl } from "../src/lib/url/domain";
import { fingerprint } from "../src/lib/url/fingerprint";
import { normalizeUrl } from "../src/lib/url/normalize";
import { stamp, writeJson } from "./backfill-taste-shared";

loadEnvConfig(process.cwd());

type Admin = ReturnType<typeof createAdminClient>;

const USER_AGENT = "theque-calibre-import/1.0 (+https://theque.app)";
const REQUEST_DELAY_MS = 600;
const PAGE_SIZE = 1000;

type AttachRow = {
  itemId: string;
  itemTitle: string | null;
  calibreId: number;
  calibreTitle: string;
  epubPath: string;
  matchedBy: "title" | "url_fingerprint";
};

type CreateRow = {
  calibreId: number;
  title: string;
  authors: string[];
  year: number | null;
  series: string | null;
  seriesIndex: number | null;
  isbn: string | null;
  url: string;
  resolvedVia: "openlibrary_search" | "isbn_work" | "isbn" | "goodreads";
  epubPath: string;
};

type UnresolvedRow = { calibreId: number; title: string; authors: string[]; epubPath: string };

type Proposal = {
  generatedAt: string;
  userId: string;
  input: string;
  attach: AttachRow[];
  create: CreateRow[];
  unresolved: UnresolvedRow[];
  skipped: SkippedBook[];
};

type ItemRow = {
  id: string;
  title: string | null;
  category: string | null;
  structured: Json;
  url_fingerprint: string;
  file_drive_id: string | null;
  created_at: string;
};

function readOption(args: readonly string[], name: string): string | null {
  const flag = `--${name}`;
  const withEquals = args.find((entry) => entry.startsWith(`${flag}=`));
  if (withEquals) return withEquals.slice(flag.length + 1);
  const index = args.indexOf(flag);
  return index !== -1 && args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function authorsOf(structured: Json): string[] {
  const authors = (structured as { authors?: unknown } | null)?.authors;
  return Array.isArray(authors) ? authors.filter((a): a is string => typeof a === "string" && a.trim() !== "") : [];
}

/** One line of a TSV manifest. Tabs and line breaks in the title become spaces. */
function manifestLine(itemId: string, epubPath: string, title: string): string {
  return [itemId, epubPath, title.replace(/[\t\r\n]+/g, " ").trim()].join("\t");
}

async function loadUserItems(admin: Admin, userId: string): Promise<ItemRow[]> {
  const rows: ItemRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("items")
      .select("id, title, category, structured, url_fingerprint, file_drive_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to read items: ${error.message}`);
    rows.push(...((data ?? []) as ItemRow[]));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

async function getJson(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  await sleep(REQUEST_DELAY_MS);
  if (!res.ok) return { status: res.status, body: null };
  return { status: res.status, body: (await res.json()) as unknown };
}

type Resolution = { url: string; via: CreateRow["resolvedVia"]; title?: string; year?: number };

/**
 * Find a canonical book URL: an Open Library search first, then the ISBN,
 * then the Goodreads id. Returns null when no source gives a URL.
 */
async function resolveBookUrl(book: CalibreBook): Promise<Resolution | null> {
  const title = cleanBookTitle(book.title);
  const surname = book.authors.map(authorSurname).find((s): s is string => !!s);
  const search = new URL("https://openlibrary.org/search.json");
  search.searchParams.set("title", title);
  if (surname) search.searchParams.set("author", surname);
  search.searchParams.set("limit", "3");
  search.searchParams.set("fields", "key,title,author_name,first_publish_year");
  try {
    const { body } = await getJson(search.toString());
    const docs = ((body as { docs?: unknown } | null)?.docs ?? []) as OpenLibraryDoc[];
    const doc = pickOpenLibraryDoc(Array.isArray(docs) ? docs : [], book);
    if (doc) {
      return {
        url: `https://openlibrary.org${doc.key}`,
        via: "openlibrary_search",
        title: doc.title,
        year: typeof doc.first_publish_year === "number" ? doc.first_publish_year : undefined,
      };
    }
  } catch (err) {
    console.warn(`  search failed for "${book.title}": ${err instanceof Error ? err.message : err}`);
  }

  const isbn = normalizeIsbn(book.identifiers.isbn);
  if (isbn) {
    try {
      const { status, body } = await getJson(`https://openlibrary.org/isbn/${isbn}.json`);
      const works = (body as { works?: { key?: unknown }[] } | null)?.works;
      const workKey = Array.isArray(works) ? works[0]?.key : null;
      if (typeof workKey === "string" && /^\/works\/OL\d+W$/.test(workKey)) {
        return { url: `https://openlibrary.org${workKey}`, via: "isbn_work" };
      }
      if (status !== 404) return { url: `https://openlibrary.org/isbn/${isbn}`, via: "isbn" };
    } catch {
      return { url: `https://openlibrary.org/isbn/${isbn}`, via: "isbn" };
    }
  }

  const goodreads = goodreadsId(book.identifiers);
  if (goodreads) return { url: `https://www.goodreads.com/book/show/${goodreads}`, via: "goodreads" };
  return null;
}

async function dryRun(args: readonly string[]): Promise<void> {
  const input = readOption(args, "input");
  const userId = readOption(args, "user");
  const outDir = readOption(args, "out-dir") ?? ".backfill";
  if (!input || !userId) throw new Error("A dry run needs --input <calibre-books.json> and --user <uuid>");

  const books = JSON.parse(readFileSync(input, "utf8")) as CalibreBook[];
  if (!Array.isArray(books)) throw new Error(`${input}: expected an array of books`);

  const admin = createAdminClient();
  const rows = await loadUserItems(admin, userId);
  const libraryBooks: LibraryBook[] = rows
    .filter((row) => row.category === "books")
    .map((row) => ({
      id: row.id,
      title: row.title,
      authors: authorsOf(row.structured),
      hasFile: row.file_drive_id !== null,
      createdAt: row.created_at,
    }));
  console.log(`Read ${books.length} Calibre books, ${rows.length} items, ${libraryBooks.length} book items (dry run, no writes)`);

  const plan = planCalibreMatches(books, libraryBooks);
  const usedItems = new Set(plan.matched.map((m) => m.item.id));
  for (const s of plan.skipped) if (s.itemId) usedItems.add(s.itemId);
  const byFingerprint = new Map(rows.map((row) => [row.url_fingerprint, row]));

  const attach: AttachRow[] = plan.matched.map(({ book, item }) => ({
    itemId: item.id,
    itemTitle: item.title,
    calibreId: book.calibre_id,
    calibreTitle: book.title,
    epubPath: book.epub_path as string,
    matchedBy: "title",
  }));
  const create: CreateRow[] = [];
  const unresolved: UnresolvedRow[] = [];
  const skipped: SkippedBook[] = [...plan.skipped];
  const createFingerprints = new Map<string, number>();

  console.log(`Resolving ${plan.unmatched.length} unmatched books on Open Library...`);
  for (const book of plan.unmatched) {
    const epubPath = book.epub_path as string;
    const authors = book.authors.map(displayAuthorName);
    const resolution = await resolveBookUrl(book);
    if (!resolution) {
      console.log(`  ? ${book.title}`);
      unresolved.push({ calibreId: book.calibre_id, title: book.title, authors, epubPath });
      continue;
    }

    const fp = fingerprint(normalizeUrl(resolution.url));
    const existing = byFingerprint.get(fp);
    if (existing) {
      if (usedItems.has(existing.id)) {
        skipped.push({ calibreId: book.calibre_id, calibreTitle: book.title, reason: "item_already_matched", itemId: existing.id, epubPath });
      } else if (existing.file_drive_id !== null) {
        usedItems.add(existing.id);
        skipped.push({ calibreId: book.calibre_id, calibreTitle: book.title, reason: "item_has_file", itemId: existing.id, epubPath });
      } else {
        usedItems.add(existing.id);
        attach.push({
          itemId: existing.id,
          itemTitle: existing.title,
          calibreId: book.calibre_id,
          calibreTitle: book.title,
          epubPath,
          matchedBy: "url_fingerprint",
        });
      }
      console.log(`  = ${book.title} -> existing item ${existing.id}`);
      continue;
    }

    const duplicateOf = createFingerprints.get(fp);
    if (duplicateOf !== undefined) {
      skipped.push({ calibreId: book.calibre_id, calibreTitle: book.title, reason: "duplicate_calibre_book", duplicateOf, epubPath });
      continue;
    }
    createFingerprints.set(fp, book.calibre_id);

    create.push({
      calibreId: book.calibre_id,
      title: resolution.title?.trim() || cleanBookTitle(book.title),
      authors,
      year: resolution.year ?? calibreYear(book.year),
      series: book.series?.trim() || null,
      seriesIndex: typeof book.series_index === "number" && book.series_index > 0 ? book.series_index : null,
      isbn: normalizeIsbn(book.identifiers.isbn),
      url: resolution.url,
      resolvedVia: resolution.via,
      epubPath,
    });
    console.log(`  + ${book.title} -> ${resolution.url} (${resolution.via})`);
  }

  const proposal: Proposal = { generatedAt: new Date().toISOString(), userId, input: path.resolve(input), attach, create, unresolved, skipped };
  const file = writeJson(outDir, `import-calibre-${stamp()}.json`, proposal);

  console.log("\nSummary");
  console.log(`  attach: ${attach.length} (${attach.filter((a) => a.matchedBy === "url_fingerprint").length} by URL fingerprint)`);
  console.log(`  create: ${create.length}`);
  console.log(`  unresolved: ${unresolved.length}`);
  console.log(`  skipped: ${skipped.length}`);
  for (const row of unresolved) console.log(`    unresolved: ${row.title}`);
  for (const row of skipped) console.log(`    skipped (${row.reason}): ${row.calibreTitle}`);
  console.log(`\nProposal: ${file}`);
  console.log(`Apply with: npm run books:import-calibre -- --apply --from ${file}`);
}

function parseProposal(file: string): Proposal {
  const value = JSON.parse(readFileSync(file, "utf8")) as Partial<Proposal>;
  if (!value || typeof value.userId !== "string" || !Array.isArray(value.create) || !Array.isArray(value.attach)) {
    throw new Error(`${file}: not an import-calibre proposal`);
  }
  return value as Proposal;
}

async function apply(args: readonly string[]): Promise<void> {
  const from = readOption(args, "from");
  if (!from) throw new Error("--apply needs --from <proposal.json>");
  const outDir = readOption(args, "out-dir") ?? ".backfill";
  const enrich = !args.includes("--no-enrich");
  const proposal = parseProposal(from);
  const { userId } = proposal;
  console.log(`Proposal ${from}: ${proposal.create.length} rows to create, ${proposal.attach.length} to attach (APPLY)`);

  const admin = createAdminClient();
  // checkQuota passes when count < max. This max passes when count + new rows <= MAX_ITEMS_PER_USER.
  const quota = await checkQuota(admin, userId, "items", MAX_ITEMS_PER_USER - proposal.create.length + 1);
  if (!quota.ok) throw new Error("The new rows would exceed the item quota");

  const manifest: string[] = proposal.attach.map((row) => manifestLine(row.itemId, row.epubPath, row.itemTitle ?? row.calibreTitle));
  const created: { id: string; calibreId: number; title: string; url: string; epubPath: string }[] = [];
  const existing: { id: string; calibreId: number; title: string; url: string }[] = [];
  const failed: { calibreId: number; title: string; error: string }[] = [];

  for (const row of proposal.create) {
    let canonical: string;
    try {
      canonical = normalizeUrl(row.url);
    } catch {
      failed.push({ calibreId: row.calibreId, title: row.title, error: "invalid_url" });
      continue;
    }
    const fp = fingerprint(canonical);

    // A row with this URL can exist since the dry run. Attach to it instead.
    const { data: hit, error: hitErr } = await admin
      .from("items")
      .select("id, title")
      .eq("user_id", userId)
      .eq("url_fingerprint", fp)
      .maybeSingle();
    if (hitErr) {
      failed.push({ calibreId: row.calibreId, title: row.title, error: hitErr.message });
      continue;
    }
    if (hit) {
      existing.push({ id: hit.id, calibreId: row.calibreId, title: hit.title ?? row.title, url: row.url });
      manifest.push(manifestLine(hit.id, row.epubPath, hit.title ?? row.title));
      console.log(`  = ${row.title}: item ${hit.id} has this URL, attach only`);
      continue;
    }

    // Calibre data fills the card until enrichment runs. Enrichment replaces
    // `structured`; it reads only `capture_category_hint` from it.
    const structured: Record<string, Json> = { capture_category_hint: "books" };
    if (row.authors.length > 0) structured.authors = row.authors;
    if (row.year) structured.published_year = row.year;
    if (row.isbn) structured.isbn = row.isbn;
    if (row.series) structured.series = row.series;
    if (row.series && row.seriesIndex) structured.series_index = row.seriesIndex;

    const { data: inserted, error: insertErr } = await admin
      .from("items")
      .insert({
        user_id: userId,
        url: row.url,
        canonical_url: canonical,
        url_fingerprint: fp,
        domain: domainFromCanonicalUrl(canonical),
        source: "manual",
        title: row.title,
        subtitle: chooseSubtitle("books", structured, null),
        category: "books",
        note: null,
        status: "inbox",
        processing_status: "pending",
        structured: structured as Json,
      })
      .select("id")
      .single();
    if (insertErr || !inserted) {
      failed.push({ calibreId: row.calibreId, title: row.title, error: insertErr?.message ?? "insert_failed" });
      console.warn(`  ! ${row.title}: ${insertErr?.message ?? "insert_failed"}`);
      continue;
    }
    created.push({ id: inserted.id, calibreId: row.calibreId, title: row.title, url: row.url, epubPath: row.epubPath });
    manifest.push(manifestLine(inserted.id, row.epubPath, row.title));
    console.log(`  + ${row.title} -> ${inserted.id}`);
  }

  const runStamp = stamp();
  mkdirSync(outDir, { recursive: true });
  const manifestFile = path.resolve(outDir, `import-calibre-manifest-${runStamp}.tsv`);
  writeFileSync(manifestFile, `# itemId\tepubPath\ttitle (from ${path.basename(from)})\n${manifest.join("\n")}\n`);
  const applied = { appliedAt: new Date().toISOString(), from: path.resolve(from), userId, created, existing, failed, enrich: {} as Record<string, string> };
  const appliedName = `import-calibre-applied-${runStamp}.json`;
  let appliedFile = writeJson(outDir, appliedName, applied);

  if (enrich) {
    console.log(`\nEnriching ${created.length} new rows, one at a time...`);
    for (const row of created) {
      const outcome = await enrichItem(row.id);
      applied.enrich[row.id] = outcome;
      console.log(`  ${outcome.padEnd(13)} ${row.title}`);
    }
    appliedFile = writeJson(outDir, appliedName, applied);
  }

  console.log("\nSummary");
  console.log(`  created: ${created.length}`);
  console.log(`  already present (attach only): ${existing.length}`);
  console.log(`  failed: ${failed.length}`);
  console.log(`  manifest lines: ${manifest.length}`);
  console.log(`\nManifest: ${manifestFile}`);
  console.log(`Applied:  ${appliedFile}`);
  console.log(`Next: npm run book:attach -- --manifest ${manifestFile} --dir /`);
}

async function run() {
  const args = process.argv.slice(2);
  if (args.includes("--apply")) await apply(args);
  else await dryRun(args);
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
