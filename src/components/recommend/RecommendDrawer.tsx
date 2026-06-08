"use client";

import { useState } from "react";

import { RecommendationCard } from "@/components/recommend/RecommendationCard";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { ResolvedRecommendation, RecommendShelfId } from "@/lib/recommend/recommend-types";
import type { RecommendState } from "@/components/recommend/useRecommendations";

const SHELF_LABELS: Record<RecommendShelfId, string> = {
  books: "Books",
  watch: "Watch",
};

type RecommendDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shelfId: RecommendShelfId;
  state: RecommendState;
  onRetry: () => void;
};

export function RecommendDrawer({
  open,
  onOpenChange,
  shelfId,
  state,
  onRetry,
}: RecommendDrawerProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());

  function handleDismiss(id: string) {
    setDismissed((prev) => new Set([...prev, id]));
  }

  async function handleSave(card: ResolvedRecommendation) {
    if (saving.has(card.id) || saved.has(card.id)) return;
    setSaving((prev) => new Set([...prev, card.id]));
    try {
      await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: card.canonical_url, source: "manual" }),
      });
      setSaved((prev) => new Set([...prev, card.id]));
    } catch {
      // silently fail — user can retry by clicking Save again
    } finally {
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(card.id);
        return next;
      });
    }
  }

  const shelfLabel = SHELF_LABELS[shelfId];

  const visibleCards =
    state.status === "done"
      ? state.cards.filter((c) => !dismissed.has(c.id) && !saved.has(c.id))
      : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Recommendations for you</SheetTitle>
          <SheetDescription>{shelfLabel} · AI-generated picks</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {state.status === "loading" ? (
            <div className="flex flex-col gap-3 pt-2">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-24 w-16 rounded-lg" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : state.status === "error" ? (
            <div className="flex flex-col items-center gap-4 pt-8 text-center">
              <p className="text-sm text-muted-foreground">{state.message}</p>
              <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                Try again
              </Button>
            </div>
          ) : state.status === "done" ? (
            visibleCards.length === 0 ? (
              <p className="pt-8 text-center text-sm text-muted-foreground">
                No new recommendations right now. Try again later.
              </p>
            ) : (
              <div className="flex flex-col gap-3 pt-2">
                {visibleCards.map((card) => (
                  <RecommendationCard
                    key={card.id}
                    card={card}
                    onSave={handleSave}
                    onDismiss={handleDismiss}
                    saving={saving.has(card.id)}
                  />
                ))}
              </div>
            )
          ) : null}
        </div>

        {/* Footer disclaimer */}
        {(state.status === "done" || state.status === "loading") && (
          <div className="border-t border-border px-4 py-3">
            <p className="text-[11px] text-muted-foreground">
              AI-generated; verified against{" "}
              {shelfId === "books" ? "Open Library" : "TMDB"} but may still be off.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
