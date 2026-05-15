"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ItemCardSkeleton } from "@/components/items/ItemCardSkeleton";
import { ItemGrid } from "@/components/items/ItemGrid";
import { PageHeader } from "@/components/layout/PageHeader";
import type { ItemsListResponseBody } from "@/lib/types/api";
import { libraryItemFromSummary } from "@/lib/types/library-item";

type CollectionDetailClientProps = {
  collection: { id: string; name: string; description: string | null };
};

export function CollectionDetailClient({ collection }: CollectionDetailClientProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState(() => [] as ReturnType<typeof libraryItemFromSummary>[]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/items?collection_id=${encodeURIComponent(collection.id)}&limit=48`,
        );
        if (!res.ok) {
          if (!cancelled) setError("Could not load items.");
          return;
        }
        const body = (await res.json()) as ItemsListResponseBody;
        if (!cancelled) {
          setItems(body.items.map(libraryItemFromSummary));
        }
      } catch {
        if (!cancelled) setError("Could not load items.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [collection.id]);

  return (
    <div>
      <Link
        href="/collections"
        className="mb-4 inline-flex text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        ← Collections
      </Link>
      <PageHeader
        title={collection.name}
        description={collection.description ?? "Items you grouped in this collection."}
      />

      {error ? (
        <p className="text-center text-sm text-muted-foreground">{error}</p>
      ) : loading ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i}>
              <ItemCardSkeleton />
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <p className="mx-auto max-w-md rounded-xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center text-sm leading-relaxed text-pretty text-muted-foreground sm:px-10">
          No items in this collection yet. Open an item and add it here.
        </p>
      ) : (
        <ItemGrid items={items} shelfId="all" />
      )}
    </div>
  );
}
