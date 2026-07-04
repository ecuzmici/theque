"use client";

import { useLayoutEffect, useRef, useState } from "react";

import type { ItemCategory, ItemStatus } from "@/lib/database.types";
import { cardAspectRatio } from "@/lib/item-display";
import type { ShelfId } from "@/lib/shelves";
import type { LibraryItemRow } from "@/lib/types/library-item";
import { cn } from "@/lib/utils";

import { ItemCard } from "./ItemCard";

/**
 * PROTOTYPE: grid layout is switchable to compare column-major masonry (current)
 * against row-major layouts that keep recency legible and don't reflow on
 * infinite-scroll append. Delete the non-winning branches when the call is made.
 */
export type GridLayout = "masonry" | "grid" | "justified";

type ItemGridProps = {
  items: LibraryItemRow[];
  shelfId: ShelfId;
  itemActionsEnabled?: boolean;
  /** Imagery-only wall: captions hidden, tighter gutters. */
  wall?: boolean;
  /** PROTOTYPE: which grid layout to render. */
  layout?: GridLayout;
  /** Item highlighted by keyboard navigation. */
  selectedId?: string | null;
  onItemPatch?: (
    itemId: string,
    patch: Partial<LibraryItemRow> & { status?: ItemStatus; category?: ItemCategory | null },
    opts?: { remove?: boolean },
  ) => void;
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
  layout = "masonry",
  selectedId,
  onItemPatch,
  onOpenMarkDone,
}: ItemGridProps) {
  const inboxShelf = shelfId === "inbox";

  const renderCard = (item: LibraryItemRow, aspectOverride?: string) => (
    <ItemCard
      item={item}
      shelfId={shelfId}
      itemActionsEnabled={itemActionsEnabled}
      inboxActionsEnabled={inboxShelf && item.status === "inbox"}
      wall={wall}
      aspectOverride={aspectOverride}
      selected={selectedId === item.id}
      onItemPatch={onItemPatch}
      onOpenMarkDone={onOpenMarkDone}
    />
  );

  // Variant B — uniform row-major grid. Every card gets one fixed aspect, so
  // cards flow left-to-right by recency and appending a page only adds rows at
  // the bottom (nothing above reflows).
  if (layout === "grid") {
    return (
      <ul
        className={cn(
          "grid grid-cols-2 items-start sm:grid-cols-3 lg:grid-cols-4",
          wall ? "gap-2 lg:gap-2.5" : "gap-3 lg:gap-4",
        )}
      >
        {items.map((item) => (
          <li key={item.id}>{renderCard(item, "2/3")}</li>
        ))}
      </ul>
    );
  }

  // Variant C — justified rows (Google-Photos style). Keeps each cover's natural
  // aspect, height-normalizes each row to fill the width. Row-major by recency,
  // append-only.
  if (layout === "justified") {
    return (
      <JustifiedGrid items={items} wall={wall} renderCard={renderCard} />
    );
  }

  // Variant A — stable column masonry. Distributes items into columns in JS
  // (shortest column by estimated height) instead of CSS multi-column. CSS
  // `columns` re-balances *every* item across columns whenever the list grows,
  // so infinite-scroll appends visibly reorder already-rendered cards. Here each
  // item's column is a pure function of the items before it, so appending a page
  // only extends column bottoms — nothing already on screen moves.
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
  renderCard: (item: LibraryItemRow, aspectOverride?: string) => React.ReactNode;
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

const JUSTIFY_GAP = 12;
const JUSTIFY_TARGET_H = 240;

function JustifiedGrid({
  items,
  wall,
  renderCard,
}: {
  items: LibraryItemRow[];
  wall?: boolean;
  renderCard: (item: LibraryItemRow, aspectOverride?: string) => React.ReactNode;
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

  // Greedy row packing: fill a row until scaled width overflows, then scale the
  // row's height so its items fill the container width exactly.
  type Placed = { item: LibraryItemRow; w: number; aspect: number };
  const rows: Placed[][] = [];
  if (width > 0) {
    let row: { item: LibraryItemRow; aspect: number }[] = [];
    let ratioSum = 0;
    const flush = (stretch: boolean) => {
      if (row.length === 0) return;
      const gaps = JUSTIFY_GAP * (row.length - 1);
      const h = stretch ? (width - gaps) / ratioSum : JUSTIFY_TARGET_H;
      rows.push(row.map((r) => ({ item: r.item, aspect: r.aspect, w: r.aspect * h })));
      row = [];
      ratioSum = 0;
    };
    for (const item of items) {
      const aspect = aspectValue(item);
      row.push({ item, aspect });
      ratioSum += aspect;
      const gaps = JUSTIFY_GAP * (row.length - 1);
      if (ratioSum * JUSTIFY_TARGET_H + gaps >= width) flush(true);
    }
    flush(false); // trailing row keeps target height instead of stretching
  }

  return (
    <div ref={containerRef}>
      {rows.map((row, ri) => (
        <div
          key={ri}
          className="flex items-start"
          style={{ gap: JUSTIFY_GAP, marginBottom: wall ? 8 : JUSTIFY_GAP }}
        >
          {row.map(({ item, w, aspect }) => {
            const [aw, ah] = cardAspectRatio(item.category, item.display).split("/");
            return (
              <div key={item.id} style={{ width: w }}>
                {renderCard(item, aspect > 0 ? `${aw}/${ah}` : undefined)}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
