/**
 * Backfill cached covers (image_storage_path) and dominant colors for items
 * that have an image_url but are missing either.
 *
 * Usage:
 *   npm run backfill:images -- [--dry-run] [--limit N]
 *
 * (The npm script passes --conditions=react-server so the "server-only"
 * guard in the imported modules resolves to its no-op build under tsx.)
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env (or .env.local).
 */

import { loadEnvConfig } from "@next/env";

import { createAdminClient } from "../src/lib/supabase/admin";
import { cacheItemImage } from "../src/lib/enrichment/image-cache";

loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit=") || a === "--limit");
const limitIdx = args.indexOf("--limit");
const limit = limitArg?.includes("=")
  ? Number.parseInt(limitArg.split("=")[1], 10)
  : limitIdx !== -1
    ? Number.parseInt(args[limitIdx + 1], 10)
    : 200;

async function run() {
  const admin = createAdminClient();

  const { data: rows, error } = await admin
    .from("items")
    .select("id, user_id, image_url")
    .not("image_url", "is", null)
    .or("image_storage_path.is.null,dominant_color.is.null")
    .eq("processing_status", "ready")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to fetch items:", error.message);
    process.exit(1);
  }

  const candidates = (rows ?? []).filter((r) => r.image_url);
  console.log(`Found ${candidates.length} items to backfill${dryRun ? " (dry-run)" : ""}`);

  let cached = 0;
  let skipped = 0;

  for (const row of candidates) {
    if (dryRun) {
      console.log(`  [dry-run] Would cache: ${row.id} → ${row.image_url}`);
      continue;
    }

    const cachedImage = await cacheItemImage(admin, row.user_id, row.id, row.image_url!);
    if (cachedImage.storagePath) {
      const { error: updateErr } = await admin
        .from("items")
        .update({
          image_storage_path: cachedImage.storagePath,
          dominant_color: cachedImage.dominantColor,
          dominant_hue: cachedImage.dominantHue,
        })
        .eq("id", row.id);
      if (updateErr) {
        console.warn(`  Failed to update ${row.id}:`, updateErr.message);
        skipped++;
      } else {
        console.log(`  Cached ${row.id} → ${cachedImage.storagePath}`);
        cached++;
      }
    } else {
      console.log(`  Skipped (fetch/upload failed): ${row.id}`);
      skipped++;
    }
  }

  if (!dryRun) {
    console.log(`\nDone. cached=${cached}, skipped=${skipped}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
