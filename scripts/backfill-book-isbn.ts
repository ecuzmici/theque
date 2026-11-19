/**
 * Book ISBN backfill.
 *
 * Gives each book in the library a valid ISBN, so that the Goodreads link on
 * the detail page opens the book page directly. For each book without a valid
 * ISBN, the script asks the same resolvers that enrichment uses:
 *
 * 1. Hardcover: the ISBN of the default edition (usually the first English
 *    hardcover).
 * 2. Google Books: the ISBN of the first English volume with the same title.
 *
 * The script accepts a match only when the authors overlap with the stored
 * authors. When the book has no stored authors, it accepts only an exact
 * title. A valid ISBN that has hyphens is stored without them. An ISBN that
 * the LLM gave from memory counts as missing, because 3 of the 4 such ISBNs
 * had a bad check digit. An invalid ISBN stays when no resolver finds a
 * replacement. No page fetch, no LLM.
 *
 * Usage:
 *   npm run backfill:isbn                    # dry-run: writes nothing
 *   npm run backfill:isbn -- --apply         # write the ISBNs
 *   npm run backfill:isbn -- --limit=20
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and
 * HARDCOVER_API_KEY. GOOGLE_BOOKS_API_KEY is optional but the keyless quota is
 * often empty.
 */

import { loadEnvConfig } from "@next/env";

import type { Json } from "../src/lib/database.types";
import { cleanDisplayTitle } from "../src/lib/display-title";
import { resolveBooks } from "../src/lib/enrichment/resolvers/google-books";
import { resolveHardcover } from "../src/lib/enrichment/resolvers/hardcover";
import { authorsOverlap, titleScore } from "../src/lib/enrichment/resolvers/title-match";
import type { ResolverPatch } from "../src/lib/enrichment/resolvers/types";
import { normalizeIsbn } from "../src/lib/isbn";
import { createAdminClient } from "../src/lib/supabase/admin";

loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number.parseInt(limitArg.split("=")[1]!, 10) : 1000;

/** Hardcover allows about 60 requests a minute, and each book costs 2. */
const PAUSE_MS = 2100;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && !!v.trim()) : [];
}

/** True when the resolver patch is about the same book as the stored row. */
function sameBook(patch: ResolverPatch, title: string, authors: string[]): boolean {
  const found = stringList(patch.structured?.authors);
  if (authors.length > 0) return authorsOverlap(authors, found) || authorsOverlap(found, authors);
  return typeof patch.title === "string" && titleScore(patch.title, title) === 2;
}

type Found = { isbn: string; source: string } | { isbn: null; reason: string };

async function findIsbn(row: { canonical_url: string }, title: string, authors: string[]): Promise<Found> {
  const input = { canonicalUrl: row.canonical_url, title, structured: { authors } };

  const hardcover = await resolveHardcover(input);
  const hcIsbn = normalizeIsbn(hardcover?.structured?.isbn);
  if (hardcover && hcIsbn) {
    if (sameBook(hardcover, title, authors)) return { isbn: hcIsbn, source: "hardcover" };
  }

  const google = await resolveBooks(input);
  const gbIsbn = normalizeIsbn(google?.structured?.isbn);
  if (google && gbIsbn) {
    // Google Books often omits the title in the patch, so check the authors only.
    const gbAuthors = stringList(google.structured?.authors);
    if (authors.length === 0 || authorsOverlap(authors, gbAuthors) || authorsOverlap(gbAuthors, authors)) {
      return { isbn: gbIsbn, source: "google_books" };
    }
    return { isbn: null, reason: `google author mismatch (${gbAuthors.join(", ")})` };
  }

  if (hardcover && hcIsbn) {
    return { isbn: null, reason: `hardcover author mismatch (${stringList(hardcover.structured?.authors).join(", ")})` };
  }
  return { isbn: null, reason: "no resolver match" };
}

async function run() {
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("items")
    .select("id, title, structured, raw_metadata, canonical_url, domain")
    .eq("category", "books")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("Failed to fetch items:", error.message);
    process.exit(1);
  }

  const books = rows ?? [];
  console.log(`Scanning ${books.length} books${apply ? " (APPLY)" : " (dry-run, no writes)"}\n`);

  let normalized = 0;
  let filled = 0;
  let missed = 0;
  let failed = 0;

  for (const row of books) {
    const structured = asRecord(row.structured);
    const stored = structured.isbn;
    const fromMemory = asRecord(asRecord(asRecord(row.raw_metadata).llm).field_sources).isbn === "model_knowledge";
    const valid = fromMemory ? null : normalizeIsbn(stored);

    let next: string | null = null;
    let note = "";

    if (valid) {
      if (valid === stored) continue;
      next = valid;
      note = `normalize ${String(stored)} -> ${valid}`;
      normalized++;
      console.log(`  NORM  ${row.title ?? row.id}: ${note}`);
    } else {
      const title = cleanDisplayTitle(row.title ?? "").trim();
      if (!title) continue;
      const authors = stringList(structured.authors);
      const found = await findIsbn(row, title, authors);
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
      if (found.isbn === null) {
        missed++;
        console.log(`  MISS  ${title} — ${authors.join(", ") || "no authors"} [${row.domain}] (${found.reason})`);
        continue;
      }
      next = found.isbn;
      note = `${found.source}${stored ? ` (replaces ${fromMemory ? "memory" : "invalid"} ${String(stored)})` : ""}`;
      filled++;
      console.log(`  FILL  ${title} — ${authors.join(", ") || "no authors"} -> ${next} via ${note}`);
    }

    if (!apply) continue;
    const { error: updateError } = await admin
      .from("items")
      .update({ structured: { ...structured, isbn: next } as Json })
      .eq("id", row.id);
    if (updateError) {
      failed++;
      console.error(`  FAIL  ${row.id}: ${updateError.message}`);
    }
  }

  console.log(
    `\nDone. filled=${filled} normalized=${normalized} missed=${missed} failed=${failed}` +
      (apply ? "" : " (dry-run: nothing written; pass --apply to write)"),
  );
}

void run();
