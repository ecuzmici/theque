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

export function ItemGrid({ items, shelfId, itemActionsEnabled, onItemPatch }: ItemGridProps) {
  const inboxShelf = shelfId === "inbox";

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
      {items.map((item) => (
        <li key={item.id}>
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
