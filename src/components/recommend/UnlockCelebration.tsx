"use client";

/**
 * One-time "Made for you" unlock celebration.
 *
 * Fired by `RecommendUnlockBanner` the moment a category crosses the recommend
 * unlock threshold for the first time on this device (see `shouldCelebrateUnlock`
 * in `unlock-storage.ts`). Deliberately calm and premium rather than confetti:
 * a soft amber card that slides in, rests, and auto-settles — matching the
 * library's quiet aesthetic. Motion is gated behind `motion-safe:` so
 * reduced-motion users just get a static card.
 *
 * Lifecycle is owned by the parent: it persists the "celebrated" marker when it
 * mounts this, so dismissing (button, auto-timeout, or unmount) never needs to
 * re-touch storage and the celebration cannot re-fire.
 */

import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import type { BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { RecommendShelfId } from "@/lib/recommend/recommend-types";

/** How long the card rests before auto-settling, in ms. */
const AUTO_DISMISS_MS = 7000;

export type CelebrationCategory = {
  shelfId: RecommendShelfId;
  label: string;
  Icon: typeof BookOpen;
};

export function UnlockCelebration({
  category,
  onStart,
  onDismiss,
}: {
  category: CelebrationCategory;
  onStart: (shelfId: RecommendShelfId) => void;
  onDismiss: () => void;
}) {
  // Pause the auto-dismiss while the user is hovering/focusing the card so it
  // never vanishes mid-read or mid-interaction.
  const [paused, setPaused] = useState(false);
  // Latest-ref so the auto-dismiss timer isn't reset by an unrelated re-render.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (paused) return;
    const t = window.setTimeout(() => onDismissRef.current(), AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [paused]);

  const { Icon } = category;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:justify-end"
      // Live but polite: announce the unlock without stealing focus.
      role="status"
      aria-live="polite"
    >
      <div
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
        className="ks-shimmer pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl border border-amber-300/50 bg-amber-50 p-4 shadow-lg ring-1 ring-amber-300/30 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4 motion-safe:zoom-in-95 motion-safe:duration-500 sm:max-w-xs dark:border-amber-400/20 dark:bg-amber-500/10 dark:ring-amber-400/15"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-100 ring-1 ring-amber-300/50 dark:bg-amber-500/15 dark:ring-amber-400/20">
            <Sparkles className="size-5 text-amber-600 dark:text-amber-400" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Icon className="size-4 text-amber-600 dark:text-amber-400" />
              {category.label} picks unlocked
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Made-for-you recommendations are ready for your {category.label.toLowerCase()} shelf.
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="ks-pointer-coarse-min-hit -m-1 grid shrink-0 place-items-center rounded-md p-1 text-muted-foreground transition hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            onClick={() => {
              onStart(category.shelfId);
              onDismiss();
            }}
            className="gap-1.5"
          >
            <Sparkles className="size-4" />
            Get my picks
          </Button>
        </div>
      </div>
    </div>
  );
}
