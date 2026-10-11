/**
 * Item text backfill (issues #76 and #77).
 *
 * 1. IMDb items: removes the year, rating and genres that the page title put
 *    into the item title. It fills `structured.year` and `structured.genres`
 *    from the title when they are empty.
 * 2. movies_and_tv and books items: rebuilds the subtitle from `structured`,
 *    so every byline uses the "Name · Year" format.
 *
 * Usage:
 *   npm run backfill:item-text              # dry run (default): writes NOTHING
 *   npm run backfill:item-text -- --apply   # writes the changes
 *   npm run backfill:item-text -- --limit=50
 *
 * Run `npm run backfill:crew -- --apply` first, so the subtitles use corrected directors.
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env (or .env.local).
 */

import { loadEnvConfig } from "@next/env";

import type { ItemCategory, Json } from "../src/lib/database.types";
import { parseImdbTitle } from "../src/lib/enrichment/meta-utils";
import { buildSubtitle } from "../src/lib/enrichment/subtitle";
import { createAdminClient } from "../src/lib/supabase/admin";

loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number.parseInt(limitArg.split("=")[1], 10) : 2000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function isImdb(domain: string | null): boolean {
  const host = (domain ?? "").toLowerCase();
  return host === "imdb.com" || host.endsWith(".imdb.com");
}

/** Only titles that carry IMDb page-title parts. A plain "(Pilot)" stays. */
const IMDB_JUNK_RE = /⭐|\s\|\s|\s-\sIMDb$|\((?:TV [^()]*)?\d{4}[^()]*\)\s*$/u;

async function run() {
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("items")
    .select("id, domain, category, title, subtitle, structured")
    .in("category", ["movies_and_tv", "books"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to fetch items:", error.message);
    process.exit(1);
  }

  console.log(`Scanning ${(rows ?? []).length} items${apply ? " (APPLY)" : " (dry run, no writes)"}\n`);

  let changedCount = 0;
  let written = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    const structured = asRecord(row.structured);
    const patch: { title?: string; subtitle?: string; structured?: Json } = {};
    const log: string[] = [];

    if (isImdb(row.domain) && row.title && IMDB_JUNK_RE.test(row.title)) {
      const parts = parseImdbTitle(row.title);
      if (parts && parts.title !== row.title) {
        patch.title = parts.title;
        log.push(`title: ${JSON.stringify(row.title)} → ${JSON.stringify(parts.title)}`);
        let structuredChanged = false;
        if (structured.year === undefined && parts.year !== undefined) {
          structured.year = parts.year;
          structuredChanged = true;
          log.push(`year: (empty) → ${parts.year}`);
        }
        if (structured.genres === undefined && parts.genres) {
          structured.genres = parts.genres;
          structuredChanged = true;
          log.push(`genres: (empty) → ${JSON.stringify(parts.genres)}`);
        }
        if (structuredChanged) patch.structured = structured as Json;
      }
    }

    const built = buildSubtitle(row.category as ItemCategory, structured);
    if (built && built !== row.subtitle) {
      patch.subtitle = built;
      log.push(`subtitle: ${JSON.stringify(row.subtitle)} → ${JSON.stringify(built)}`);
    }

    if (log.length === 0) continue;
    changedCount++;
    console.log(`• ${patch.title ?? row.title} (${row.id})`);
    for (const line of log) console.log(`    ${line}`);

    if (apply) {
      const { error: updateErr } = await admin.from("items").update(patch).eq("id", row.id);
      if (updateErr) {
        console.warn(`    ! write failed: ${updateErr.message}`);
        failed++;
      } else {
        written++;
      }
    }
  }

  console.log(
    `\nDone. changed=${changedCount}${apply ? `, written=${written}, failed=${failed}` : " (dry run, rerun with --apply to write)"}`,
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
