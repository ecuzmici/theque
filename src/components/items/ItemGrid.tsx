"use client";

import type { ItemCategory, ItemStatus } from "@/lib/database.types";
import type { ShelfId } from "@/lib/shelves";
import type { LibraryItemRow } from "@/lib/types/library-item";

import { ItemCard } from "./ItemCard";

type ItemGridProps = {
  items: LibraryItemRow[];
  shelfId: ShelfId;
  itemActionsEnabled?: boolean;
  onItemPatch?: (
    itemId: string,
    patch: Partial<LibraryItemRow> & { status?: ItemStatus; category?: ItemCategory | null },
    opts?: { remove?: boolean },
  ) => void;
};

/**
 * Imagery-first masonry via CSS multi-columns: items keep their natural aspect
 * ratio and flow top-to-bottom per column (recency order is per-column, a
 * deliberate PoC trade-off vs. a JS-measured balanced grid).
 */
export function ItemGrid({ items, shelfId, itemActionsEnabled, onItemPatch }: ItemGridProps) {
  const inboxShelf = shelfId === "inbox";

  return (
    <ul className="columns-2 gap-3 sm:columns-3 lg:columns-4 lg:gap-4">
      {items.map((item) => (
        <li key={item.id} className="mb-4 break-inside-avoid lg:mb-5">
          <ItemCard
            item={item}
            shelfId={shelfId}
            itemActionsEnabled={itemActionsEnabled}
            inboxActionsEnabled={inboxShelf && item.status === "inbox"}
            onItemPatch={onItemPatch}
          />
        </li>
      ))}
    </ul>
  );
}
