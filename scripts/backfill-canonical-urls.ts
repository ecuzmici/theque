/**
 * Apply the current `normalizeUrl` rules to stored items. A rule change (for
 * example the host rules for IMDb, Goodreads, and Amazon) leaves old rows
 * with the old canonical URL, so the duplicate check misses them.
 *
 * For each row the script normalizes `canonical_url` again. When the
 * canonical URL changes, it recomputes the fingerprint and the domain and
 * updates the row. A row whose canonical URL stays the same keeps its
 * stored fingerprint and domain, even if they differ (seed rows); the
 * script counts those rows as `drift_only`.
 * When the new fingerprint collides with another row of the same user
 * (unique constraint), it skips the row and reports the pair of ids.
 *
 * Usage (dry-run is the default; it prints counts and item ids only):
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/backfill-canonical-urls.ts [--apply]
 */

import { createAdminClient } from "../src/lib/supabase/admin";
import { domainFromCanonicalUrl } from "../src/lib/url/domain";
import { fingerprint } from "../src/lib/url/fingerprint";
import { normalizeUrl } from "../src/lib/url/normalize";

const apply = process.argv.includes("--apply");
const PAGE = 500;

type Row = {
  id: string;
  user_id: string;
  url: string;
  canonical_url: string | null;
  url_fingerprint: string;
  domain: string;
};

async function run() {
  const admin = createAdminClient();
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("items")
      .select("id, user_id, url, canonical_url, url_fingerprint, domain")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`query_failed: ${error.message}`);
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) break;
  }

  // Fingerprints in use per user, before any change.
  const taken = new Map<string, string>();
  for (const row of rows) taken.set(`${row.user_id}:${row.url_fingerprint}`, row.id);

  let changed = 0;
  let updated = 0;
  let failed = 0;
  let invalid = 0;
  let driftOnly = 0;
  const collisions: Array<[string, string]> = [];

  for (const row of rows) {
    let canonical: string;
    try {
      canonical = normalizeUrl(row.canonical_url ?? row.url);
    } catch {
      invalid += 1;
      continue;
    }
    const fp = fingerprint(canonical);
    const domain = domainFromCanonicalUrl(canonical);
    if (canonical === row.canonical_url) {
      if (fp !== row.url_fingerprint || domain !== row.domain) driftOnly += 1;
      continue;
    }

    const owner = taken.get(`${row.user_id}:${fp}`);
    if (owner && owner !== row.id) {
      collisions.push([row.id, owner]);
      continue;
    }
    changed += 1;
    if (!apply) continue;

    const { error } = await admin
      .from("items")
      .update({ canonical_url: canonical, url_fingerprint: fp, domain })
      .eq("id", row.id);
    if (error) {
      failed += 1;
      continue;
    }
    updated += 1;
    taken.delete(`${row.user_id}:${row.url_fingerprint}`);
    taken.set(`${row.user_id}:${fp}`, row.id);
  }

  console.log(
    JSON.stringify({
      mode: apply ? "apply" : "dry-run",
      scanned: rows.length,
      changed,
      updated,
      failed,
      invalid,
      drift_only: driftOnly,
      collisions,
    }),
  );
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : "unknown_error");
  process.exit(1);
});
