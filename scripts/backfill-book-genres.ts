/**
 * Book genre backfill (ADR 0020, decision 6.1).
 *
 * For each book with empty or missing `structured.genres`, look up genres on
 * Hardcover with one batched GraphQL query per batch. The script merges the
 * found genres into `structured.genres` and sets `genre_keys` from the alias
 * table. It makes no LLM call.
 *
 * Usage:
 *   npm run backfill:book-genres                                  # dry run (default): writes nothing to the database
 *   npm run backfill:book-genres -- --limit 10 --max-calls 1      # small dry run
 *   npm run backfill:book-genres -- --apply --from <proposal.json>
 *
 * Options:
 *   --out-dir <dir>   Folder for the proposal and the backup (default .backfill)
 *   --limit N         Scan at most N books
 *   --max-calls N     Send at most N Hardcover requests (default 40)
 *   --apply --from F  Write exactly the rows in proposal F. No Hardcover call.
 *
 * Run this script before backfill:taste-tags. Apply its proposal first.
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
 * HARDCOVER_API_KEY in env (or .env.local).
 */

import { loadEnvConfig } from "@next/env";

import { bookGenreChange, chunk, needsBookGenres, parseBackfillArgs, type BackfillItemRow, type ProposalRow } from "../src/lib/taste/backfill";
import { lookupBookGenres } from "../src/lib/taste/hardcover-genres";
import { createAdminClient } from "../src/lib/supabase/admin";
import { applyProposalFile, printSummary, stamp, writeJson } from "./backfill-taste-shared";

loadEnvConfig(process.cwd());

const BATCH_SIZE = 12;
const DELAY_MS = 1200;

function authorsOf(structured: unknown): string[] {
  const authors = (structured as { authors?: unknown } | null)?.authors;
  return Array.isArray(authors) ? authors.filter((a): a is string => typeof a === "string") : [];
}

async function run() {
  const args = parseBackfillArgs(process.argv.slice(2));
  const admin = createAdminClient();

  if (args.apply) {
    await applyProposalFile(admin, args.from as string, args.outDir, "book-genres");
    return;
  }

  const { data, error } = await admin
    .from("items")
    .select("id, category, title, description, structured, genre_keys, mood_keys, taste_tagged_at")
    .eq("category", "books")
    .order("created_at", { ascending: false })
    .limit(args.limit ?? 1000);
  if (error) {
    console.error("Failed to fetch items:", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as BackfillItemRow[];
  const targets = rows.filter((row) => needsBookGenres(row) && row.title?.trim());
  console.log(`Scanned ${rows.length} books; ${targets.length} have no genres (dry run, no writes)`);

  const proposal: ProposalRow[] = [];
  const misses: string[] = [];
  let calls = 0;

  for (const batch of chunk(targets, BATCH_SIZE)) {
    if (calls >= args.maxCalls) {
      console.log(`Stopped at --max-calls ${args.maxCalls}`);
      break;
    }
    if (calls > 0) await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    calls++;
    try {
      const result = await lookupBookGenres(
        batch.map((row) => ({ id: row.id, title: row.title as string, authors: authorsOf(row.structured) })),
      );
      for (const row of batch) {
        const found = result.genres.get(row.id);
        const change = found ? bookGenreChange(row, found) : null;
        if (change) proposal.push(change);
        else misses.push(`${row.title} (${row.id}): ${result.misses.get(row.id) ?? "no change"}`);
      }
    } catch (err) {
      console.warn(`  ! batch failed: ${err instanceof Error ? err.message : err}`);
      for (const row of batch) misses.push(`${row.title} (${row.id}): batch failed`);
    }
  }

  const file = writeJson(args.outDir, `book-genres-proposal-${stamp()}.json`, proposal);
  printSummary(proposal, { "hardcover requests": calls, "books without a result": misses.length });
  for (const miss of misses.slice(0, 5)) console.log(`  miss ${miss}`);
  console.log(`\nProposal: ${file}\nReview it, then run with --apply --from <file>.`);
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
