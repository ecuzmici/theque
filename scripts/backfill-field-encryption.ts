/**
 * One-shot backfill: encrypt pre-existing plaintext `items.note` /
 * `items.verdict` values (ADR 0013, issue #67).
 *
 * Run once after #66 (crypto + write/read boundaries) deploys and
 * `FIELD_ENCRYPTION_KEY` is set in the target environment. Safe to re-run:
 * the predicate below only ever selects rows that still have a plaintext
 * value, so a completed pass reports zero rows changed on the next run.
 *
 * Usage:
 *   npm run backfill:field-encryption
 *   npm run backfill:field-encryption -- --dry-run
 *   npm run backfill:field-encryption -- --batch-size=50 --limit=500
 *
 * (The npm script passes --conditions=react-server so the "server-only"
 * guard in the imported crypto/admin modules resolves to its no-op build
 * under tsx.)
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY +
 * FIELD_ENCRYPTION_KEY in env (or .env.local).
 *
 * Privacy: this script prints ONLY counts. It never logs note/verdict
 * content (plaintext or ciphertext) or item ids alongside content.
 */

import { loadEnvConfig } from "@next/env";

import { encryptField } from "../src/lib/crypto/field-crypto";
import { createAdminClient } from "../src/lib/supabase/admin";

loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

function intArg(flag: string, fallback: number): number {
  const withEquals = args.find((a) => a.startsWith(`${flag}=`));
  if (withEquals) return Number.parseInt(withEquals.split("=")[1], 10);
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return Number.parseInt(args[idx + 1], 10);
  return fallback;
}

const BATCH_SIZE = intArg("--batch-size", 100);
// Safety valve for a bounded test run; unset (Infinity) for a real backfill.
const TOTAL_LIMIT = intArg("--limit", Number.POSITIVE_INFINITY);

// Only rows with a still-plaintext note and/or verdict — an already-encrypted
// value (`enc.%`) never matches, so a row that's fully encrypted is never
// re-selected and a row with one plaintext field + one already-encrypted
// field is selected exactly once and only its plaintext field is touched.
const PLAINTEXT_PREDICATE =
  "and(note.not.is.null,note.not.like.enc.%),and(verdict.not.is.null,verdict.not.like.enc.%)";

async function run() {
  const admin = createAdminClient();

  let scanned = 0;
  let updated = 0;
  let failed = 0;
  // Individual field values encountered on a scanned row that were already
  // `enc.%` and therefore left untouched (the mixed plaintext/encrypted-field
  // case: e.g. plaintext note + already-encrypted verdict on the same row).
  let fieldsAlreadyEncrypted = 0;

  for (;;) {
    if (scanned >= TOTAL_LIMIT) break;

    const remaining = TOTAL_LIMIT - scanned;
    const pageSize = Number.isFinite(remaining) ? Math.min(BATCH_SIZE, remaining) : BATCH_SIZE;

    const { data: rows, error } = await admin
      .from("items")
      .select("id, note, verdict")
      .or(PLAINTEXT_PREDICATE)
      .order("id", { ascending: true })
      .limit(pageSize);

    if (error) {
      console.error("Failed to fetch items:", error.message);
      process.exit(1);
    }

    if (!rows || rows.length === 0) break;
    scanned += rows.length;

    for (const row of rows) {
      const update: { note?: string; verdict?: string } = {};

      if (row.note !== null) {
        if (row.note.startsWith("enc.")) {
          fieldsAlreadyEncrypted++;
        } else {
          update.note = encryptField(row.note);
        }
      }
      if (row.verdict !== null) {
        if (row.verdict.startsWith("enc.")) {
          fieldsAlreadyEncrypted++;
        } else {
          update.verdict = encryptField(row.verdict);
        }
      }

      if (Object.keys(update).length === 0) {
        // Predicate guarantees at least one plaintext field; nothing to do
        // defensively, but don't count it as updated.
        continue;
      }

      if (dryRun) {
        updated++;
        continue;
      }

      const { error: updateErr } = await admin.from("items").update(update).eq("id", row.id);
      if (updateErr) {
        // Never log the row id alongside content; the error message itself
        // is a driver/db error, not user content.
        console.warn("  Failed to update a row:", updateErr.message);
        failed++;
      } else {
        updated++;
      }
    }

    // In dry-run mode the predicate never shrinks (we don't write), so a
    // single page is enough to report a representative count without
    // looping forever.
    if (dryRun) break;
  }

  console.log(`Rows scanned: ${scanned}`);
  console.log(`Rows updated: ${updated}${dryRun ? " (dry-run — no writes)" : ""}`);
  console.log(`Fields already encrypted (skipped): ${fieldsAlreadyEncrypted}`);
  if (failed > 0) console.log(`Rows failed to update: ${failed}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
