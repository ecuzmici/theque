import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { SHELVES, type ShelfId } from "@/lib/shelves";
import type { LibraryItemRow } from "@/lib/types/library-item";

const LIBRARY_ITEM_COLUMNS =
  "id, title, subtitle, image_url, image_storage_path, domain, category, status, processing_status, created_at, display, canonical_url";

export async function fetchLibraryItemsForShelf(
  supabase: SupabaseClient<Database>,
  shelfId: ShelfId,
): Promise<LibraryItemRow[]> {
  const shelf = SHELVES.find((s) => s.id === shelfId);
  if (!shelf) return [];

  let query = supabase
    .from("items")
    .select(LIBRARY_ITEM_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(48);

  if (shelf.filter.status) {
    query = query.eq("status", shelf.filter.status);
  } else if (shelf.filter.excludeDismissed) {
    query = query.neq("status", "dismissed");
  }

  if (shelf.filter.category) {
    const categories = Array.isArray(shelf.filter.category)
      ? shelf.filter.category
      : [shelf.filter.category];
    query = query.in("category", categories);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as LibraryItemRow[];
}
