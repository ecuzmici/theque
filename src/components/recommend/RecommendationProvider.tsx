"use client";

import { createContext, useContext } from "react";

import { RecommendDeck } from "@/components/recommend/RecommendDeck";
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

  // The deck is open whenever there is an active run. The minimize/dismiss split
  // (backdrop vs ×) lands in #28; for now both exits dismiss the run.
  const deckOpen = run.runStatus !== "empty";

  function handleOpenChange(open: boolean) {
    if (!open) run.dismiss();
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
