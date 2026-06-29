"use client";

import { Sparkles, X } from "lucide-react";

import type { RecommendShelfId } from "@/lib/recommend/recommend-types";
import { cn } from "@/lib/utils";

const SHELF_LABELS: Record<RecommendShelfId, string> = {
  books: "Books",
  watch: "Watch",
};

type RecommendPillProps = {
  shelf: RecommendShelfId;
  /** Loading vs ready (error state lands in #30). */
  loading: boolean;
  onReopen: () => void;
  onDismiss: () => void;
};

/**
 * The floating indicator that stands in for a minimized recommendation run.
 * Tapping the body reopens the deck; the × dismisses the run. Sits bottom-right
 * on desktop and clears the mobile bottom nav via `--ks-nav-height` +
 * `env(safe-area-inset-bottom)`.
 */
export function RecommendPill({ shelf, loading, onReopen, onDismiss }: RecommendPillProps) {
  const label = SHELF_LABELS[shelf];

  return (
    <div
      className={cn(
        "fixed right-4 z-40 flex items-center gap-1 rounded-full border shadow-lg backdrop-blur",
        "bottom-[calc(var(--ks-nav-height)+env(safe-area-inset-bottom)+0.75rem)] lg:bottom-6 lg:right-6",
        "animate-in fade-in-0 slide-in-from-bottom-2 duration-200",
        loading
          ? "border-border bg-card/95"
          : "border-amber-500/40 bg-amber-500/10 ring-2 ring-amber-500/30",
      )}
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        onClick={onReopen}
        className="ks-pointer-coarse-min-hit flex min-h-11 items-center gap-2 rounded-full py-2 pl-4 pr-2 text-sm font-medium text-foreground"
      >
        {loading ? (
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground"
            aria-hidden
          />
        ) : (
          <Sparkles className="size-4 text-amber-600" aria-hidden />
        )}
        <span>{loading ? `Finding ${label} picks…` : `${label} picks ready`}</span>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss recommendations"
        className="ks-pointer-coarse-min-hit mr-1 inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
