"use client";

import Image from "next/image";
import Link from "next/link";
import { ExternalLink, Pencil, RefreshCw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { ItemEditSheet } from "@/components/items/ItemEditSheet";
import { StructuredFields } from "@/components/items/StructuredFields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCategory, formatStatus } from "@/lib/item-labels";
import type { Database } from "@/lib/database.types";

type ItemRow = Database["public"]["Tables"]["items"]["Row"];

export type ItemDetailModel = ItemRow & {
  tags: string[];
  collection_ids: string[];
};

function safeRemoteImageUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.href;
  } catch {
    return null;
  }
}

async function patchItem(itemId: string, body: Record<string, unknown>): Promise<ItemDetailModel | null> {
  const res = await fetch(`/api/items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return (await res.json()) as ItemDetailModel;
}

async function fetchItem(itemId: string): Promise<ItemDetailModel | null> {
  const res = await fetch(`/api/items/${itemId}`);
  if (!res.ok) return null;
  return (await res.json()) as ItemDetailModel;
}

export function ItemDetail({
  initial,
  collections,
}: {
  initial: ItemDetailModel;
  collections: { id: string; name: string }[];
}) {
  const [item, setItem] = useState(initial);
  const [editOpen, setEditOpen] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);

  const imgSrc = useMemo(() => safeRemoteImageUrl(item.image_url), [item.image_url]);

  const syncPatch = useCallback(
    async (body: Record<string, unknown>) => {
      const next = await patchItem(item.id, body);
      if (next) setItem(next);
      return next;
    },
    [item.id],
  );

  const onRetry = async () => {
    setRetryBusy(true);
    try {
      const res = await fetch(`/api/items/${item.id}/retry-enrichment`, { method: "POST" });
      if (!res.ok) return;

      setItem((prev) => ({
        ...prev,
        processing_status: "pending",
        enrichment_error: null,
      }));

      for (let attempt = 0; attempt < 45; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const next = await fetchItem(item.id);
        if (!next) continue;
        if (next.processing_status === "ready" || next.processing_status === "failed") {
          setItem(next);
          return;
        }
      }
    } finally {
      setRetryBusy(false);
    }
  };

  const showRefreshMetadata =
    item.processing_status === "ready" || item.processing_status === "failed";
  const refreshLabel =
    item.processing_status === "failed" ? "Retry enrichment" : "Refresh metadata";

  const collectionNames = collections
    .filter((c) => item.collection_ids.includes(c.id))
    .map((c) => c.name);

  return (
    <article className="pb-12">
      <Link
        href="/library"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        ← Library
      </Link>

      <div className="relative mt-4 h-[min(40vh,28rem)] w-full overflow-hidden rounded-xl bg-muted shadow-sm ring-1 ring-foreground/10">
        {imgSrc ? (
          <Image
            src={imgSrc}
            alt=""
            fill
            priority
            className="object-cover"
            sizes="(max-width:768px) 100vw, min(896px, 100vw)"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {item.processing_status === "pending" || item.processing_status === "processing"
              ? "Fetching preview image…"
              : item.domain}
          </div>
        )}
      </div>

      <header className="mt-6">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{formatStatus(item.status)}</Badge>
          {item.category ? (
            <Badge variant="outline">{formatCategory(item.category)}</Badge>
          ) : null}
          {item.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>

        <h1 className="mt-4 font-serif text-3xl leading-tight tracking-tight text-foreground">
          {item.title ?? item.domain}
        </h1>
        {item.subtitle ? (
          <p className="mt-2 text-base text-muted-foreground">{item.subtitle}</p>
        ) : null}

        {collectionNames.length > 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            In{" "}
            {collectionNames.map((name, i) => (
              <span key={name}>
                {i > 0 ? ", " : null}
                <span className="font-medium text-foreground">{name}</span>
              </span>
            ))}
          </p>
        ) : null}

        {item.note ? (
          <p className="mt-4 rounded-xl border border-border bg-card px-4 py-3 text-sm leading-relaxed text-foreground">
            {item.note}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            nativeButton={false}
            render={<a href={item.url} target="_blank" rel="noopener noreferrer" />}
            className="gap-1.5"
          >
            <ExternalLink className="size-4" />
            Open original
          </Button>
          <Button type="button" variant="outline" className="gap-1.5" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            Edit details
          </Button>
          {showRefreshMetadata ? (
            <Button
              type="button"
              variant="outline"
              disabled={retryBusy}
              className="gap-1.5"
              onClick={() => void onRetry()}
            >
              <RefreshCw className={`size-4 ${retryBusy ? "animate-spin" : ""}`} />
              {retryBusy ? "Refreshing…" : refreshLabel}
            </Button>
          ) : null}
        </div>

        {item.enrichment_error ? (
          <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {item.enrichment_error}
          </p>
        ) : null}
      </header>

      <StructuredFields structured={item.structured} />

      <ItemEditSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        item={item}
        collections={collections}
        onSave={syncPatch}
      />
    </article>
  );
}
