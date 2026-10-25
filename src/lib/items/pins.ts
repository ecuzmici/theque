import type { LibraryItemRow } from "@/lib/types/library-item";

/**
 * The most pinned items in one category. A new pin past this limit unpins the
 * oldest pin of that category.
 */
export const PINS_PER_CATEGORY = 4;

/** Window event that tells the Up next row to load its items again. */
export const PINS_CHANGED_EVENT = "theque:pins-changed";

export function isPinned(item: Pick<LibraryItemRow, "pinned_at">): boolean {
  return item.pinned_at != null;
}

/**
 * Puts pinned items first, newest pin first, and keeps the order of the
 * other items. The shelf query sorts the same way, so this only matters after
 * an optimistic pin or unpin.
 */
export function pinnedFirst<T extends Pick<LibraryItemRow, "pinned_at">>(items: T[]): T[] {
  const pinned = items.filter(isPinned).sort((a, b) => b.pinned_at!.localeCompare(a.pinned_at!));
  if (pinned.length === 0) return items;
  return [...pinned, ...items.filter((i) => !isPinned(i))];
}

/**
 * PATCH the pin of an item. On success it returns the ids of the items that
 * the server unpinned to make room. It returns null on an error and never
 * throws.
 */
export async function setPinnedRequest(itemId: string, pinned: boolean): Promise<{ unpinnedIds: string[] } | null> {
  try {
    const res = await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned }),
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as { unpinned_item_ids?: unknown };
    const ids = Array.isArray(body.unpinned_item_ids) ? body.unpinned_item_ids : [];
    return { unpinnedIds: ids.filter((v): v is string => typeof v === "string") };
  } catch {
    return null;
  }
}
