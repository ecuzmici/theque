"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { ItemCardSkeleton } from "@/components/items/ItemCardSkeleton";
import { ItemGrid } from "@/components/items/ItemGrid";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ItemsListResponseBody } from "@/lib/types/api";
import { libraryItemFromSummary } from "@/lib/types/library-item";

type CollectionDetailClientProps = {
  collection: { id: string; name: string; description: string | null };
};

export function CollectionDetailClient({ collection }: CollectionDetailClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState(() => [] as ReturnType<typeof libraryItemFromSummary>[]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  async function deleteCollection() {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/collections/${collection.id}`, { method: "DELETE" });
      if (!res.ok) {
        setDeleteError("Could not delete this collection.");
        return;
      }
      setDeleteOpen(false);
      router.replace("/collections");
      router.refresh();
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div>
      <Link
        href="/collections"
        className="mb-4 inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground ks-pointer-coarse-min-hit"
      >
        ← Collections
      </Link>
      <PageHeader
        title={collection.name}
        description={collection.description ?? "Items you grouped in this collection."}
      />

      <div className="mb-6 flex justify-end">
        <Button
          type="button"
          variant="destructive"
          disabled={deleteBusy}
          className="min-h-11 gap-1.5 lg-fine:min-h-8"
          onClick={() => {
            setDeleteError(null);
            setDeleteOpen(true);
          }}
        >
          <Trash2 className="size-4" />
          Delete collection
        </Button>
      </div>

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

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete collection?</DialogTitle>
            <DialogDescription>
              Delete &quot;{collection.name}&quot; permanently. Items in this collection will remain in your library.
            </DialogDescription>
          </DialogHeader>
          {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={deleteBusy} onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={deleteBusy} onClick={() => void deleteCollection()}>
              {deleteBusy ? "Deleting..." : "Delete collection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
