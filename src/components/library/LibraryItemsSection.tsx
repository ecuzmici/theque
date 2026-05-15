"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { ItemGrid } from "@/components/items/ItemGrid";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      <Card className="border-dashed py-14 text-center">
        <CardHeader className="mx-auto max-w-sm items-center">
          <CardTitle className="font-serif text-lg">{empty.title}</CardTitle>
          <CardDescription>{empty.description}</CardDescription>
          <Button nativeButton={false} render={<Link href="/add" />} className="mt-4">
            Add a link
          </Button>
        </CardHeader>
      </Card>
    );
  }

  return <ItemGrid items={items} shelfId={shelfId} onItemPatch={onItemPatch} />;
}
