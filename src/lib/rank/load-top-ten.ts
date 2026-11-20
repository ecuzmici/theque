import "server-only";

import { cleanDisplayTitle } from "@/lib/display-title";
import { getCoverImageUrls } from "@/lib/item-display";
import type { createClient } from "@/lib/supabase/server";

import { RANK_CATEGORIES, type RankCategory, topTen, type TopTenEntry } from "./top-ten";

export type TopTens = Record<RankCategory, TopTenEntry[]>;

/**
 * Loads the top 10 books and films for the signed-in user. The caller gives
 * the session client, so RLS limits the rows to that user. The query reads no
 * encrypted field (ADR 0013).
 */
export async function loadTopTens(supabase: Awaited<ReturnType<typeof createClient>>): Promise<TopTens> {
  const { data, error } = await supabase
    .from("items")
    .select("id, title, category, status, rating_personal, rank_order, done_at, dominant_color, image_url, image_storage_path")
    .eq("status", "done")
    .in("category", [...RANK_CATEGORIES])
    .not("rating_personal", "is", null)
    .limit(2000);
  if (error) throw new Error(error.message);

  const items = (data ?? []).map((row) => ({
    id: row.id,
    title: cleanDisplayTitle(row.title ?? "Untitled"),
    category: row.category,
    status: row.status,
    rating: row.rating_personal,
    rankOrder: row.rank_order,
    doneAt: row.done_at,
    color: row.dominant_color,
    cover: getCoverImageUrls(row.image_storage_path, row.image_url),
  }));

  const entries = (category: RankCategory): TopTenEntry[] =>
    topTen(items, category).map((i) => ({
      id: i.id,
      title: i.title,
      rating: i.rating ?? 0,
      cover: i.cover,
      color: i.color,
    }));

  return { books: entries("books"), movies_and_tv: entries("movies_and_tv") };
}
