/**
 * Backfill cover thumbnails (`thumb.webp` next to each cached `cover.<ext>`).
 * Image caching writes the thumbnail for new covers. This script adds it for
 * covers that were cached before thumbnails existed. The original covers stay
 * as they are.
 *
 * Usage:
 *   npm run backfill:thumbs -- [--dry-run] [--limit N] [--force]
 *
 *   --force writes a thumbnail even when the folder already has one.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env (or .env.local).
 */

import { loadEnvConfig } from "@next/env";

import { uploadCoverThumbnail } from "../src/lib/enrichment/image-cache";
import { COVER_THUMB_NAME } from "../src/lib/item-display";
import { createAdminClient } from "../src/lib/supabase/admin";

loadEnvConfig(process.cwd());

const BUCKET = "item-images";
const PAGE = 500;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? Number.parseInt(args[limitIdx + 1], 10) : Number.POSITIVE_INFINITY;

async function run() {
  const admin = createAdminClient();
  const bucket = admin.storage.from(BUCKET);

  const paths: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("items")
      .select("image_storage_path")
      .not("image_storage_path", "is", null)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to fetch items: ${error.message}`);
    for (const row of data ?? []) if (row.image_storage_path) paths.push(row.image_storage_path);
    if ((data ?? []).length < PAGE) break;
  }

  console.log(`Found ${paths.length} cached covers${dryRun ? " (dry-run)" : ""}`);

  let written = 0;
  let present = 0;
  let failed = 0;
  for (const coverPath of paths) {
    if (written + failed >= limit) break;
    const folder = coverPath.slice(0, coverPath.lastIndexOf("/") + 1);

    if (!force) {
      const { data: entries } = await bucket.list(folder, { limit: 100, offset: 0 });
      if ((entries ?? []).some((e) => e.name === COVER_THUMB_NAME)) {
        present++;
        continue;
      }
    }

    if (dryRun) {
      console.log(`  [dry-run] Would write ${folder}${COVER_THUMB_NAME}`);
      written++;
      continue;
    }

    const { data: blob, error: downloadError } = await bucket.download(coverPath);
    if (downloadError || !blob) {
      console.warn(`  Download failed: ${coverPath}`);
      failed++;
      continue;
    }
    const ok = await uploadCoverThumbnail(admin, folder, new Uint8Array(await blob.arrayBuffer()));
    if (ok) {
      written++;
      console.log(`  Wrote ${folder}${COVER_THUMB_NAME}`);
    } else {
      failed++;
      console.warn(`  Thumbnail failed: ${coverPath}`);
    }
  }

  console.log(`\nDone. written=${written}, already_present=${present}, failed=${failed}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
