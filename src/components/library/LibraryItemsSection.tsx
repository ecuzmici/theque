"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ItemGrid } from "@/components/items/ItemGrid";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  onItemsChange,
}: LibraryItemsSectionProps) {
  const [items, setItems] = useState<LibraryItemRow[]>(() => initialItems);
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
        const rows = await fetchLibraryItemsForShelf(supabase, shelfId);
        if (!cancelled) setItems(rows);
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

  return <ItemGrid items={items} shelfId={shelfId} itemActionsEnabled onItemPatch={onItemPatch} />;
}
