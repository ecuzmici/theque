/**
 * Find and remove cover objects in the `item-images` bucket that no item row
 * points at. An object is an orphan when no `items.image_storage_path` equals
 * its name. Deleted items left these objects before item DELETE removed them.
 *
 * The script uses the Storage API. A delete of `storage.objects` rows in SQL
 * does not delete the files.
 *
 * Usage (dry-run is the default; it prints counts and bytes only):
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/purge-orphan-covers.ts [--apply]
 */

import { createAdminClient } from "../src/lib/supabase/admin";

const BUCKET = "item-images";
const PAGE = 1000;
const apply = process.argv.includes("--apply");

type Entry = { name: string; id: string | null; metadata?: { size?: number } | null };

async function run() {
  const admin = createAdminClient();
  const bucket = admin.storage.from(BUCKET);

  // Every path that a row points at.
  const referenced = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("items")
      .select("image_storage_path")
      .not("image_storage_path", "is", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`items_query_failed: ${error.message}`);
    for (const row of data ?? []) if (row.image_storage_path) referenced.add(row.image_storage_path);
    if (!data || data.length < PAGE) break;
  }

  async function list(path: string): Promise<Entry[]> {
    const out: Entry[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await bucket.list(path, { limit: PAGE, offset });
      if (error) throw new Error(`storage_list_failed: ${error.message}`);
      out.push(...((data ?? []) as Entry[]));
      if (!data || data.length < PAGE) break;
    }
    return out;
  }

  // Layout: <userId>/<itemId>/cover.<ext>
  const orphans: { path: string; bytes: number }[] = [];
  let scanned = 0;
  for (const user of await list("")) {
    if (user.id !== null) continue;
    for (const item of await list(`${user.name}/`)) {
      if (item.id !== null) continue;
      for (const file of await list(`${user.name}/${item.name}/`)) {
        if (file.id === null) continue;
        scanned += 1;
        const path = `${user.name}/${item.name}/${file.name}`;
        if (!referenced.has(path)) orphans.push({ path, bytes: file.metadata?.size ?? 0 });
      }
    }
  }

  let removed = 0;
  let failed = 0;
  if (apply) {
    for (let i = 0; i < orphans.length; i += 100) {
      const batch = orphans.slice(i, i + 100).map((o) => o.path);
      const { error } = await bucket.remove(batch);
      if (error) failed += batch.length;
      else removed += batch.length;
    }
  }

  console.log(
    JSON.stringify({
      mode: apply ? "apply" : "dry-run",
      scanned,
      orphans: orphans.length,
      orphan_bytes: orphans.reduce((n, o) => n + o.bytes, 0),
      removed,
      failed,
    }),
  );
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : "unknown_error");
  process.exit(1);
});
