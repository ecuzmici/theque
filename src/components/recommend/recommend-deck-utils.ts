import type {
  RecommendDismissReason,
  RecommendOutcomeAction,
} from "@/lib/recommend/recommend-types";

/** Cosmetic status lines shown while recommendations generate. */
export const LOADING_STATUS_LINES = [
  "Building your taste profile…",
  "Personalising picks…",
  "Checking availability…",
] as const;

/** Fire-and-forget outcome logging — silent fail is acceptable. */
export function logRecommendOutcome(
  outcomeId: string,
  outcome: RecommendOutcomeAction,
  dismissReason?: RecommendDismissReason,
): void {
  void globalThis
    .fetch("/api/recommend/outcomes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outcomeId,
        outcome,
        ...(dismissReason !== undefined ? { dismissReason } : {}),
      }),
    })
    .catch(() => {
      // outcome row already exists as shown
    });
}

/** Fire-and-forget URL capture — silent fail is acceptable. */
export function captureRecommendationUrl(url: string): void {
  void globalThis
    .fetch("/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, source: "manual" }),
    })
    .catch(() => {
      // user can save again from library if needed
    });
}
