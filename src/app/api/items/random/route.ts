import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { LIBRARY_ITEM_COLUMNS } from "@/lib/library-items-for-shelf";
import { SHELVES, parseShelfParam } from "@/lib/shelves";
import { createClient } from "@/lib/supabase/server";

const CANDIDATE_CAP = 500;

/** GET /api/items/random?shelf=watch — a random still-wanted item for "Tonight's pick". */
export async function GET(req: Request) {
  const user = await getSessionUserOrNull();
  if (!user) return Response.json({ code: "unauthorized" }, { status: 401 });

  const shelfId = parseShelfParam(new URL(req.url).searchParams.get("shelf"));
  const shelf = SHELVES.find((s) => s.id === shelfId);
  if (!shelf) return Response.json({ code: "unknown_shelf" }, { status: 400 });

  const supabase = await createClient();
  let query = supabase.from("items").select("id").limit(CANDIDATE_CAP);

  if (shelf.filter.status) {
    query = query.eq("status", shelf.filter.status);
  } else {
    // The pick should be something still on the wishlist, not done/dismissed.
    query = query.in("status", ["want", "planned"]);
  }

  if (shelf.filter.category) {
    const categories = Array.isArray(shelf.filter.category)
      ? shelf.filter.category
      : [shelf.filter.category];
    query = query.in("category", categories);
  }

  if (shelf.filter.olderThanDays !== undefined) {
    const cutoff = new Date(Date.now() - shelf.filter.olderThanDays * 86_400_000).toISOString();
    query = query.lt("created_at", cutoff);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[api/items/random] query_failed:", error.message);
    return Response.json({ code: "query_failed" }, { status: 500 });
  }
  if (!data?.length) return Response.json({ item: null });

  const picked = data[Math.floor(Math.random() * data.length)];
  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select(LIBRARY_ITEM_COLUMNS)
    .eq("id", picked.id)
    .single();

  if (itemErr || !item) return Response.json({ item: null });
  return Response.json({ item });
}
