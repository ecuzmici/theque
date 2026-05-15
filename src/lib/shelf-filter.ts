import type { ItemCategory, ItemStatus } from "@/lib/database.types";
import { SHELVES, type ShelfId } from "@/lib/shelves";

export function itemMatchesShelf(
  item: { status: ItemStatus; category: ItemCategory | null },
  shelfId: ShelfId,
): boolean {
  if (shelfId !== "inbox") {
    const shelf = SHELVES.find((s) => s.id === shelfId);
    if (shelf?.filter.excludeInbox && item.status === "inbox") {
      return false;
    }
  }
  const shelf = SHELVES.find((s) => s.id === shelfId);
  if (!shelf) return false;

  if (shelf.filter.status !== undefined) {
    return item.status === shelf.filter.status;
  }

  if (shelf.filter.excludeDismissed && item.status === "dismissed") {
    return false;
  }

  if (shelf.filter.category !== undefined) {
    const categories = Array.isArray(shelf.filter.category)
      ? shelf.filter.category
      : [shelf.filter.category];
    return item.category != null && categories.includes(item.category);
  }

  return true;
}
