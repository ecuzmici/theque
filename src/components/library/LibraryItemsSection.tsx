"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { COVER_GRID_CLASS, ItemGrid } from "@/components/items/ItemGrid";
import { ItemCardSkeleton } from "@/components/items/ItemCardSkeleton";
import { ItemMarkDoneDialog } from "@/components/items/ItemMarkDoneDialog";
import { QuickLookDialog } from "@/components/items/QuickLookDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { mergeFreshFirstPage, readOpenedItem, storeOpenedItem } from "@/components/library/library-store";
import { LIBRARY_SEARCH_INPUT_ID } from "@/components/library/LibrarySearchRow";
import { useItemRealtime } from "@/hooks/useItemRealtime";
import type { LibrarySort } from "@/lib/library-items-for-shelf";
import { fetchLibraryItemsPage } from "@/lib/library-items-client";
import { doneVerb } from "@/lib/item-labels";
import { applyItemPatch, type ItemPatchHandler } from "@/lib/item-patch";
import { pinnedFirst } from "@/lib/items/pins";
import { patchItemRequest, reportSaveError } from "@/lib/save-error";
import { itemMatchesShelf } from "@/lib/shelf-filter";
import { SHELF_EMPTY } from "@/lib/shelf-empty";
import type { ShelfId } from "@/lib/shelves";
import type { ItemDetailResponseBody } from "@/lib/types/api";
import { libraryItemFromRow, type LibraryItemRow } from "@/lib/types/library-item";

const PENDING_REFRESH_INTERVAL_MS = 2000;
/** Start the next page this far below the viewport, so a fast scroll rarely meets skeletons. */
const LOAD_MORE_MARGIN = "1500px";

type LibraryItemsSectionProps = {
  userId: string;
  shelfId: ShelfId;
  initialItems: LibraryItemRow[];
  initialHasMore?: boolean;
  sort?: LibrarySort;
  /** When set, consumed items are dropped from this shelf's fetches and realtime updates. */
  hideDone?: boolean;
  /** Genre key of the active chip. Every fetch of this section passes it. */
  genre?: string | null;
  /** Mood key of the active chip. Every fetch of this section passes it. */
  mood?: string | null;
  /** Called by the "Clear filter" button in the empty state of a filtered list. */
  onClearFilter?: () => void;
  onItemsChange?: (items: LibraryItemRow[]) => void;
  /**
   * True when `initialItems` came from the library store (Back from an item).
   * The section then refreshes its first page and the item the user opened.
   */
  revalidate?: boolean;
};

function hasPendingEnrichment(items: LibraryItemRow[]): boolean {
  return items.some(
    (item) => item.processing_status === "pending" || item.processing_status === "processing",
  );
}

export function LibraryItemsSection({
  userId,
  shelfId,
  initialItems,
  initialHasMore = false,
  sort = "recent",
  hideDone = false,
  genre = null,
  mood = null,
  onClearFilter,
  onItemsChange,
  revalidate = false,
}: LibraryItemsSectionProps) {
  const router = useRouter();
  const [items, setItems] = useState<LibraryItemRow[]>(() => initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [quickLookOpen, setQuickLookOpen] = useState(false);
  const [markDoneItem, setMarkDoneItem] = useState<LibraryItemRow | null>(null);
  const offsetRef = useRef(initialItems.length);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasPendingItems = hasPendingEnrichment(items);

  useItemRealtime(userId, shelfId, items, setItems);

  // "Hide done" is a display filter: consumed items stay in `items` (so toggling
  // it back reveals them without a refetch) but are dropped from what we render.
  const displayItems = pinnedFirst(hideDone ? items.filter((i) => i.status !== "done") : items);

  useEffect(() => {
    onItemsChange?.(items);
  }, [items, onItemsChange]);

  useEffect(() => {
    if (!hasPendingItems) return;

    let cancelled = false;
    let inFlight = false;

    const refreshPendingItems = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const { items: rows, hasMore: more } = await fetchLibraryItemsPage(shelfId, 0, sort, {
          genre,
          mood,
        });
        if (!cancelled) setItems((prev) => mergeFreshFirstPage(prev, rows, more));
      } catch {
        // Keep the current card state; the next interval or Realtime event can still update it.
      } finally {
        inFlight = false;
      }
    };

    void refreshPendingItems();
    const intervalId = window.setInterval(() => void refreshPendingItems(), PENDING_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [hasPendingItems, shelfId, sort, genre, mood]);

  // A shelf restored from the library store shows at once. Refresh its first
  // page, and refetch the item the user opened (it may be changed or deleted).
  // The section is keyed by shelf and filter, so this runs once per mount.
  useEffect(() => {
    if (!revalidate) return;
    let cancelled = false;
    const openedId = readOpenedItem(userId);

    void fetchLibraryItemsPage(shelfId, 0, sort, { genre, mood })
      .then(({ items: rows, hasMore: more }) => {
        if (!cancelled) setItems((prev) => mergeFreshFirstPage(prev, rows, more));
      })
      .catch(() => {
        // Keep the restored cards; the next scroll or Realtime event updates them.
      });

    if (openedId) {
      void fetch(`/api/items/${openedId}`)
        .then(async (res) => {
          if (cancelled) return;
          if (res.status === 404) {
            setItems((prev) => prev.filter((i) => i.id !== openedId));
            return;
          }
          if (!res.ok) return;
          const row = libraryItemFromRow((await res.json()) as ItemDetailResponseBody);
          if (cancelled) return;
          setItems((prev) =>
            itemMatchesShelf(row, shelfId)
              ? prev.map((i) => (i.id === openedId ? { ...i, ...row } : i))
              : prev.filter((i) => i.id !== openedId),
          );
        })
        .catch(() => {
          // Best effort, like the first-page refresh.
        });
    }

    return () => {
      cancelled = true;
    };
  }, [revalidate, userId, shelfId, sort, genre, mood]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { items: newRows, hasMore: more } = await fetchLibraryItemsPage(
        shelfId,
        offsetRef.current,
        sort,
        { genre, mood },
      );
      if (newRows.length > 0) {
        setItems((prev) => {
          const existingIds = new Set(prev.map((r) => r.id));
          const fresh = newRows.filter((r) => !existingIds.has(r.id));
          const merged = [...prev, ...fresh];
          offsetRef.current = merged.length;
          return merged;
        });
      }
      setHasMore(more);
    } catch {
      // Fail silently; user can scroll again
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, shelfId, sort, genre, mood]);

  // IntersectionObserver sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: LOAD_MORE_MARGIN },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  // Keyboard browsing: J/K or arrows walk the shelf, Space/Enter quick-looks,
  // O opens the item page, / focuses the search field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const inField = Boolean(target?.closest("input, textarea, select, [contenteditable=true]"));
      if (inField) return;
      const inDialog = Boolean(target?.closest("[role=dialog]"));
      if (inDialog && !quickLookOpen) return;

      if (e.key === "/" && !quickLookOpen) {
        e.preventDefault();
        document.getElementById(LIBRARY_SEARCH_INPUT_ID)?.focus();
        return;
      }
      if (!displayItems.length) return;

      const move = (delta: number) => {
        e.preventDefault();
        setSelectedIdx((i) => {
          if (i == null) return delta > 0 ? 0 : displayItems.length - 1;
          return Math.min(displayItems.length - 1, Math.max(0, i + delta));
        });
      };

      if (e.key === "j" || e.key === "ArrowRight") move(1);
      else if (e.key === "k" || e.key === "ArrowLeft") move(-1);
      else if ((e.key === " " || e.key === "Enter") && selectedIdx != null && !quickLookOpen) {
        e.preventDefault();
        setQuickLookOpen(true);
      } else if (e.key === "o" && selectedIdx != null && !quickLookOpen) {
        e.preventDefault();
        const target = displayItems[selectedIdx];
        if (target) {
          storeOpenedItem(userId, target.id);
          router.push(`/item/${target.id}`);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [displayItems, selectedIdx, quickLookOpen, router, userId]);

  const selectedItem = selectedIdx != null ? (displayItems[selectedIdx] ?? null) : null;

  useEffect(() => {
    if (!selectedItem) return;
    document
      .querySelector(`[data-item-card="${selectedItem.id}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedItem]);

  const onItemPatch = useCallback<ItemPatchHandler>(
    (itemId, patch, opts) => applyItemPatch(setItems, itemId, patch, opts),
    [],
  );

  // Opens the mark-done dialog for an item. Fires the status PATCH immediately
  // (with optimistic update), then opens the verdict dialog. The dialog is rendered
  // at this level — not inside ItemCard — and the empty state below keeps it mounted
  // even when the last card leaves the shelf (e.g. with "Hide done" on).
  const openMarkDoneItem = useCallback(
    async (item: LibraryItemRow) => {
      if (item.status !== "done") {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: "done" as const, done_at: new Date().toISOString() }
              : i,
          ),
        );
      }
      setMarkDoneItem(item);

      if (item.status !== "done") {
        if (!(await patchItemRequest(item.id, { status: "done" }))) {
          // Put the row back as it was and close the dialog.
          setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
          setMarkDoneItem(null);
          reportSaveError();
        }
      }
    },
    [],
  );

  const handleMarkDoneDialogChange = useCallback(
    (open: boolean) => {
      if (!open && markDoneItem) {
        // Done items now live on their category shelf, so a just-consumed item
        // stays in `items` (the "Hide done" display filter is what hides it).
        // Only structural non-matches (e.g. a re-categorised item) get dropped.
        const doneItem = { ...markDoneItem, status: "done" as const };
        if (!itemMatchesShelf(doneItem, shelfId)) {
          setItems((prev) => prev.filter((i) => i.id !== markDoneItem.id));
        }
        setMarkDoneItem(null);
      }
    },
    [markDoneItem, shelfId],
  );

  const empty = SHELF_EMPTY[shelfId];
  const filtered = genre !== null || mood !== null;
  // Everything on the shelf is consumed and "Hide done" is filtering it all out.
  const allHiddenAsDone = displayItems.length === 0 && items.length > 0;
  const moreSkeletons = (count: number) => (
    <ul className={COVER_GRID_CLASS}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <ItemCardSkeleton />
        </li>
      ))}
    </ul>
  );

  return (
    <div>
      {/* Empty states render inline (not via early return) so the mark-done dialog
          below stays mounted when the last card leaves the shelf. */}
      {displayItems.length === 0 ? (
        hasMore ? (
          // No visible items yet, but more pages exist (e.g. a first page that is
          // all done while "Hide done" is on) — the sentinel below keeps loading.
          moreSkeletons(4)
        ) : allHiddenAsDone ? (
          <Card className="border-dashed">
            <CardContent className="flex w-full flex-col items-center px-6 py-14 text-center sm:px-10">
              <div className="w-full max-w-md">
                <h2 className="font-heading text-lg font-medium text-card-foreground">
                  Done items are hidden
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground">
                  Everything on this shelf is marked done. Turn off “Hide done” to see it again.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : filtered ? (
          <Card className="border-dashed">
            <CardContent className="flex w-full flex-col items-center px-6 py-14 text-center sm:px-10">
              <div className="w-full max-w-md">
                <h2 className="font-heading text-lg font-medium text-card-foreground">
                  Nothing matches this filter
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground">
                  No item on this shelf fits the chips you chose.
                </p>
                {onClearFilter ? (
                  <Button type="button" variant="outline" className="mt-6 min-h-11" onClick={onClearFilter}>
                    Clear filter
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex w-full flex-col items-center px-6 py-14 text-center sm:px-10">
              <div className="w-full max-w-md">
                <h2 className="font-heading text-lg font-medium text-card-foreground">
                  {empty.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground">
                  {empty.description}
                </p>
                <Button nativeButton={false} render={<Link href="/add" />} className="mt-6 min-h-11">
                  Add a link
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      ) : (
        <>
          <ItemGrid
            items={displayItems}
            shelfId={shelfId}
            itemActionsEnabled
            selectedId={selectedItem?.id ?? null}
            onItemPatch={onItemPatch}
            onOpenMarkDone={openMarkDoneItem}
          />
          {loadingMore ? <div className="mt-5 lg:mt-7">{moreSkeletons(5)}</div> : null}
        </>
      )}

      {/* Infinite scroll sentinel — kept outside the empty branch so pagination
          continues even while every loaded item is hidden as done. */}
      {hasMore ? <div ref={sentinelRef} className="h-1" aria-hidden /> : null}

      <QuickLookDialog
        item={selectedItem}
        open={quickLookOpen && selectedItem != null}
        onOpenChange={setQuickLookOpen}
        onNext={() => setSelectedIdx((i) => Math.min(displayItems.length - 1, (i ?? -1) + 1))}
        onPrev={() => setSelectedIdx((i) => Math.max(0, (i ?? 1) - 1))}
      />

      {markDoneItem ? (
        <ItemMarkDoneDialog
          key={markDoneItem.id}
          open
          onOpenChange={handleMarkDoneDialogChange}
          verb={doneVerb(markDoneItem.category)}
          title={markDoneItem.title ?? markDoneItem.domain ?? ""}
          initialRating={markDoneItem.rating_personal}
          initialVerdict={markDoneItem.verdict}
          onSave={async (rating, verdict) => {
            const patch = { rating_personal: rating, verdict };
            const undo = applyItemPatch(setItems, markDoneItem.id, patch);
            if (!(await patchItemRequest(markDoneItem.id, patch))) {
              undo();
              reportSaveError();
              return false;
            }
            return true;
          }}
        />
      ) : null}
    </div>
  );
}
