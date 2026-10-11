import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { applyShelfFilter } from "@/lib/library-items-for-shelf";
import { getShelf, type ShelfId } from "@/lib/shelves";
import { createClient } from "@/lib/supabase/server";
import {
  countKeys,
  countPairs,
  type TasteFacets,
  type TastePairCounts,
} from "@/lib/taste/taste-facets";
import { MOODS, genreListForCategory, tasteShelfCategory } from "@/lib/taste/taste-lists";

const PAGE = 1000;
const MAX_PAGES = 10;

export type TasteFacetsResponseBody = TasteFacets & { pairs: TastePairCounts };

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
  const allRows: { genre_keys: string[] | null; mood_keys: string[] | null }[] = [];

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
    allRows.push(...rows);
    if (rows.length < PAGE) break;
  }

  const genreList = genreListForCategory(category);
  const body: TasteFacetsResponseBody = {
    genres: countKeys(allRows.map((row) => row.genre_keys), genreList),
    moods: countKeys(allRows.map((row) => row.mood_keys), MOODS),
    pairs: countPairs(allRows, genreList, MOODS),
  };
  return Response.json(body);
}
