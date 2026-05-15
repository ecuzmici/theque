"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { ItemGrid } from "@/components/items/ItemGrid";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useItemRealtime } from "@/hooks/useItemRealtime";
import { SHELF_EMPTY } from "@/lib/shelf-empty";
import type { ItemCategory, ItemStatus } from "@/lib/database.types";
import type { ShelfId } from "@/lib/shelves";
import type { LibraryItemRow } from "@/lib/types/library-item";

type LibraryItemsSectionProps = {
  userId: string;
  shelfId: ShelfId;
  initialItems: LibraryItemRow[];
};

export function LibraryItemsSection({ userId, shelfId, initialItems }: LibraryItemsSectionProps) {
  const [items, setItems] = useState<LibraryItemRow[]>(() => initialItems);

  useItemRealtime(userId, shelfId, setItems);

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
            <Button nativeButton={false} render={<Link href="/add" />} className="mt-6">
              Add a link
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return <ItemGrid items={items} shelfId={shelfId} onItemPatch={onItemPatch} />;
}
