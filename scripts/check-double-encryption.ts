/**
 * Find `note` / `verdict` values that were encrypted twice (ADR 0013).
 * A client that sent ciphertext back to the API caused this: the server
 * encrypted the ciphertext again.
 *
 * Usage (dry-run is the default; it prints counts only):
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/check-double-encryption.ts [--apply]
 *
 * --apply writes the single-encrypted value back to each affected row.
 */

import { decryptField } from "../src/lib/crypto/field-crypto";
import { createAdminClient } from "../src/lib/supabase/admin";

const apply = process.argv.includes("--apply");
const PAGE = 500;

async function run() {
  const admin = createAdminClient();
  let scanned = 0;
  let affected = 0;
  let fixed = 0;
  let failed = 0;

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("items")
      .select("id, note, verdict")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`query_failed: ${error.message}`);
    if (!data?.length) break;

    for (const row of data) {
      for (const field of ["note", "verdict"] as const) {
        const stored = row[field];
        if (!stored) continue;
        scanned += 1;
        let once: string | null;
        try {
          once = decryptField(stored);
        } catch {
          failed += 1;
          continue;
        }
        if (!once || !/^enc\.v\d+\./.test(once)) continue;
        affected += 1;
        if (!apply) continue;
        // `once` is the single-encrypted value. Store it as is.
        const { error: upErr } = await admin
          .from("items")
          .update(field === "note" ? { note: once } : { verdict: once })
          .eq("id", row.id);
        if (upErr) failed += 1;
        else fixed += 1;
      }
    }
    if (data.length < PAGE) break;
  }

  console.log(
    JSON.stringify({ mode: apply ? "apply" : "dry-run", scanned, double_encrypted: affected, fixed, failed }),
  );
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : "unknown_error");
  process.exit(1);
});
