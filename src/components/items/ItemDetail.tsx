"use client";

import { Link } from "next-view-transitions";
import { useRouter } from "next/navigation";
import { ExternalLink, MoreHorizontal, Pencil, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BookFileField } from "@/components/items/BookFileField";
import { ItemAiReviewDialog } from "@/components/items/ItemAiReviewDialog";
import { ItemEditSheet } from "@/components/items/ItemEditSheet";
import { ItemRatingCard } from "@/components/items/ItemRatingCard";
import { RelatedItemsStrip } from "@/components/items/RelatedItemsStrip";
import { StructuredFields } from "@/components/items/StructuredFields";
import {
  getBylineDetailKeys,
  getDetailByline,
  prefersLightText,
} from "@/components/items/item-detail-header";
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
import { doneVerb, formatCategory, formatEnrichmentError } from "@/lib/item-labels";
import type { LibraryItemRow } from "@/lib/types/library-item";
import { cn } from "@/lib/utils";
import type {
  AiEnrichmentApplyRequestBody,
  AiEnrichmentProposalResponseBody,
  ItemDetailResponseBody,
} from "@/lib/types/api";

export type ItemDetailModel = ItemDetailResponseBody;

// TODO(adr-0019): use cleanDisplayTitle from @/lib/display-title
const displayTitle = (title: string): string => title;

/** Backdrop and cover tint for items without a sampled `dominant_color`. */
const FALLBACK_TINT = "#78716c";

/** Typographic stand-in cover, tinted with the item's dominant color. */
function TypeCover({
  color,
  category,
  title,
  footer,
}: {
  color: string;
  category: string | null;
  title: string;
  footer: string;
}) {
  return (
    <div
      data-testid="item-type-cover"
      className={cn(
        "flex aspect-[2/3] h-72 flex-col justify-between overflow-hidden rounded-lg p-5 shadow-2xl ring-1 ring-black/10 sm:h-80 lg:h-96",
        prefersLightText(color) ? "text-white" : "text-stone-900",
      )}
      style={{ backgroundColor: color }}
    >
      <span className="font-mono text-[10px] uppercase tracking-widest opacity-70">{category}</span>
      <span className="line-clamp-6 font-serif text-2xl leading-tight break-words">{title}</span>
      <span className="truncate text-[11px] opacity-70">{footer}</span>
    </div>
  );
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
  showBookFile,
}: {
  initial: ItemDetailModel;
  related?: LibraryItemRow[];
  /** Server-computed reveal gate; see src/lib/book-file-reveal.ts. */
  showBookFile: boolean;
}) {
  const router = useRouter();
  const [item, setItem] = useState(initial);
  const [editOpen, setEditOpen] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
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
        setAiProposalError("Could not prepare an AI proposal. Try again later.");
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

  const title = displayTitle(item.title ?? item.domain);
  const byline = getDetailByline(item.category, item.subtitle, item.structured);
  const omitDetailKeys = [
    ...(item.description ? ["description"] : []),
    ...getBylineDetailKeys(item.category, item.structured, byline),
  ];
  const savedDate = item.created_at ? formatDateMedium(item.created_at) : null;
  const descIsLong = (item.description?.length ?? 0) > 350;
  const verb = doneVerb(item.category);
  const isDone = item.status === "done";
  const tint = item.dominant_color ?? FALLBACK_TINT;
  const isFetching =
    item.processing_status === "pending" || item.processing_status === "processing";

  return (
    <article className="relative pb-12">
      {/* Ambient backdrop: a blurred, tinted copy of the cover behind the main
          column. It starts right of the desktop sidebar (w-56). */}
      <div
        aria-hidden
        data-testid="item-ambient"
        className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[85vh] overflow-hidden lg:left-56"
        style={{
          maskImage: "linear-gradient(to bottom, black 35%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, black 35%, transparent)",
        }}
      >
        {imgSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- Remote image hosts are untrusted; avoid the server-side image proxy.
          <img
            src={imgSrc}
            alt=""
            className="absolute -inset-x-[10%] top-0 h-[80vh] w-[120%] scale-110 object-cover opacity-70 blur-3xl saturate-150"
          />
        ) : null}
        <div
          className="absolute inset-x-0 top-0 h-[80vh]"
          style={{
            background: `radial-gradient(120% 70% at 50% 0%, color-mix(in oklab, ${tint} 80%, transparent), transparent 70%)`,
          }}
        />
        <div className="absolute inset-x-0 top-0 h-[80vh] bg-gradient-to-b from-transparent via-background/60 to-background" />
      </div>

      <div className="relative z-10">
        <Link
          href="/library"
          className="-ml-1 inline-flex min-h-11 items-center rounded-md px-1 text-sm font-medium text-foreground/80 hover:text-foreground lg-fine:min-h-0 lg-fine:py-0"
        >
          ← Library
        </Link>

        <div className="mt-4 flex flex-col items-center">
          {imgSrc ? (
            <div className="overflow-hidden rounded-lg shadow-2xl ring-1 ring-black/10">
              {/* eslint-disable-next-line @next/next/no-img-element -- Remote image hosts are untrusted; avoid the server-side image proxy. */}
              <img
                src={imgSrc}
                alt=""
                className="block h-auto max-h-72 w-auto max-w-full sm:max-h-80 lg:max-h-96"
              />
            </div>
          ) : (
            <TypeCover
              color={tint}
              category={item.category ? formatCategory(item.category) : null}
              title={title}
              footer={isFetching ? "Fetching cover…" : item.domain}
            />
          )}

          <header className="mt-6 w-full max-w-2xl min-w-0 text-center">
            {item.category ? (
              <p className="font-mono text-[11px] uppercase tracking-widest text-foreground/70">
                {formatCategory(item.category)}
              </p>
            ) : null}
            <h1 className="mt-2 font-serif text-3xl leading-tight tracking-tight text-balance break-words text-foreground lg:text-4xl">
              {title}
            </h1>
            {byline ? <p className="mt-2 text-sm text-foreground/70">{byline}</p> : null}
          </header>

          <ItemRatingCard
            className="mt-6 w-full max-w-md"
            verb={verb}
            isDone={isDone}
            rating={item.rating_personal}
            verdict={item.verdict}
            doneAt={item.done_at}
            onSave={async (patch) => (await syncPatch(patch)) != null}
          />

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button
              nativeButton={false}
              variant="outline"
              render={<a href={item.url} target="_blank" rel="noopener noreferrer" />}
              className="min-h-11 gap-1.5 rounded-full bg-card/80 px-4 backdrop-blur lg-fine:min-h-8"
            >
              <ExternalLink className="size-4" />
              {item.domain.replace(/^www\./, "")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 min-w-11 rounded-full bg-card/80 px-3 backdrop-blur lg-fine:min-h-8 lg-fine:min-w-8"
                    aria-label="More actions"
                    disabled={retryBusy || aiProposalBusy || aiApplyBusy || deleteBusy}
                  />
                }
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-56">
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
        </div>

        <div className="mx-auto mt-8 max-w-2xl">
          {item.enrichment_error ? (
            <p className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {formatEnrichmentError(item.enrichment_error)}
            </p>
          ) : null}

          {item.note ? (
            <div className="mb-5 rounded-xl border border-border bg-accent/40 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-foreground">
                Your note
              </p>
              <p className="mt-1 text-sm leading-relaxed text-foreground">{item.note}</p>
            </div>
          ) : null}

          {item.description ? (
            <section aria-label="About">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                About
              </h2>
              <p
                className={`mt-2 text-[15px] leading-relaxed whitespace-pre-line text-foreground/90 ${
                  descIsLong && !descExpanded ? "line-clamp-6" : ""
                }`}
              >
                {item.description}
              </p>
              {descIsLong ? (
                <button
                  type="button"
                  className="ks-pointer-coarse-min-hit mt-1.5 inline-flex items-center rounded-sm text-sm font-medium text-accent-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            omitKeys={omitDetailKeys}
          />

          {showBookFile ? (
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
          ) : null}

          {savedDate ? (
            <p className="mt-6 text-xs text-muted-foreground">Saved {savedDate}</p>
          ) : null}
        </div>

        <RelatedItemsStrip items={related} />
      </div>

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
              Delete &quot;{title}&quot; permanently from your library. This cannot be undone.
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
