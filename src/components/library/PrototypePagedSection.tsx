"use client";

import { useCallback, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { ItemGrid, type GridLayout } from "@/components/items/ItemGrid";
import { ItemCardSkeleton } from "@/components/items/ItemCardSkeleton";
import { Button } from "@/components/ui/button";
import type { ItemCategory, ItemStatus } from "@/lib/database.types";
import { fetchLibraryItemsPage } from "@/lib/library-items-client";
import type { ShelfId } from "@/lib/shelves";
import type { LibraryItemRow } from "@/lib/types/library-item";

/**
 * PROTOTYPE — column masonry with page-at-a-time navigation instead of infinite
 * scroll. Each page is a self-contained masonry block that REPLACES the previous
 * one, so there is no live column re-balancing on load (the source of the
 * infinite-scroll jank) and the scramble is bounded to one page of items. Delete
 * with the rest of the grid prototype once the call is made.
 */
const PAGE_SIZE = 24;

type Props = {
  shelfId: ShelfId;
  initialItems: LibraryItemRow[];
  initialHasMore?: boolean;
  wall?: boolean;
  layout?: GridLayout;
};

export function PrototypePagedSection({
  shelfId,
  initialItems,
  initialHasMore = false,
  wall = false,
  layout = "masonry",
}: Props) {
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<LibraryItemRow[]>(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const goTo = useCallback(
    async (nextPage: number) => {
      if (loading || nextPage < 0) return;
      setLoading(true);
      try {
        const { items: rows, hasMore: more } = await fetchLibraryItemsPage(
          shelfId,
          nextPage * PAGE_SIZE,
          "recent",
        );
        setItems(rows);
        setHasMore(more);
        setPage(nextPage);
        topRef.current?.scrollIntoView({ block: "start" });
      } catch {
        // Prototype: fail silently, controls stay usable.
      } finally {
        setLoading(false);
      }
    },
    [loading, shelfId],
  );

  // Local optimistic patch so item actions still feel live within a page.
  const onItemPatch = useCallback(
    (
      itemId: string,
      patch: Partial<LibraryItemRow> & { status?: ItemStatus; category?: ItemCategory | null },
      opts?: { remove?: boolean },
    ) => {
      setItems((prev) =>
        opts?.remove
          ? prev.filter((i) => i.id !== itemId)
          : prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
      );
    },
    [],
  );

  return (
    <div ref={topRef} className="scroll-mt-4">
      {loading ? (
        <ul className="columns-2 sm:columns-3 lg:columns-4 gap-3 lg:gap-4">
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i} className="mb-3 break-inside-avoid lg:mb-4">
              <ItemCardSkeleton />
            </li>
          ))}
        </ul>
      ) : (
        <ItemGrid
          items={items}
          shelfId={shelfId}
          itemActionsEnabled
          wall={wall}
          layout={layout}
          onItemPatch={onItemPatch}
        />
      )}

      <div className="mt-6 flex items-center justify-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 gap-1 lg-fine:min-h-9"
          disabled={page === 0 || loading}
          onClick={() => void goTo(page - 1)}
        >
          <ChevronLeft className="size-4" aria-hidden />
          Prev
        </Button>
        <span className="min-w-20 text-center text-sm tabular-nums text-muted-foreground">
          Page {page + 1}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 gap-1 lg-fine:min-h-9"
          disabled={!hasMore || loading}
          onClick={() => void goTo(page + 1)}
        >
          Next
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
