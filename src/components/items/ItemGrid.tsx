"use client";

import type { ShelfId } from "@/lib/shelves";
import type { LibraryItemRow } from "@/lib/types/library-item";
import type { ItemPatchHandler } from "@/lib/item-patch";

import { ItemCard } from "./ItemCard";

/** Cover wall columns: 2 on a phone, 5 on desktop. Skeletons use the same grid. */
export const COVER_GRID_CLASS =
  "grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-5 lg:gap-y-7";

type ItemGridProps = {
  items: LibraryItemRow[];
  shelfId: ShelfId;
  itemActionsEnabled?: boolean;
  /** Item highlighted by keyboard navigation. */
  selectedId?: string | null;
  onItemPatch?: ItemPatchHandler;
  onOpenMarkDone?: (item: LibraryItemRow) => void;
};

/**
 * Uniform 2:3 cover wall. Every cover has the same shape, so a plain CSS grid
 * keeps the order on infinite-scroll appends. Nothing on screen moves.
 */
export function ItemGrid({
  items,
  shelfId,
  itemActionsEnabled,
  selectedId,
  onItemPatch,
  onOpenMarkDone,
}: ItemGridProps) {
  return (
    <ul className={COVER_GRID_CLASS}>
      {items.map((item) => (
        <li key={item.id}>
          <ItemCard
            item={item}
            shelfId={shelfId}
            itemActionsEnabled={itemActionsEnabled}
            selected={selectedId === item.id}
            onItemPatch={onItemPatch}
            onOpenMarkDone={onOpenMarkDone}
          />
        </li>
      ))}
    </ul>
  );
}
