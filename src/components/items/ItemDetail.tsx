"use client";

import { Link } from "next-view-transitions";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, MoreHorizontal, Pencil, RefreshCw, Sparkles, Star, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BookFileField } from "@/components/items/BookFileField";
import { ItemAiReviewDialog } from "@/components/items/ItemAiReviewDialog";
import { ItemEditSheet } from "@/components/items/ItemEditSheet";
import { ItemMarkDoneDialog } from "@/components/items/ItemMarkDoneDialog";
import { RelatedItemsStrip } from "@/components/items/RelatedItemsStrip";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useItemStatusRealtime } from "@/hooks/useItemStatusRealtime";
import { formatDateMedium } from "@/lib/format-timestamp";
import { getDisplayImageUrl } from "@/lib/item-display";
import { getHeadlineFacts } from "@/lib/item-detail-display";
import { doneVerb, formatCategory, formatStatus } from "@/lib/item-labels";
import type { LibraryItemRow } from "@/lib/types/library-item";
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
  related = [],
}: {
  initial: ItemDetailModel;
  related?: LibraryItemRow[];
}) {
  const router = useRouter();
  const [item, setItem] = useState(initial);
  const [editOpen, setEditOpen] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [markDoneOpen, setMarkDoneOpen] = useState(false);
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

  const facts = getHeadlineFacts(item.category, item.structured);
  const savedDate = item.created_at ? formatDateMedium(item.created_at) : null;
  const descIsLong = (item.description?.length ?? 0) > 350;
  const verb = doneVerb(item.category);
  const isDone = item.status === "done";
  const doneDate = item.done_at ? formatDateMedium(item.done_at) : null;

  return (
    <article className="pb-12">
      <Link
        href="/library"
        className="-ml-1 inline-flex min-h-11 items-center rounded-md px-1 text-sm font-medium text-muted-foreground hover:text-foreground lg-fine:min-h-0 lg-fine:py-0"
      >
        ← Library
      </Link>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
        {/* Cover pane — sticky alongside the metadata on desktop */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div
            className="overflow-hidden rounded-xl bg-muted shadow-sm ring-1 ring-foreground/10"
            style={item.dominant_color ? { backgroundColor: item.dominant_color } : undefined}
          >
            {imgSrc ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- Remote image hosts are untrusted; avoid the server-side image proxy. */}
                <img
                  src={imgSrc}
                  alt=""
                  className="h-auto max-h-[40vh] w-full object-contain lg:max-h-[32rem]"
                />
              </>
            ) : (
              <div className="flex h-56 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                {item.processing_status === "pending" || item.processing_status === "processing"
                  ? "Fetching preview image…"
                  : item.domain}
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Saved from{" "}
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              {item.domain}
            </a>
            {savedDate ? <> · {savedDate}</> : null}
          </p>
        </div>

        {/* Metadata pane */}
        <header className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{formatStatus(item.status)}</Badge>
            {item.category ? (
              <Badge variant="outline">{formatCategory(item.category)}</Badge>
            ) : null}
          </div>

          <h1 className="mt-4 font-serif text-3xl leading-tight tracking-tight text-foreground">
            {item.title ?? item.domain}
          </h1>
          {item.subtitle ? (
            <p className="mt-2 text-base text-muted-foreground">{item.subtitle}</p>
          ) : null}
          {facts.length > 0 ? (
            <p className="mt-1.5 text-sm text-muted-foreground">{facts.join(" · ")}</p>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-2">
          <Button
            type="button"
            variant={isDone ? "outline" : "default"}
            className="min-h-11 gap-1.5 lg-fine:min-h-8"
            onClick={() => {
              if (!isDone) {
                void syncPatch({ status: "done" }).then((next) => {
                  if (next) setMarkDoneOpen(true);
                });
              } else {
                setMarkDoneOpen(true);
              }
            }}
          >
            <CheckCircle2 className="size-4" />
            {isDone ? "Edit verdict" : `Mark as ${verb}`}
          </Button>
          <Button
            nativeButton={false}
            variant={isDone ? "default" : "outline"}
            render={<a href={item.url} target="_blank" rel="noopener noreferrer" />}
            className="min-h-11 gap-1.5 lg-fine:min-h-8"
          >
            <ExternalLink className="size-4" />
            Open original
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 gap-1.5 px-3 lg-fine:min-h-8"
                  aria-label="More actions"
                  disabled={retryBusy || aiProposalBusy || aiApplyBusy || deleteBusy}
                />
              }
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" />
                Edit details
              </DropdownMenuItem>
              {showRefreshMetadata ? (
                <DropdownMenuItem disabled={retryBusy} onClick={() => void onRetry()}>
                  <RefreshCw className={`size-4 ${retryBusy ? "animate-spin" : ""}`} />
                  {retryBusy ? "Refreshing…" : refreshLabel}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                disabled={aiProposalBusy || aiApplyBusy}
                onClick={() => void onOpenAiReview()}
              >
                <Sparkles className={`size-4 ${aiProposalBusy ? "animate-pulse" : ""}`} />
                {aiProposalBusy ? "Preparing AI review…" : "Enrich with AI"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  setDeleteError(null);
                  setDeleteOpen(true);
                }}
              >
                <Trash2 className="size-4" />
                Delete item
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

          {item.enrichment_error ? (
            <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {item.enrichment_error}
            </p>
          ) : null}

          {item.note ? (
            <div className="mt-5 rounded-xl border border-border bg-accent/40 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-foreground">
                Your note
              </p>
              <p className="mt-1 text-sm leading-relaxed text-foreground">{item.note}</p>
            </div>
          ) : null}

          {isDone && (item.rating_personal != null || item.verdict || doneDate) ? (
            <div className="mt-5 rounded-xl border border-border bg-accent/40 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-foreground">
                Your verdict
              </p>
              {item.rating_personal != null ? (
                <div className="mt-1.5 flex items-center gap-0.5" aria-label={`${item.rating_personal} of 5 stars`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      className={
                        n <= (item.rating_personal ?? 0)
                          ? "size-4 fill-amber-500 text-amber-500"
                          : "size-4 text-muted-foreground/40"
                      }
                      aria-hidden
                    />
                  ))}
                </div>
              ) : null}
              {item.verdict ? (
                <p className="mt-1.5 text-sm leading-relaxed text-foreground">{item.verdict}</p>
              ) : null}
              <p className="mt-1.5 text-xs text-muted-foreground">
                Marked {verb}
                {doneDate ? <> · {doneDate}</> : null}
              </p>
            </div>
          ) : null}

          {item.description ? (
            <section className="mt-5" aria-label="About">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                About
              </h2>
              <p
                className={`mt-2 text-sm leading-relaxed whitespace-pre-line text-foreground/90 ${
                  descIsLong && !descExpanded ? "line-clamp-6" : ""
                }`}
              >
                {item.description}
              </p>
              {descIsLong ? (
                <button
                  type="button"
                  className="ks-pointer-coarse-min-hit mt-1.5 inline-flex items-center text-sm font-medium text-accent-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                  onClick={() => setDescExpanded((v) => !v)}
                >
                  {descExpanded ? "Show less" : "Show more"}
                </button>
              ) : null}
            </section>
          ) : null}

          <StructuredFields
            category={item.category}
            structured={item.structured}
            omitKeys={item.description ? ["description"] : undefined}
          />

          <BookFileField
            itemId={item.id}
            category={item.category}
            initialFile={
              item.file_name && item.file_bytes != null && item.file_uploaded_at
                ? {
                    name: item.file_name,
                    bytes: item.file_bytes,
                    uploaded_at: item.file_uploaded_at,
                  }
                : null
            }
          />
        </header>
      </div>

      <RelatedItemsStrip items={related} />

      <ItemMarkDoneDialog
        key={`${item.id}:${markDoneOpen}`}
        open={markDoneOpen}
        onOpenChange={setMarkDoneOpen}
        verb={verb}
        title={item.title ?? item.domain}
        initialRating={item.rating_personal}
        initialVerdict={item.verdict}
        onSave={async (rating, verdict) => {
          const next = await syncPatch({
            ...(isDone ? {} : { status: "done" }),
            rating_personal: rating,
            verdict,
          });
          return next != null;
        }}
      />

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
