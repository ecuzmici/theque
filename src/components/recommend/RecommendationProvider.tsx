"use client";

import { createContext, useContext } from "react";
import type { Dialog as SheetPrimitive } from "@base-ui/react/dialog";

import { RecommendDeck } from "@/components/recommend/RecommendDeck";
import { RecommendPill } from "@/components/recommend/RecommendPill";
import {
  useRecommendationRun,
  type RecommendationRunApi,
} from "@/components/recommend/useRecommendationRun";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const RecommendationContext = createContext<RecommendationRunApi | null>(null);

/**
 * Owns the single global recommendation run and renders the deck at the layout
 * level so it (and, in later slices, the floating indicator) survives client
 * route changes. Mounted in `(app)/layout.tsx`, wrapping `AppShell`.
 */
export function RecommendationProvider({ children }: { children: React.ReactNode }) {
  const run = useRecommendationRun();

  const hasRun = run.runStatus !== "empty";
  const deckOpen = hasRun && run.view === "open";
  const minimized = hasRun && run.view === "minimized";

  // Backdrop click / escape minimize (keep the run alive); the deck's × is a
  // deliberate dismiss. base-ui reports the close reason on the event details.
  function handleOpenChange(
    open: boolean,
    eventDetails: SheetPrimitive.Root.ChangeEventDetails,
  ) {
    if (open) return;
    if (eventDetails.reason === "close-press") {
      run.dismiss();
    } else {
      run.minimize();
    }
  }

  return (
    <RecommendationContext.Provider value={run}>
      {children}

      <Sheet open={deckOpen} onOpenChange={handleOpenChange}>
        <SheetContent
          side="bottom"
          className="flex h-[min(100dvh,100%)] max-h-[100dvh] flex-col gap-0 rounded-t-2xl p-0 sm:mx-auto sm:max-w-lg"
          showCloseButton
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Recommendations</SheetTitle>
            <SheetDescription>AI-generated picks for your shelf</SheetDescription>
          </SheetHeader>
          {run.shelf ? <RecommendDeck run={run} /> : null}
        </SheetContent>
      </Sheet>

      {minimized && run.shelf && run.runStatus !== "empty" ? (
        <RecommendPill
          status={run.runStatus}
          steer={run.steer}
          onReopen={run.reopen}
          onRetry={run.retry}
          onDismiss={run.dismiss}
        />
      ) : null}
    </RecommendationContext.Provider>
  );
}

/** Access the active recommendation run. Must be used under the provider. */
export function useRecommendationContext(): RecommendationRunApi {
  const ctx = useContext(RecommendationContext);
  if (!ctx) {
    throw new Error(
      "useRecommendationContext must be used within a RecommendationProvider",
    );
  }
  return ctx;
}
