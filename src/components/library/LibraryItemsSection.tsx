"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { ItemGrid } from "@/components/items/ItemGrid";
import { useItemRealtime } from "@/hooks/useItemRealtime";
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
        if (opts?.remove) {
          return prev.filter((i) => i.id !== itemId);
        }
        return prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i));
      });
    },
    [],
  );

  if (items.length === 0) {
    return (
      <div className="rounded-[var(--ks-radius-card)] border border-dashed border-[color:var(--ks-border)] bg-[color:var(--ks-bg-muted)]/40 px-6 py-16 text-center">
        <p className="font-serif text-lg text-[color:var(--ks-fg)]">Nothing on this shelf yet</p>
        <p className="mt-2 text-sm text-[color:var(--ks-fg-muted)]">
          Save something from Chrome or your phone to start your library.
        </p>
        <Link
          href="/add"
          className="mt-6 inline-block rounded-full bg-[color:var(--ks-accent-soft)] px-5 py-2.5 text-sm font-semibold text-[color:var(--ks-accent-hover)] ring-1 ring-[color:var(--ks-border)] transition hover:opacity-90"
        >
          Add a link
        </Link>
      </div>
    );
  }

  return <ItemGrid items={items} shelfId={shelfId} onItemPatch={onItemPatch} />;
}
