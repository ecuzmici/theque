"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, Link2, MapPin, Trash2 } from "lucide-react";
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
  collection: {
    id: string;
    name: string;
    description: string | null;
    share_token: string | null;
  };
};

export function CollectionDetailClient({ collection }: CollectionDetailClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState(() => [] as ReturnType<typeof libraryItemFromSummary>[]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareToken, setShareToken] = useState(collection.share_token);
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState(false);

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

  async function toggleShare(enable: boolean) {
    setShareBusy(true);
    try {
      const res = await fetch(`/api/collections/${collection.id}/share`, {
        method: enable ? "POST" : "DELETE",
      });
      if (!res.ok) return;
      const body = (await res.json()) as { share_token: string | null };
      setShareToken(body.share_token);
      setCopied(false);
    } finally {
      setShareBusy(false);
    }
  }

  async function copyShareUrl() {
    if (!shareToken) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/share/${shareToken}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable; the URL stays visible for manual copy.
    }
  }

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

      <div className="mb-6 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 gap-1.5 lg-fine:min-h-8"
          onClick={() => setShareOpen(true)}
        >
          <Link2 className="size-4" />
          {shareToken ? "Sharing on" : "Share"}
        </Button>
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
        <>
          <ItemGrid items={items} shelfId="all" />
          <PlacesSection items={items} />
        </>
      )}

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share read-only</DialogTitle>
            <DialogDescription>
              Anyone with the link can view this collection — nothing else in your library.
              Revoke it at any time.
            </DialogDescription>
          </DialogHeader>
          {shareToken ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted px-3 py-2 text-xs">
                  {typeof window !== "undefined" ? window.location.origin : ""}/share/{shareToken}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Copy share link"
                  onClick={() => void copyShareUrl()}
                >
                  {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={shareBusy}
                className="text-destructive"
                onClick={() => void toggleShare(false)}
              >
                {shareBusy ? "Revoking…" : "Revoke link"}
              </Button>
            </div>
          ) : (
            <DialogFooter>
              <Button type="button" disabled={shareBusy} onClick={() => void toggleShare(true)}>
                {shareBusy ? "Creating…" : "Create share link"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

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

/** Eat/travel saves in a trip collection, each one tap from Google Maps. */
function PlacesSection({ items }: { items: ReturnType<typeof libraryItemFromSummary>[] }) {
  const places = items.filter(
    (i) => i.category === "restaurants" || i.category === "travel",
  );
  if (!places.length) return null;

  return (
    <section className="mt-10" aria-label="Places in this collection">
      <h2 className="font-serif text-lg text-foreground">Places</h2>
      <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {places.map((place) => (
          <li key={place.id} className="flex items-center gap-3 px-4 py-3">
            <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <Link
                href={`/item/${place.id}`}
                className="block truncate text-sm font-medium text-foreground underline-offset-2 hover:underline"
              >
                {place.title ?? place.domain}
              </Link>
              {place.subtitle ? (
                <p className="truncate text-xs text-muted-foreground">{place.subtitle}</p>
              ) : null}
            </div>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                [place.title, place.subtitle].filter(Boolean).join(" "),
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ks-pointer-coarse-min-hit shrink-0 rounded-md px-1 text-xs font-medium text-accent-foreground underline-offset-2 hover:underline"
            >
              Open in Maps
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
