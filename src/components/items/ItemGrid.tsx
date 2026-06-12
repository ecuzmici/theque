"use client";

import type { ItemCategory, ItemStatus } from "@/lib/database.types";
import type { ShelfId } from "@/lib/shelves";
import type { LibraryItemRow } from "@/lib/types/library-item";
import { cn } from "@/lib/utils";

import { ItemCard } from "./ItemCard";

type ItemGridProps = {
  items: LibraryItemRow[];
  shelfId: ShelfId;
  itemActionsEnabled?: boolean;
  /** Imagery-only wall: captions hidden, tighter gutters. */
  wall?: boolean;
  /** Item highlighted by keyboard navigation. */
  selectedId?: string | null;
  onItemPatch?: (
    itemId: string,
    patch: Partial<LibraryItemRow> & { status?: ItemStatus; category?: ItemCategory | null },
    opts?: { remove?: boolean },
  ) => void;
};

export function ItemGrid({
  items,
  shelfId,
  itemActionsEnabled,
  wall,
  selectedId,
  onItemPatch,
}: ItemGridProps) {
  const inboxShelf = shelfId === "inbox";

  return (
    /* Masonry via CSS multi-columns: cards keep their natural aspect ratio and
       flow top-to-bottom per column (vs. strict row order in a uniform grid). */
    <ul
      className={cn(
        "columns-2 sm:columns-3 lg:columns-4",
        wall ? "gap-2 lg:gap-2.5" : "gap-3 lg:gap-4",
      )}
    >
      {items.map((item) => (
        <li
          key={item.id}
          className={cn("break-inside-avoid", wall ? "mb-2 lg:mb-2.5" : "mb-3 lg:mb-4")}
        >
          <ItemCard
            item={item}
            shelfId={shelfId}
            itemActionsEnabled={itemActionsEnabled}
            inboxActionsEnabled={inboxShelf && item.status === "inbox"}
            wall={wall}
            selected={selectedId === item.id}
            onItemPatch={onItemPatch}
          />
        </li>
      ))}
    </ul>
  );
}
