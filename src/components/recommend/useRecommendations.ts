"use client";

import { useState } from "react";

import type {
  RecommendResponse,
  RecommendShelfId,
  ResolvedRecommendation,
} from "@/lib/recommend/recommend-types";

export type RecommendState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; cards: ResolvedRecommendation[] }
  | { status: "error"; message: string };

export function useRecommendations() {
  const [state, setState] = useState<RecommendState>({ status: "idle" });

  async function fetch(shelfId: RecommendShelfId) {
    setState({ status: "loading" });
    try {
      const res = await globalThis.fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shelfId }),
      });

      if (!res.ok) {
        let message = "Could not load recommendations";
        try {
          const errBody = (await res.json()) as { error?: string };
          if (errBody.error) message = errBody.error;
        } catch {
          // ignore parse errors
        }
        setState({ status: "error", message });
        return;
      }

      const data = (await res.json()) as RecommendResponse;
      setState({ status: "done", cards: data.cards });
    } catch {
      setState({ status: "error", message: "Network error. Please try again." });
    }
  }

  function reset() {
    setState({ status: "idle" });
  }

  return { state, fetch, reset };
}
