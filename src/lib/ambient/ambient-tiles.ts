import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { getDisplayImageUrl } from "@/lib/item-display";

/**
 * A single tile on the ambient wall: a resolved cover image and/or the item's
 * extracted `dominant_color`. Tiles with neither are dropped — a blank cell
 * breaks the mosaic rather than filling it.
 */
export type AmbientTile = {
  id: string;
  src: string | null;
  color: string | null;
  title: string | null;
};

/** Slim row shape the ambient fetch reads; a subset of `items`. */
export type AmbientRow = {
  id: string;
  title: string | null;
  image_url: string | null;
  image_storage_path: string | null;
  dominant_color: string | null;
};

/** Hard cap on rendered tiles so the DOM stays light on any library size. */
export const MAX_AMBIENT_TILES = 72;
/** Pulled before capping so the hue-ordered spectrum is a true cross-section. */
export const AMBIENT_FETCH_LIMIT = 240;

/**
 * Pure: map slim item rows into wall tiles, keep only those that can actually
 * show something (a cover or a color), and cap at `max`. Fetch order is
 * preserved — callers order by `dominant_hue` so the wall reads as a calm walk
 * around the color wheel.
 */
export function buildAmbientTiles(rows: AmbientRow[], max = MAX_AMBIENT_TILES): AmbientTile[] {
  const tiles: AmbientTile[] = [];
  for (const row of rows) {
    if (tiles.length >= max) break;
    const src = getDisplayImageUrl(row.image_storage_path, row.image_url);
    const color = row.dominant_color;
    if (!src && !color) continue;
    tiles.push({ id: row.id, src, color: color ?? null, title: row.title });
  }
  return tiles;
}

/**
 * Load the signed-in user's library (RLS-scoped) as ambient tiles. Non-dismissed
 * items ordered by `dominant_hue` (the same cross-section the Spine Band draws),
 * so the wall flows as a spectrum with covers carrying it.
 */
export async function fetchAmbientTiles(
  supabase: SupabaseClient<Database>,
  max = MAX_AMBIENT_TILES,
): Promise<AmbientTile[]> {
  const { data, error } = await supabase
    .from("items")
    .select("id, title, image_url, image_storage_path, dominant_color")
    .neq("status", "dismissed")
    .order("dominant_hue", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(AMBIENT_FETCH_LIMIT);

  if (error) throw error;
  return buildAmbientTiles((data ?? []) as AmbientRow[], max);
}
