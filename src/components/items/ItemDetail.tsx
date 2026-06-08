"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Pencil, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ItemAiReviewDialog } from "@/components/items/ItemAiReviewDialog";
import { ItemEditSheet } from "@/components/items/ItemEditSheet";
import { StructuredFields } from "@/components/items/StructuredFields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useItemStatusRealtime } from "@/hooks/useItemStatusRealtime";
import { getDisplayImageUrl } from "@/lib/item-display";
import { formatCategory, formatStatus } from "@/lib/item-labels";
import type {
  AiEnrichmentApplyRequestBody,
  AiEnrichmentProposalResponseBody,
  ItemDetailResponseBody,
} from "@/lib/types/api";

export type ItemDetailModel = ItemDetailResponseBody;


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

async function createAiProposal(itemId: string): Promise<AiEnrichmentProposalResponseBody | null> {
  const res = await fetch(`/api/items/${itemId}/ai-enrichment-proposal`, { method: "POST" });
  if (!res.ok) return null;
  return (await res.json()) as AiEnrichmentProposalResponseBody;
}

async function applyAiProposal(
  itemId: string,
  body: AiEnrichmentApplyRequestBody,
): Promise<ItemDetailModel | null> {
  const res = await fetch(`/api/items/${itemId}/ai-enrichment-apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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
  const router = useRouter();
  const [item, setItem] = useState(initial);
  const [editOpen, setEditOpen] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, []);

  useItemStatusRealtime(item.id, item.user_id, (row) => {
    setItem((prev) => ({ ...prev, ...row }));
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  });

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [aiReviewOpen, setAiReviewOpen] = useState(false);
  const [aiProposalBusy, setAiProposalBusy] = useState(false);
  const [aiApplyBusy, setAiApplyBusy] = useState(false);
  const [aiProposalError, setAiProposalError] = useState<string | null>(null);
  const [aiProposal, setAiProposal] = useState<AiEnrichmentProposalResponseBody["proposal"] | null>(null);
  const [aiProposalMetadata, setAiProposalMetadata] = useState<AiEnrichmentProposalResponseBody["proposal_metadata"] | null>(null);

  const imgSrc = useMemo(
    () => getDisplayImageUrl(item.image_storage_path, item.image_url),
    [item.image_storage_path, item.image_url],
  );

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

      // Realtime fires when enrichment completes. Fall back to a single REST fetch
      // after 60 s in case the socket never delivers the update.
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = setTimeout(async () => {
        fallbackTimerRef.current = null;
        const next = await fetchItem(item.id);
        if (next) setItem(next);
      }, 60_000);
    } finally {
      setRetryBusy(false);
    }
  };

  const onOpenAiReview = async () => {
    setAiReviewOpen(true);
    setAiProposal(null);
    setAiProposalMetadata(null);
    setAiProposalError(null);
    setAiProposalBusy(true);
    try {
      const next = await createAiProposal(item.id);
      if (!next) {
        setAiProposalError("Gemini could not prepare a rewrite proposal.");
        return;
      }
      setAiProposal(next.proposal);
      setAiProposalMetadata(next.proposal_metadata);
    } finally {
      setAiProposalBusy(false);
    }
  };

  const onApplyAiProposal = async () => {
    if (!aiProposal || !aiProposalMetadata) return;
    setAiApplyBusy(true);
    setAiProposalError(null);
    try {
      const next = await applyAiProposal(item.id, {
        proposal: aiProposal,
        proposal_metadata: aiProposalMetadata,
      });
      if (!next) {
        setAiProposalError("The AI rewrite could not be applied.");
        return;
      }
      setItem(next);
      setAiReviewOpen(false);
      setAiProposal(null);
      setAiProposalMetadata(null);
    } finally {
      setAiApplyBusy(false);
    }
  };

  const onDelete = async () => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/items/${item.id}`, { method: "DELETE" });
      if (!res.ok) {
        setDeleteError("Could not delete this item.");
        return;
      }
      setDeleteOpen(false);
      router.replace("/library");
      router.refresh();
    } finally {
      setDeleteBusy(false);
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
        className="-ml-1 inline-flex min-h-11 items-center rounded-md px-1 text-sm font-medium text-muted-foreground hover:text-foreground lg-fine:min-h-0 lg-fine:py-0"
      >
        ← Library
      </Link>

      <div className="relative mt-4 h-[min(40vh,28rem)] w-full overflow-hidden rounded-xl bg-muted shadow-sm ring-1 ring-foreground/10">
        {imgSrc ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- Remote image hosts are untrusted; avoid the server-side image proxy. */}
            <img
              src={imgSrc}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          </>
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
            className="min-h-11 gap-1.5 lg-fine:min-h-8"
          >
            <ExternalLink className="size-4" />
            Open original
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 gap-1.5 lg-fine:min-h-8"
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="size-4" />
            Edit details
          </Button>
          {showRefreshMetadata ? (
            <Button
              type="button"
              variant="outline"
              disabled={retryBusy}
              className="min-h-11 gap-1.5 lg-fine:min-h-8"
              onClick={() => void onRetry()}
            >
              <RefreshCw className={`size-4 ${retryBusy ? "animate-spin" : ""}`} />
              {retryBusy ? "Refreshing…" : refreshLabel}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={aiProposalBusy || aiApplyBusy}
            className="min-h-11 gap-1.5 lg-fine:min-h-8"
            onClick={() => void onOpenAiReview()}
          >
            <Sparkles className={`size-4 ${aiProposalBusy ? "animate-pulse" : ""}`} />
            {aiProposalBusy ? "Preparing AI review…" : "Enrich with AI"}
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
            Delete item
          </Button>
        </div>

        {item.enrichment_error ? (
          <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {item.enrichment_error}
          </p>
        ) : null}
      </header>

      <StructuredFields structured={item.structured} />

      <ItemAiReviewDialog
        open={aiReviewOpen}
        onOpenChange={(open) => {
          setAiReviewOpen(open);
          if (!open) {
            setAiProposalError(null);
            setAiProposal(null);
            setAiProposalMetadata(null);
          }
        }}
        item={item}
        proposal={aiProposal}
        loading={aiProposalBusy}
        applying={aiApplyBusy}
        error={aiProposalError}
        onApply={onApplyAiProposal}
      />

      <ItemEditSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        item={item}
        collections={collections}
        onSave={syncPatch}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete item?</DialogTitle>
            <DialogDescription>
              Delete &quot;{item.title ?? item.domain}&quot; permanently from your library. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={deleteBusy} onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={deleteBusy} onClick={() => void onDelete()}>
              {deleteBusy ? "Deleting..." : "Delete item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
