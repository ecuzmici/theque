"use client";

import { AlertTriangle, RotateCw, Sparkles, X } from "lucide-react";

import { cn } from "@/lib/utils";

/** The pill mirrors the run lifecycle minus "empty" (it only shows when minimized). */
export type PillStatus = "loading" | "ready" | "error";

type RecommendPillProps = {
  status: PillStatus;
  /** The mood text of the run. The pill shows it after the status. */
  steer?: string;
  onReopen: () => void;
  onRetry: () => void;
  onDismiss: () => void;
};

/**
 * The floating indicator that stands in for a minimized recommendation run.
 * Loading and ready states reopen the deck on tap; the error state offers an
 * inline retry. The × always dismisses. Sits bottom-right on desktop and clears
 * the floating + button via `--ks-fab-clearance` + `env(safe-area-inset-bottom)`.
 */
export function RecommendPill({
  status,
  steer = "",
  onReopen,
  onRetry,
  onDismiss,
}: RecommendPillProps) {
  const text =
    status === "loading"
      ? "Searching…"
      : status === "ready"
        ? "Ready"
        : "Couldn't load";

  return (
    <div
      className={cn(
        "fixed right-4 z-40 flex items-center gap-1 rounded-full border px-3 shadow-lg backdrop-blur",
        "bottom-[calc(var(--ks-fab-clearance)+env(safe-area-inset-bottom))] lg:bottom-[calc(var(--ks-fab-clearance)+0.75rem)] lg:right-8",
        "animate-in fade-in-0 slide-in-from-bottom-2 duration-200",
        status === "ready" && "border-amber-500/40 bg-amber-500/10 ring-2 ring-amber-500/30",
        status === "loading" && "border-border bg-card/95",
        status === "error" && "border-destructive/40 bg-destructive/10 ring-2 ring-destructive/20",
      )}
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        onClick={status === "error" ? onRetry : onReopen}
        className="ks-pointer-coarse-min-hit flex min-h-11 items-center gap-2 rounded-full py-2 text-sm font-medium text-foreground"
      >
        {status === "loading" ? (
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground"
            aria-hidden
          />
        ) : status === "ready" ? (
          <Sparkles className="size-4 text-amber-600" aria-hidden />
        ) : (
          <AlertTriangle className="size-4 text-destructive" aria-hidden />
        )}
        <span>{text}</span>
        {steer ? (
          <span className="max-w-28 truncate font-normal text-muted-foreground sm:max-w-44">
            {steer}
          </span>
        ) : null}
        {status === "error" ? (
          <RotateCw className="ml-1 size-4 text-muted-foreground" aria-hidden />
        ) : null}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss recommendations"
        className="ks-pointer-coarse-min-hit inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
