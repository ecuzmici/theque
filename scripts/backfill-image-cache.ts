/**
 * Backfill cached covers (image_storage_path) and dominant colors for items
 * that have an image_url but are missing either.
 *
 * Usage:
 *   npm run backfill:images -- [--dry-run] [--limit N] [--recolor]
 *
 *   --recolor re-extracts dominant_color for EVERY imaged item (even ones that
 *   already have a color) — use it to re-apply an improved extraction algorithm.
 *
 * (The npm script passes --conditions=react-server so the "server-only"
 * guard in the imported modules resolves to its no-op build under tsx.)
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env (or .env.local).
 */

import { loadEnvConfig } from "@next/env";

import { createAdminClient } from "../src/lib/supabase/admin";
import { cacheItemImage, extractDominantColorForUrl } from "../src/lib/enrichment/image-cache";

loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const recolor = args.includes("--recolor");
const limitArg = args.find((a) => a.startsWith("--limit=") || a === "--limit");
const limitIdx = args.indexOf("--limit");
const limit = limitArg?.includes("=")
  ? Number.parseInt(limitArg.split("=")[1], 10)
  : limitIdx !== -1
    ? Number.parseInt(args[limitIdx + 1], 10)
    : 200;

async function run() {
  const admin = createAdminClient();

  let query = admin
    .from("items")
    .select("id, user_id, image_url, image_storage_path, dominant_color")
    .not("image_url", "is", null)
    .eq("processing_status", "ready");
  // Default: only items missing a cached cover or a color. --recolor re-extracts
  // every imaged item so an improved extraction algorithm can be re-applied.
  if (!recolor) {
    query = query.or("image_storage_path.is.null,dominant_color.is.null");
  }
  const { data: rows, error } = await query
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
    // Cached cover already present → re-extract color only (no re-upload). In
    // --recolor mode this overwrites an existing color with the new algorithm.
    const colorOnly = Boolean(row.image_storage_path);

    if (dryRun) {
      console.log(`  [dry-run] Would ${colorOnly ? "re-extract color for" : "cache"}: ${row.id} → ${row.image_url}`);
      continue;
    }

    const result = colorOnly
      ? await extractDominantColorForUrl(row.image_url!)
      : await cacheItemImage(admin, row.user_id, row.id, row.image_url!);

    const nextStoragePath = colorOnly ? row.image_storage_path : result.storagePath;
    if (colorOnly ? result.dominantColor : result.storagePath) {
      const { error: updateErr } = await admin
        .from("items")
        .update({
          image_storage_path: nextStoragePath,
          dominant_color: result.dominantColor,
          dominant_hue: result.dominantHue,
        })
        .eq("id", row.id);
      if (updateErr) {
        console.warn(`  Failed to update ${row.id}:`, updateErr.message);
        skipped++;
      } else {
        console.log(`  ${colorOnly ? "Colored" : "Cached"} ${row.id} → ${nextStoragePath ?? result.dominantColor}`);
        cached++;
      }
    } else {
      console.log(`  Skipped (fetch/upload/extraction failed): ${row.id}`);
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
