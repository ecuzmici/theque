"use client";

import { useEffect, useState } from "react";
import { Bookmark, ChevronDown, Play, Star, Tv, X } from "lucide-react";

import { CoverImage } from "@/components/recommend/CoverImage";
import { LOADING_STATUS_LINES } from "@/components/recommend/recommend-deck-utils";
import { ReasonChips } from "@/components/recommend/ReasonChips";
import type { RecommendationRunApi } from "@/components/recommend/useRecommendationRun";
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
              {card.trailer_url ? (
                <a
                  href={card.trailer_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ks-pointer-coarse-min-hit inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 transition-colors hover:bg-muted/70 hover:text-foreground"
                >
                  <Play className="size-3" aria-hidden /> Trailer
                </a>
              ) : null}
            </div>
            {card.providers?.length ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Tv className="size-3.5 shrink-0" aria-hidden />
                {card.providers_link ? (
                  <a
                    href={card.providers_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ks-pointer-coarse-min-hit underline-offset-2 hover:underline"
                  >
                    {card.providers.join(" · ")}
                  </a>
                ) : (
                  <span>{card.providers.join(" · ")}</span>
                )}
              </p>
            ) : null}
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-foreground/90">{card.description}</p>

        {card.opening_line ? (
          <p className="mt-3 border-l-2 border-border pl-3 text-sm italic leading-relaxed text-muted-foreground">
            &ldquo;{card.opening_line}&rdquo;
          </p>
        ) : null}

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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDismissCancel}
            className="self-start px-0 text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="grid w-full grid-cols-2 gap-2">
            <Button
              variant="destructive"
              size="lg"
              className="gap-1.5 transition-transform active:scale-[0.98]"
              onClick={onDismissStart}
            >
              <X className="size-4" /> Not for me
            </Button>
            <Button
              size="lg"
              className="gap-1.5 transition-transform active:scale-[0.98]"
              onClick={onSave}
            >
              <Bookmark className="size-4" /> Save
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSkip}
            className="px-2 text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Skip for now
          </Button>
        </div>
      )}
    </>
  );
}

type RecommendDeckProps = {
  run: RecommendationRunApi;
};

export function RecommendDeck({ run }: RecommendDeckProps) {
  const { runStatus, cards, errorMessage, emptyReason, cursor } = run;
  const { index, outcomes, askReason } = cursor;
  const shelfId = run.shelf ?? "books";
  const steer = run.steer;

  const total = cards.length;
  const done = runStatus === "ready" && total > 0 && index >= total;
  const card = runStatus === "ready" && !done ? cards[index] : null;

  const shelfLabel = SHELF_LABELS[shelfId];
  const savedCount = Object.values(outcomes).filter((o) => o === "saved").length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-border py-3 pl-4 pr-14">
        <div>
          <h2 className="font-serif text-lg text-foreground">Recommendations for you</h2>
          <p className="text-xs text-muted-foreground">{shelfLabel} · AI-generated picks</p>
          {steer ? (
            <p className="mt-0.5 text-xs text-muted-foreground" title={steer}>
              In the mood for: <span className="font-medium text-foreground">{steer}</span>
            </p>
          ) : null}
        </div>
        {/* Explicit minimize — the only way to minimize on mobile, where the
            full-screen deck leaves no backdrop to click. Sits left of the
            Sheet's floating × (top-3 right-3). */}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={run.minimize}
          aria-label="Minimize to keep browsing"
          title="Minimize"
          className="ks-pointer-coarse-min-hit shrink-0"
        >
          <ChevronDown className="size-4" aria-hidden />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {runStatus === "loading" ? (
          <LoadingStatus />
        ) : runStatus === "error" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            <Button type="button" variant="outline" size="sm" onClick={run.retry}>
              Try again
            </Button>
          </div>
        ) : runStatus === "ready" && total === 0 && emptyReason === "exhausted" ? (
          // Honest dead-end (ADR 0016): retrying won't help — the user has seen
          // or owns everything close to their taste. Borrow the "all caught up"
          // voice rather than the misleading "try again later".
          <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
            <h2 className="font-serif text-2xl text-foreground">You&rsquo;re near the edge of your taste</h2>
            <p className="text-sm text-muted-foreground">
              We&rsquo;ve suggested everything close to what&rsquo;s on this shelf. Rate or add a few
              more titles and fresh picks will open up.
            </p>
          </div>
        ) : runStatus === "ready" && total === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
            <p className="text-sm text-muted-foreground">
              Couldn&rsquo;t find picks right now.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={run.retry}>
              Try again
            </Button>
          </div>
        ) : runStatus === "ready" && done ? (
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
              onSave={run.saveCard}
              onSkip={run.skipCard}
              onDismissStart={() => run.setAskReason(true)}
              askReason={askReason}
              onDismissReason={run.dismissCard}
              onDismissCancel={() => run.setAskReason(false)}
            />
          </div>
        ) : null}
      </div>

      {(runStatus === "ready" || runStatus === "loading") && (
        <div className="border-t border-border px-4 py-3">
          <p className="text-[11px] text-muted-foreground">
            {shelfId === "books"
              ? "AI picks, checked against Open Library and Google Books. A few may still be wrong."
              : "AI picks, checked against TMDB. Streaming data from JustWatch. A few may still be wrong."}
          </p>
        </div>
      )}
    </div>
  );
}
