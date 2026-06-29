"use client";

import { useCallback, useRef, useState } from "react";

import {
  captureRecommendationUrl,
  logRecommendOutcome,
} from "@/components/recommend/recommend-deck-utils";
import type {
  RecommendDismissReason,
  RecommendResponse,
  RecommendShelfId,
  ResolvedRecommendation,
} from "@/lib/recommend/recommend-types";

/**
 * Lifecycle of the single global recommendation run (see CONTEXT.md and
 * docs/adr/0005-minimizable-recommendation-run.md). `empty` means there is no
 * active run; the slot is free.
 */
export type RunStatus = "empty" | "loading" | "ready" | "error";

/** Per-card decision recorded as the user works through the deck. */
export type DeckOutcome = "saved" | "skipped" | "dismissed";

/**
 * The deck's review position, hoisted out of `RecommendDeck` so a minimized run
 * can resume at the exact card with prior decisions intact.
 */
export type DeckCursor = {
  index: number;
  outcomes: Record<string, DeckOutcome>;
  askReason: boolean;
};

const EMPTY_CURSOR: DeckCursor = { index: 0, outcomes: {}, askReason: false };

/**
 * Whether the deck is showing or stashed to the floating pill. Orthogonal to
 * `runStatus` and only meaningful while a run exists (`runStatus !== "empty"`).
 */
export type RunView = "open" | "minimized";

export type RecommendationRunState = {
  runStatus: RunStatus;
  view: RunView;
  shelf: RecommendShelfId | null;
  cards: ResolvedRecommendation[];
  errorMessage: string | null;
  cursor: DeckCursor;
};

const INITIAL_STATE: RecommendationRunState = {
  runStatus: "empty",
  view: "open",
  shelf: null,
  cards: [],
  errorMessage: null,
  cursor: EMPTY_CURSOR,
};

/**
 * The recommendation run state machine. This is the single test seam for the
 * minimizable-recommendation feature: assert run status, active shelf, deck
 * cursor, and `fetch` call counts through this surface — never component
 * internals.
 *
 * Hoisted (in #27) from the page into a layout-level provider so the run can
 * later survive route changes. In this slice both backdrop and × dismiss; the
 * minimize/dismiss split lands in #28.
 */
export function useRecommendationRun() {
  const [state, setState] = useState<RecommendationRunState>(INITIAL_STATE);

  // A ref mirror of state so callbacks can read the latest value and perform
  // side effects *outside* the setState updater (updaters must stay pure — React
  // StrictMode double-invokes them in dev, which would double-fire fetch/capture).
  const stateRef = useRef(state);
  const update = useCallback(
    (
      next:
        | RecommendationRunState
        | ((prev: RecommendationRunState) => RecommendationRunState),
    ) => {
      const value =
        typeof next === "function"
          ? (next as (p: RecommendationRunState) => RecommendationRunState)(
              stateRef.current,
            )
          : next;
      stateRef.current = value;
      setState(value);
    },
    [],
  );

  // The controller for the in-flight request, so dismiss/replace can abort it.
  const abortRef = useRef<AbortController | null>(null);
  // A monotonic id for the active run. Every response is checked against it and
  // ignored if stale, so a late reply from a replaced/dismissed run can never
  // clobber the current slot — independent of (and belt-and-suspenders with) the
  // AbortController, per ADR 0005.
  const runIdRef = useRef(0);

  const runFetch = useCallback(
    async (shelf: RecommendShelfId) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const myRunId = ++runIdRef.current;
      const isStale = () => runIdRef.current !== myRunId;

      update({
        runStatus: "loading",
        view: "open",
        shelf,
        cards: [],
        errorMessage: null,
        cursor: EMPTY_CURSOR,
      });

      try {
        const res = await globalThis.fetch("/api/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shelfId: shelf }),
          signal: controller.signal,
        });

        if (isStale()) return;

        if (!res.ok) {
          let message = "Could not load recommendations";
          try {
            const errBody = (await res.json()) as { error?: string };
            if (errBody.error) message = errBody.error;
          } catch {
            // ignore parse errors
          }
          if (isStale()) return;
          update((prev) => ({ ...prev, runStatus: "error", errorMessage: message }));
          return;
        }

        const data = (await res.json()) as RecommendResponse;
        if (isStale()) return;
        update((prev) => ({
          ...prev,
          runStatus: "ready",
          cards: data.cards,
          errorMessage: null,
          cursor: EMPTY_CURSOR,
        }));
      } catch {
        // A replace/dismiss bumps runIdRef and aborts; that rejection is stale.
        if (isStale()) return;
        update((prev) => ({
          ...prev,
          runStatus: "error",
          errorMessage: "Network error. Please try again.",
        }));
      }
    },
    [update],
  );

  /**
   * Trigger a run for a shelf. Re-triggering the *same* shelf while a run is
   * active just reopens the deck (no second request); any other case starts a
   * fresh run.
   */
  const start = useCallback(
    (shelf: RecommendShelfId) => {
      const current = stateRef.current;
      if (current.runStatus !== "empty" && current.shelf === shelf) {
        update((prev) => ({ ...prev, view: "open" }));
        return;
      }
      void runFetch(shelf);
    },
    [runFetch, update],
  );

  /** Stash the open deck to the floating pill; the run keeps going. */
  const minimize = useCallback(() => {
    if (stateRef.current.runStatus === "empty") return;
    update((prev) => ({ ...prev, view: "minimized" }));
  }, [update]);

  /** Reopen the stashed deck. */
  const reopen = useCallback(() => {
    if (stateRef.current.runStatus === "empty") return;
    update((prev) => ({ ...prev, view: "open" }));
  }, [update]);

  /** Re-run the current shelf (deck "Try again"). */
  const retry = useCallback(() => {
    const shelf = stateRef.current.shelf;
    if (shelf) void runFetch(shelf);
  }, [runFetch]);

  /** End the active run and free the slot. */
  const dismiss = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    // Invalidate any in-flight run so a late response can't repopulate the slot.
    runIdRef.current++;
    update(INITIAL_STATE);
  }, [update]);

  const setAskReason = useCallback(
    (askReason: boolean) => {
      update((prev) => ({ ...prev, cursor: { ...prev.cursor, askReason } }));
    },
    [update],
  );

  /** Advance past the current card, recording its outcome. */
  const advanceCard = useCallback(
    (outcome: DeckOutcome) => {
      update((prev) => {
        const card = prev.cards[prev.cursor.index];
        if (!card) return prev;
        return {
          ...prev,
          cursor: {
            index: prev.cursor.index + 1,
            outcomes: { ...prev.cursor.outcomes, [card.outcome_id]: outcome },
            askReason: false,
          },
        };
      });
    },
    [update],
  );

  const saveCard = useCallback(() => {
    const card = stateRef.current.cards[stateRef.current.cursor.index];
    if (!card) return;
    logRecommendOutcome(card.outcome_id, "saved");
    captureRecommendationUrl(card.canonical_url);
    advanceCard("saved");
  }, [advanceCard]);

  const skipCard = useCallback(() => {
    if (!stateRef.current.cards[stateRef.current.cursor.index]) return;
    advanceCard("skipped");
  }, [advanceCard]);

  const dismissCard = useCallback(
    (reason: RecommendDismissReason) => {
      const card = stateRef.current.cards[stateRef.current.cursor.index];
      if (!card) return;
      logRecommendOutcome(card.outcome_id, "dismissed", reason);
      advanceCard("dismissed");
    },
    [advanceCard],
  );

  return {
    ...state,
    start,
    minimize,
    reopen,
    retry,
    dismiss,
    setAskReason,
    saveCard,
    skipCard,
    dismissCard,
  };
}

export type RecommendationRunApi = ReturnType<typeof useRecommendationRun>;
