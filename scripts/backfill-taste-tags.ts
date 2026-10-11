/**
 * Taste tag backfill (ADR 0020, decision 6.2).
 *
 * Phase 1 sets `genre_keys` from the alias table for every books and
 * movies_and_tv item. It makes no LLM call.
 * Phase 2 runs the tagger in batches of 10 for items with null
 * `taste_tagged_at`. It sets `mood_keys`, LLM genre keys (only for a book with
 * no genre key), and `taste_tagged_at`.
 *
 * Usage:
 *   npm run backfill:taste-tags                                   # dry run (default): writes nothing to the database
 *   npm run backfill:taste-tags -- --limit 10 --max-calls 1       # small dry run
 *   npm run backfill:taste-tags -- --apply --from <proposal.json>
 *
 * Options:
 *   --out-dir <dir>   Folder for the proposal and the backup (default .backfill)
 *   --limit N         Scan at most N items
 *   --max-calls N     Make at most N LLM calls (default 40)
 *   --apply --from F  Write exactly the rows in proposal F. No LLM call.
 *
 * Apply the backfill:book-genres proposal first, so books use Hardcover genres.
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and AI_GATEWAY_API_KEY
 * in env (or .env.local). The script reads no note and no verdict.
 */

import { loadEnvConfig } from "@next/env";

import {
  BACKFILL_CATEGORIES,
  chunk,
  genreKeyChange,
  mergeTagResult,
  parseBackfillArgs,
  type BackfillItemRow,
  type ProposalRow,
} from "../src/lib/taste/backfill";
import {
  TAGGER_BATCH_SIZE,
  tagItems,
  taggerInputFromItem,
  type TaggerInput,
} from "../src/lib/taste/tagger";
import { createAdminClient } from "../src/lib/supabase/admin";
import { applyProposalFile, printSummary, stamp, writeJson } from "./backfill-taste-shared";

loadEnvConfig(process.cwd());

async function run() {
  const args = parseBackfillArgs(process.argv.slice(2));
  const admin = createAdminClient();

  if (args.apply) {
    await applyProposalFile(admin, args.from as string, args.outDir, "taste-tags");
    return;
  }

  const { data, error } = await admin
    .from("items")
    .select("id, category, title, description, structured, genre_keys, mood_keys, taste_tagged_at")
    .in("category", [...BACKFILL_CATEGORIES])
    .order("created_at", { ascending: false })
    .limit(args.limit ?? 1000);
  if (error) {
    console.error("Failed to fetch items:", error.message);
    process.exit(1);
  }
  const rows = (data ?? []) as BackfillItemRow[];
  console.log(`Scanned ${rows.length} books and movies_and_tv items (dry run, no writes)`);

  // Phase 1: genre keys from the alias table.
  const phase1 = new Map<string, ProposalRow>();
  for (const row of rows) {
    const change = genreKeyChange(row);
    if (change) phase1.set(row.id, change);
  }
  console.log(`Phase 1: ${phase1.size} items get genre keys from the alias table`);

  // Phase 2: tag the items with null taste_tagged_at.
  const untagged = rows.filter((row) => row.taste_tagged_at === null);
  const inputs = untagged
    .map((row) => ({ row, input: taggerInputFromItem(row) }))
    .filter((e): e is { row: BackfillItemRow; input: TaggerInput } => e.input !== null);
  console.log(`Phase 2: ${inputs.length} items have no taste tags`);

  const merged = new Map<string, ProposalRow>(phase1);
  let calls = 0;
  let failedBatches = 0;
  let untaggedLeft = 0;
  const taggedAt = new Date().toISOString();

  for (const batch of chunk(inputs, TAGGER_BATCH_SIZE)) {
    if (calls >= args.maxCalls) {
      untaggedLeft += batch.length;
      continue;
    }
    calls++;
    try {
      const results = await tagItems(batch.map((e) => e.input));
      const byId = new Map(results.map((r) => [r.id, r]));
      for (const { row } of batch) {
        const result = byId.get(row.id);
        if (!result) {
          untaggedLeft++;
          continue;
        }
        merged.set(row.id, mergeTagResult(row, phase1.get(row.id) ?? null, result, taggedAt));
      }
    } catch (err) {
      failedBatches++;
      untaggedLeft += batch.length;
      console.warn(`  ! tagger batch failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  const proposal = [...merged.values()];
  const file = writeJson(args.outDir, `taste-tags-proposal-${stamp()}.json`, proposal);
  printSummary(proposal, {
    "llm calls made": calls,
    "failed batches": failedBatches,
    "items left untagged": untaggedLeft,
  });
  console.log(`\nProposal: ${file}\nReview it, then run with --apply --from <file>.`);
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
