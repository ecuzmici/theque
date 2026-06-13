"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ItemGrid } from "@/components/items/ItemGrid";
import { ItemCardSkeleton } from "@/components/items/ItemCardSkeleton";
import { QuickLookDialog } from "@/components/items/QuickLookDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useItemRealtime } from "@/hooks/useItemRealtime";
import { fetchLibraryItemsForShelf, type LibrarySort } from "@/lib/library-items-for-shelf";
import { SHELF_EMPTY } from "@/lib/shelf-empty";
import type { ItemCategory, ItemStatus } from "@/lib/database.types";
import type { ShelfId } from "@/lib/shelves";
import { createClient } from "@/lib/supabase/client";
import type { LibraryItemRow } from "@/lib/types/library-item";

const PENDING_REFRESH_INTERVAL_MS = 2000;

type LibraryItemsSectionProps = {
  userId: string;
  shelfId: ShelfId;
  initialItems: LibraryItemRow[];
  initialHasMore?: boolean;
  sort?: LibrarySort;
  wall?: boolean;
  onItemsChange?: (items: LibraryItemRow[]) => void;
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
  wall = false,
  onItemsChange,
}: LibraryItemsSectionProps) {
  const router = useRouter();
  const [items, setItems] = useState<LibraryItemRow[]>(() => initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [quickLookOpen, setQuickLookOpen] = useState(false);
  const offsetRef = useRef(initialItems.length);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasPendingItems = hasPendingEnrichment(items);

  useItemRealtime(userId, shelfId, setItems);

  useEffect(() => {
    onItemsChange?.(items);
  }, [items, onItemsChange]);

  useEffect(() => {
    if (!hasPendingItems) return;

    let cancelled = false;
    let inFlight = false;
    const supabase = createClient();

    const refreshPendingItems = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const { items: rows } = await fetchLibraryItemsForShelf(supabase, shelfId, 0, sort);
        if (!cancelled) {
          setItems((prev) => {
            // Merge: replace the first page with fresh data while preserving any extra pages
            const extra = prev.slice(rows.length);
            return [...rows, ...extra];
          });
        }
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
  }, [hasPendingItems, shelfId, sort]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const supabase = createClient();
      const { items: newRows, hasMore: more } = await fetchLibraryItemsForShelf(
        supabase,
        shelfId,
        offsetRef.current,
        sort,
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
  }, [loadingMore, hasMore, shelfId, sort]);

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
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  // Keyboard browsing: J/K or arrows walk the shelf, Space/Enter quick-looks,
  // O opens the item page, / jumps to search.
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
        router.push("/search");
        return;
      }
      if (!items.length) return;

      const move = (delta: number) => {
        e.preventDefault();
        setSelectedIdx((i) => {
          if (i == null) return delta > 0 ? 0 : items.length - 1;
          return Math.min(items.length - 1, Math.max(0, i + delta));
        });
      };

      if (e.key === "j" || e.key === "ArrowRight") move(1);
      else if (e.key === "k" || e.key === "ArrowLeft") move(-1);
      else if ((e.key === " " || e.key === "Enter") && selectedIdx != null && !quickLookOpen) {
        e.preventDefault();
        setQuickLookOpen(true);
      } else if (e.key === "o" && selectedIdx != null && !quickLookOpen) {
        e.preventDefault();
        router.push(`/item/${items[selectedIdx].id}`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, selectedIdx, quickLookOpen, router]);

  const selectedItem = selectedIdx != null ? (items[selectedIdx] ?? null) : null;

  useEffect(() => {
    if (!selectedItem) return;
    document
      .querySelector(`[data-item-card="${selectedItem.id}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedItem]);

  const onItemPatch = useCallback(
    (
      itemId: string,
      patch: Partial<LibraryItemRow> & { status?: ItemStatus; category?: ItemCategory | null },
      opts?: { remove?: boolean },
    ) => {
      setItems((prev) => {
        if (opts?.remove) return prev.filter((i) => i.id !== itemId);
        return prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i));
      });
    },
    [],
  );

  if (items.length === 0) {
    const empty = SHELF_EMPTY[shelfId];
    return (
      <Card className="border-dashed">
        <CardContent className="flex w-full flex-col items-center px-6 py-14 text-center sm:px-10">
          <div className="w-full max-w-md">
            <h2 className="font-serif text-lg font-medium text-card-foreground">{empty.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground">
              {empty.description}
            </p>
            <Button nativeButton={false} render={<Link href="/add" />} className="mt-6 min-h-11">
              Add a link
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <ItemGrid
        items={items}
        shelfId={shelfId}
        itemActionsEnabled
        wall={wall}
        selectedId={selectedItem?.id ?? null}
        onItemPatch={onItemPatch}
      />
      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-1" aria-hidden />
      {loadingMore ? (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i}>
              <ItemCardSkeleton />
            </li>
          ))}
        </ul>
      ) : null}

      <QuickLookDialog
        item={selectedItem}
        open={quickLookOpen && selectedItem != null}
        onOpenChange={setQuickLookOpen}
        onNext={() => setSelectedIdx((i) => Math.min(items.length - 1, (i ?? -1) + 1))}
        onPrev={() => setSelectedIdx((i) => Math.max(0, (i ?? 1) - 1))}
      />
    </div>
  );
}
