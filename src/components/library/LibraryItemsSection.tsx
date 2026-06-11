"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { ItemGrid } from "@/components/items/ItemGrid";
import { ItemGridSkeleton } from "@/components/items/ItemCardSkeleton";
import { Button } from "@/components/ui/button";
import { useItemRealtime } from "@/hooks/useItemRealtime";
import { fetchLibraryItemsForShelf } from "@/lib/library-items-for-shelf";
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
  onItemsChange,
}: LibraryItemsSectionProps) {
  const [items, setItems] = useState<LibraryItemRow[]>(() => initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
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
        const { items: rows } = await fetchLibraryItemsForShelf(supabase, shelfId, 0);
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
  }, [hasPendingItems, shelfId]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const supabase = createClient();
      const { items: newRows, hasMore: more } = await fetchLibraryItemsForShelf(
        supabase,
        shelfId,
        offsetRef.current,
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
  }, [loadingMore, hasMore, shelfId]);

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
      <div className="rounded-lg border border-dashed border-border px-6 py-14 text-center sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <h2 className="text-base font-semibold tracking-tight text-foreground">{empty.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground">
            {empty.description}
          </p>
          <Button nativeButton={false} render={<Link href="/add" />} className="mt-6 min-h-11">
            Add a link
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <ItemGrid items={items} shelfId={shelfId} itemActionsEnabled onItemPatch={onItemPatch} />
      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-1" aria-hidden />
      {loadingMore ? (
        <div className="mt-3">
          <ItemGridSkeleton count={4} />
        </div>
      ) : null}
    </div>
  );
}
