import type { ItemCategory, ItemStatus } from "@/lib/database.types";
import { SHELVES, isOlderThan, type ShelfId } from "@/lib/shelves";

export function itemMatchesShelf(
  item: {
    status: ItemStatus;
    category: ItemCategory | null;
    created_at?: string;
    kept_at?: string | null;
  },
  shelfId: ShelfId,
): boolean {
  const shelf = SHELVES.find((s) => s.id === shelfId);
  if (!shelf) return false;

  if (shelfId !== "inbox" && shelf.filter.excludeInbox && item.status === "inbox") {
    return false;
  }

  if (shelf.filter.status !== undefined && item.status !== shelf.filter.status) {
    return false;
  }

  if (shelf.filter.olderThanDays !== undefined) {
    if (!isOlderThan(item, shelf.filter.olderThanDays)) return false;
  }

  if (shelf.filter.status !== undefined) {
    return true;
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
