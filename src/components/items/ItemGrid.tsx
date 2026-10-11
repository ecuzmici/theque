"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { cardAspectRatio } from "@/lib/item-display";
import type { ShelfId } from "@/lib/shelves";
import type { LibraryItemRow } from "@/lib/types/library-item";
import type { ItemPatchHandler } from "@/lib/item-patch";

import { ItemCard } from "./ItemCard";

type ItemGridProps = {
  items: LibraryItemRow[];
  shelfId: ShelfId;
  itemActionsEnabled?: boolean;
  /** Imagery-only wall: captions hidden, tighter gutters. */
  wall?: boolean;
  /** Item highlighted by keyboard navigation. */
  selectedId?: string | null;
  onItemPatch?: ItemPatchHandler;
  onOpenMarkDone?: (item: LibraryItemRow) => void;
};

function aspectValue(item: LibraryItemRow): number {
  const [w, h] = cardAspectRatio(item.category, item.display).split("/").map(Number);
  return w > 0 && h > 0 ? w / h : 2 / 3;
}

export function ItemGrid({
  items,
  shelfId,
  itemActionsEnabled,
  wall,
  selectedId,
  onItemPatch,
  onOpenMarkDone,
}: ItemGridProps) {
  const inboxShelf = shelfId === "inbox";

  const renderCard = (item: LibraryItemRow) => (
    <ItemCard
      item={item}
      shelfId={shelfId}
      itemActionsEnabled={itemActionsEnabled}
      inboxActionsEnabled={inboxShelf && item.status === "inbox"}
      wall={wall}
      selected={selectedId === item.id}
      onItemPatch={onItemPatch}
      onOpenMarkDone={onOpenMarkDone}
    />
  );

  // Stable column masonry. Distributes items into columns in JS (shortest column
  // by estimated height) instead of CSS multi-column. CSS `columns` re-balances
  // *every* item across columns whenever the list grows, so infinite-scroll
  // appends visibly reorder already-rendered cards. Here each item's column is a
  // pure function of the items before it, so appending a page only extends column
  // bottoms — nothing already on screen moves.
  return <MasonryColumns items={items} wall={wall} renderCard={renderCard} />;
}

function columnsForWidth(width: number): number {
  if (width >= 1024) return 4; // lg
  if (width >= 640) return 3; // sm
  return 2;
}

function masonryGap(width: number, wall?: boolean): number {
  const lg = width >= 1024;
  if (wall) return lg ? 10 : 8; // gap-2 / gap-2.5
  return lg ? 16 : 12; // gap-3 / gap-4
}

// Rough caption block height (title + meta) added to the estimate so columns
// balance sensibly; imagery-only wall mode has none. Estimates only affect
// balancing, never order or correctness.
const MASONRY_CAPTION_EST = 96;

function MasonryColumns({
  items,
  wall,
  renderCard,
}: {
  items: LibraryItemRow[];
  wall?: boolean;
  renderCard: (item: LibraryItemRow) => React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cols = width > 0 ? columnsForWidth(width) : 2;
  const gap = masonryGap(width, wall);
  const colWidth = width > 0 ? (width - gap * (cols - 1)) / cols : 0;

  const columns: LibraryItemRow[][] = Array.from({ length: cols }, () => []);
  const heights = new Array<number>(cols).fill(0);
  items.forEach((item, i) => {
    let c: number;
    if (colWidth <= 0) {
      // Pre-measure (SSR / first paint): round-robin keeps a sane split without
      // heights. Corrected to shortest-column on the layout-effect measure,
      // before the browser paints.
      c = i % cols;
    } else {
      c = 0;
      for (let k = 1; k < cols; k++) if (heights[k] < heights[c]) c = k;
      heights[c] += colWidth / aspectValue(item) + (wall ? 0 : MASONRY_CAPTION_EST) + gap;
    }
    columns[c].push(item);
  });

  return (
    <div ref={containerRef} className="flex items-start" style={{ gap }}>
      {columns.map((col, ci) => (
        <div key={ci} className="flex min-w-0 flex-1 flex-col" style={{ gap }}>
          {col.map((item) => (
            <div key={item.id}>{renderCard(item)}</div>
          ))}
        </div>
      ))}
    </div>
  );
}
