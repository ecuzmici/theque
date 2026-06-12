import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { SHELVES, type ShelfId } from "@/lib/shelves";
import type { LibraryItemRow } from "@/lib/types/library-item";

export const LIBRARY_ITEM_COLUMNS =
  "id, title, subtitle, image_url, image_storage_path, domain, category, status, processing_status, created_at, display, canonical_url, dominant_color, dominant_hue";

const PAGE_SIZE = 24;

export type LibrarySort = "recent" | "color" | "title";

export async function fetchLibraryItemsForShelf(
  supabase: SupabaseClient<Database>,
  shelfId: ShelfId,
  offset = 0,
  sort: LibrarySort = "recent",
): Promise<{ items: LibraryItemRow[]; hasMore: boolean }> {
  const shelf = SHELVES.find((s) => s.id === shelfId);
  if (!shelf) return { items: [], hasMore: false };

  let query = supabase.from("items").select(LIBRARY_ITEM_COLUMNS);

  if (sort === "color") {
    // Hue walk around the wheel; items without an extracted color sink to the end.
    query = query
      .order("dominant_hue", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
  } else if (sort === "title") {
    query = query.order("title", { ascending: true, nullsFirst: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }
  query = query.order("id", { ascending: false }).range(offset, offset + PAGE_SIZE);

  if (shelf.filter.status) {
    query = query.eq("status", shelf.filter.status);
  } else if (shelf.filter.excludeDismissed) {
    query = query.neq("status", "dismissed");
  }

  if (shelf.filter.excludeInbox) {
    query = query.neq("status", "inbox");
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
  if (error) throw error;

  const rows = (data ?? []) as LibraryItemRow[];
  const hasMore = rows.length > PAGE_SIZE;
  return { items: hasMore ? rows.slice(0, PAGE_SIZE) : rows, hasMore };
}
