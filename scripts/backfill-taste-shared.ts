/**
 * Shared file and apply helpers for the two taste backfill scripts (ADR 0020).
 * The scripts print a summary, write a proposal file, and apply a proposal file.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Json } from "../src/lib/database.types";
import {
  buildApplyPlan,
  chunk,
  parseProposal,
  sortedHistogram,
  summarizeProposal,
  type BackupRow,
  type ProposalRow,
} from "../src/lib/taste/backfill";
import { createAdminClient } from "../src/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function writeJson(dir: string, name: string, value: unknown): string {
  mkdirSync(dir, { recursive: true });
  const file = path.resolve(dir, name);
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

export function printSummary(proposal: readonly ProposalRow[], extra: Record<string, string | number>): void {
  const summary = summarizeProposal(proposal);
  console.log("\nSummary");
  console.log(`  rows to change: ${summary.rows}`);
  console.log(
    `  keys per row: min ${summary.keysPerRow.min}, max ${summary.keysPerRow.max}, mean ${summary.keysPerRow.mean}`,
  );
  for (const [label, value] of Object.entries(extra)) console.log(`  ${label}: ${value}`);
  for (const [label, histogram] of [
    ["genre keys", summary.genreHistogram],
    ["mood keys", summary.moodHistogram],
  ] as const) {
    const entries = sortedHistogram(histogram);
    if (entries.length === 0) continue;
    console.log(`  ${label}: ${entries.map(([key, n]) => `${key}=${n}`).join(", ")}`);
  }
  console.log("\nSample rows");
  for (const row of proposal.slice(0, 5)) {
    console.log(`  ${row.id} ${JSON.stringify(row.title)}`);
    console.log(`    before ${JSON.stringify(row.before)}`);
    console.log(`    after  ${JSON.stringify(row.after)}`);
  }
}

/**
 * Apply a proposal file. Writes a backup of each changed row first. Makes no
 * external call other than the database. A row that changed since the dry run
 * is skipped.
 */
export async function applyProposalFile(admin: Admin, from: string, outDir: string, tag: string): Promise<void> {
  const proposal = parseProposal(JSON.parse(readFileSync(from, "utf8")));
  console.log(`Proposal ${from}: ${proposal.length} rows (APPLY)`);

  const current: BackupRow[] = [];
  for (const ids of chunk(
    proposal.map((p) => p.id),
    100,
  )) {
    const { data, error } = await admin
      .from("items")
      .select("id, structured, genre_keys, mood_keys, taste_tagged_at")
      .in("id", ids);
    if (error) throw new Error(`Failed to read current rows: ${error.message}`);
    current.push(...(data ?? []));
  }

  const plan = buildApplyPlan(proposal, current);
  for (const skip of plan.skipped) console.warn(`  skip ${skip.id}: ${skip.reason}`);
  if (plan.writes.length === 0) {
    console.log("Nothing to write.");
    return;
  }

  const backupFile = writeJson(outDir, `${tag}-backup-${stamp()}.json`, plan.backups);
  console.log(`Backup of ${plan.backups.length} rows: ${backupFile}`);

  let written = 0;
  let failed = 0;
  for (const write of plan.writes) {
    const { error } = await admin
      .from("items")
      .update(write.patch as { structured?: Json; genre_keys?: string[]; mood_keys?: string[]; taste_tagged_at?: string | null })
      .eq("id", write.id);
    if (error) {
      console.warn(`  ! write failed ${write.id}: ${error.message}`);
      failed++;
    } else {
      written++;
    }
  }
  console.log(`Done. written=${written}, failed=${failed}, skipped=${plan.skipped.length}`);
}
