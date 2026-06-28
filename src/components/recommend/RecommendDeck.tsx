"use client";

import { useEffect, useState } from "react";
import { Bookmark, SkipForward, Star, X } from "lucide-react";

import { CoverImage } from "@/components/recommend/CoverImage";
import {
  captureRecommendationUrl,
  LOADING_STATUS_LINES,
  logRecommendOutcome,
} from "@/components/recommend/recommend-deck-utils";
import { ReasonChips } from "@/components/recommend/ReasonChips";
import type { RecommendState } from "@/components/recommend/useRecommendations";
import { Button } from "@/components/ui/button";
import type {
  RecommendDismissReason,
  RecommendShelfId,
  ResolvedRecommendation,
} from "@/lib/recommend/recommend-types";

const SHELF_LABELS: Record<RecommendShelfId, string> = {
  books: "Books",
  watch: "Watch",
};

const STATUS_ROTATE_MS = 2000;

type DeckOutcome = "saved" | "skipped" | "dismissed";

function LoadingStatus() {
  const [lineIndex, setLineIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setLineIndex((i) => (i + 1) % LOADING_STATUS_LINES.length);
    }, STATUS_ROTATE_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
      <p
        key={lineIndex}
        className="animate-in fade-in-0 text-sm text-muted-foreground duration-300"
      >
        {LOADING_STATUS_LINES[lineIndex]}
      </p>
    </div>
  );
}

function RecommendCard({
  card,
  onSave,
  onSkip,
  onDismissStart,
  askReason,
  onDismissReason,
  onDismissCancel,
}: {
  card: ResolvedRecommendation;
  onSave: () => void;
  onSkip: () => void;
  onDismissStart: () => void;
  askReason: boolean;
  onDismissReason: (reason: RecommendDismissReason) => void;
  onDismissCancel: () => void;
}) {
  const genres = card.genres ?? [];
  const hasRating = card.source_rating != null && card.source_rating > 0;

  return (
    <>
      <article
        key={card.outcome_id}
        className="animate-in fade-in-0 slide-in-from-right-6 rounded-2xl border border-border bg-card p-4 shadow-sm duration-300 ease-out sm:p-5"
      >
        <div className="flex gap-4 sm:gap-5">
          <CoverImage
            src={card.cover_url}
            alt={card.title}
            className="h-44 w-28 shrink-0 rounded-lg shadow-md sm:h-56 sm:w-36"
          />
          <div className="flex min-w-0 flex-col">
            <h2 className="font-serif text-xl leading-tight text-foreground sm:text-2xl">
              {card.title}
            </h2>
            {card.subtitle ? (
              <p className="mt-1 text-sm text-muted-foreground">{card.subtitle}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {hasRating ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1">
                  <Star className="size-3 fill-amber-500 text-amber-500" />
                  {card.source_rating!.toFixed(1)}
                  {card.rating_count ? (
                    <span className="text-muted-foreground/60">({card.rating_count})</span>
                  ) : null}
                </span>
              ) : null}
              {card.length ? (
                <span className="rounded-md bg-muted px-2 py-1">{card.length}</span>
              ) : null}
              {genres.map((g) => (
                <span key={g} className="rounded-md bg-muted px-2 py-1">
                  {g}
                </span>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-foreground/90">{card.description}</p>

        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600/80">
            Why you
          </p>
          <p className="mt-1 text-sm italic leading-relaxed text-foreground/80">{card.reason}</p>
        </div>
      </article>

      {askReason ? (
        <div className="animate-in fade-in-0 slide-in-from-bottom-2 flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-4 duration-200">
          <ReasonChips
            label="Not for me because…"
            onPick={onDismissReason}
          />
          <button
            type="button"
            onClick={onDismissCancel}
            className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            className="gap-1.5 px-2 text-xs transition-transform active:scale-95 sm:text-sm"
            onClick={onDismissStart}
          >
            <X className="size-4" /> Not for me
          </Button>
          <Button
            variant="ghost"
            className="gap-1.5 px-2 text-xs transition-transform active:scale-95 sm:text-sm"
            onClick={onSkip}
          >
            <SkipForward className="size-4" /> Skip
          </Button>
          <Button
            className="gap-1.5 px-2 text-xs transition-transform active:scale-95 sm:text-sm"
            onClick={onSave}
          >
            <Bookmark className="size-4" /> Save
          </Button>
        </div>
      )}
    </>
  );
}

type RecommendDeckProps = {
  shelfId: RecommendShelfId;
  state: RecommendState;
  onRetry: () => void;
};

export function RecommendDeck({ shelfId, state, onRetry }: RecommendDeckProps) {
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<Record<string, DeckOutcome>>({});
  const [askReason, setAskReason] = useState(false);

  const cards = state.status === "done" ? state.cards : [];
  const total = cards.length;
  const done = state.status === "done" && total > 0 && index >= total;
  const card = state.status === "done" && !done ? cards[index] : null;

  const cardsKey =
    state.status === "done" ? state.cards.map((c) => c.outcome_id).join(",") : "";

  useEffect(() => {
    if (state.status === "loading" || state.status === "idle") {
      setIndex(0);
      setOutcomes({});
      setAskReason(false);
      return;
    }
    if (state.status === "done") {
      setIndex(0);
      setOutcomes({});
      setAskReason(false);
    }
  }, [state.status, cardsKey]);

  function advance() {
    setAskReason(false);
    setIndex((i) => i + 1);
  }

  function handleSave() {
    if (!card) return;
    logRecommendOutcome(card.outcome_id, "saved");
    captureRecommendationUrl(card.canonical_url);
    setOutcomes((prev) => ({ ...prev, [card.outcome_id]: "saved" }));
    advance();
  }

  function handleSkip() {
    if (!card) return;
    setOutcomes((prev) => ({ ...prev, [card.outcome_id]: "skipped" }));
    advance();
  }

  function handleDismiss(reason: RecommendDismissReason) {
    if (!card) return;
    logRecommendOutcome(card.outcome_id, "dismissed", reason);
    setOutcomes((prev) => ({ ...prev, [card.outcome_id]: "dismissed" }));
    advance();
  }

  const shelfLabel = SHELF_LABELS[shelfId];
  const savedCount = Object.values(outcomes).filter((o) => o === "saved").length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-4 py-3">
        <h2 className="font-serif text-lg text-foreground">Recommendations for you</h2>
        <p className="text-xs text-muted-foreground">{shelfLabel} · AI-generated picks</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {state.status === "loading" ? (
          <LoadingStatus />
        ) : state.status === "error" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
            <p className="text-sm text-muted-foreground">{state.message}</p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : state.status === "done" && total === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
            <p className="text-sm text-muted-foreground">
              No new recommendations right now. Try again later.
            </p>
          </div>
        ) : state.status === "done" && done ? (
          <div className="mx-auto flex max-w-md animate-in fade-in-0 zoom-in-95 flex-col items-center gap-4 px-4 py-16 text-center duration-300">
            <h2 className="font-serif text-2xl text-foreground">You&rsquo;re all caught up</h2>
            <p className="text-sm text-muted-foreground">
              Reviewed {total} picks · saved {savedCount}. New recommendations refresh as you rate
              more.
            </p>
          </div>
        ) : card ? (
          <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6 sm:py-8">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recommendation {index + 1} of {total}
              </p>
              <div className="flex gap-1">
                {cards.map((c, i) => (
                  <span
                    key={c.outcome_id}
                    className={`h-1.5 w-5 rounded-full transition-colors duration-300 sm:w-6 ${
                      i <= index ? "bg-foreground/70" : "bg-border"
                    }`}
                  />
                ))}
              </div>
            </div>

            <RecommendCard
              card={card}
              onSave={handleSave}
              onSkip={handleSkip}
              onDismissStart={() => setAskReason(true)}
              askReason={askReason}
              onDismissReason={handleDismiss}
              onDismissCancel={() => setAskReason(false)}
            />
          </div>
        ) : null}
      </div>

      {(state.status === "done" || state.status === "loading") && (
        <div className="border-t border-border px-4 py-3">
          <p className="text-[11px] text-muted-foreground">
            AI picks, checked against {shelfId === "books" ? "Open Library" : "TMDB"}. A few may
            still be wrong.
          </p>
        </div>
      )}
    </div>
  );
}
