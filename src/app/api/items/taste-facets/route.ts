import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { applyShelfFilter } from "@/lib/library-items-for-shelf";
import { getShelf, type ShelfId } from "@/lib/shelves";
import { createClient } from "@/lib/supabase/server";
import {
  MOODS,
  genreListForCategory,
  tasteShelfCategory,
  type TasteListEntry,
} from "@/lib/taste/taste-lists";

const PAGE = 1000;
const MAX_PAGES = 10;

export type TasteFacet = { key: string; label: string; count: number };
export type TasteFacetsResponseBody = { genres: TasteFacet[]; moods: TasteFacet[] };

/** Count each known key once for each item. Drop keys that have a count of 0. */
function countKeys(
  rows: (string[] | null | undefined)[],
  list: readonly TasteListEntry[],
): TasteFacet[] {
  const counts = new Map<string, number>();
  for (const keys of rows) {
    if (!Array.isArray(keys)) continue;
    for (const key of new Set(keys)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return list
    .map((entry, order) => ({ ...entry, count: counts.get(entry.key) ?? 0, order }))
    .filter((f) => f.count > 0)
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .map(({ key, label, count }) => ({ key, label, count }));
}

/** GET /api/items/taste-facets?shelf=books|watch: chip counts for a shelf. */
export async function GET(req: Request) {
  const user = await getSessionUserOrNull();
  if (!user) return Response.json({ code: "unauthorized" }, { status: 401 });

  const shelfParam = new URL(req.url).searchParams.get("shelf");
  const category = tasteShelfCategory(shelfParam);
  if (!shelfParam || !category) {
    return Response.json({ code: "invalid_shelf" }, { status: 400 });
  }
  const shelf = getShelf(shelfParam as ShelfId);

  const supabase = await createClient();
  const genreRows: (string[] | null)[] = [];
  const moodRows: (string[] | null)[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE;
    let query = supabase
      .from("items")
      .select("genre_keys, mood_keys")
      .eq("user_id", user.id)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    query = applyShelfFilter(query, shelf);

    const { data, error } = await query;
    if (error) {
      console.error("[api/items/taste-facets] query_failed:", error.message);
      return Response.json({ code: "query_failed" }, { status: 500 });
    }
    const rows = data ?? [];
    for (const row of rows) {
      genreRows.push(row.genre_keys);
      moodRows.push(row.mood_keys);
    }
    if (rows.length < PAGE) break;
  }

  const body: TasteFacetsResponseBody = {
    genres: countKeys(genreRows, genreListForCategory(category)),
    moods: countKeys(moodRows, MOODS),
  };
  return Response.json(body);
}
