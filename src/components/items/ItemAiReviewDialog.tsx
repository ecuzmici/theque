"use client";

import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildAiReviewRows } from "@/lib/items/ai-review";
import type { AiItemRewriteProposal } from "@/lib/types/api";
import type { ItemDetailModel } from "@/components/items/ItemDetail";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

type ItemAiReviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ItemDetailModel;
  proposal: AiItemRewriteProposal | null;
  loading: boolean;
  applying: boolean;
  error: string | null;
  onApply: () => Promise<void>;
};

export function ItemAiReviewDialog({
  open,
  onOpenChange,
  item,
  proposal,
  loading,
  applying,
  error,
  onApply,
}: ItemAiReviewDialogProps) {
  const rows = useMemo(() => {
    if (!proposal) return [];
    return buildAiReviewRows(
      {
        title: item.title,
        subtitle: item.subtitle,
        description: item.description,
        image_url: item.image_url,
        category: item.category,
        category_confidence: item.category_confidence,
        structured: asRecord(item.structured),
      },
      proposal,
    ).filter((row) => row.changed);
  }, [item, proposal]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,46rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Enrich with AI</DialogTitle>
          <DialogDescription>
            Review Gemini&apos;s proposed metadata rewrite before applying it to this item.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="rounded-xl border border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
            Gemini is preparing a rewrite proposal…
          </p>
        ) : null}

        {!loading && error ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {!loading && !error && proposal ? (
          <div className="space-y-3">
            {rows.length === 0 ? (
              <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                Gemini did not propose any changes for this item.
              </p>
            ) : (
              rows.map((row) => (
                <section
                  key={row.key}
                  className="rounded-xl border border-border bg-card p-4 ring-1 ring-foreground/10"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-medium text-foreground">{row.label}</h3>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Changed
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Current
                      </p>
                      <pre className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                        {row.current}
                      </pre>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Proposed
                      </p>
                      <pre className="whitespace-pre-wrap break-words text-sm text-foreground">
                        {row.proposed}
                      </pre>
                    </div>
                  </div>
                </section>
              ))
            )}

            {proposal.notes ? (
              <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                {proposal.notes}
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter showCloseButton>
          {proposal && rows.length > 0 ? (
            <Button type="button" disabled={loading || applying} onClick={() => void onApply()}>
              {applying ? "Applying…" : "Apply proposal"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
