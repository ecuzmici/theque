/**
 * Configuration and gating for the AI recommendations feature (Workstream F).
 *
 * LLM calls go through the Vercel AI Gateway, so the feature gates on the
 * gateway being authenticated (local AI_GATEWAY_API_KEY or Vercel OIDC).
 * F2 Watch additionally requires TMDB_API_KEY (used by the resolver).
 * All other values have safe defaults.
 */

import { isGatewayConfigured, parseModelList } from "@/lib/ai/gateway";
import type { RecommendShelfId } from "@/lib/recommend/recommend-types";

/** Minimum number of library items required before recommendations are offered. */
export const RECOMMEND_MIN_ITEMS = Number.parseInt(
  process.env.RECOMMEND_MIN_ITEMS ?? "3",
  10,
);

/** Maximum number of input items sent to the LLM for context. */
export const RECOMMEND_MAX_INPUT_ITEMS = Number.parseInt(
  process.env.RECOMMEND_MAX_INPUT_ITEMS ?? "20",
  10,
);

/** Number of candidates requested from the LLM (buffer for dedup/resolve drops). */
export const RECOMMEND_OVER_REQUEST = 8;

/** Number of resolved cards to keep and return. */
export const RECOMMEND_COUNT = Number.parseInt(
  process.env.RECOMMEND_COUNT ?? "5",
  10,
);

/** Result cache TTL in seconds (24h default). */
export const RECOMMEND_CACHE_TTL_SEC = Number.parseInt(
  process.env.RECOMMEND_CACHE_TTL_SEC ?? "86400",
  10,
);

/** Daily per-user rate limit cap for /api/recommend. */
export const RECOMMEND_RATE_LIMIT_PER_DAY = Number.parseInt(
  process.env.RECOMMEND_RATE_LIMIT_PER_DAY ?? "20",
  10,
);

/**
 * Ordered AI Gateway model fallback for recommendations.
 * Primary GPT-5 mini (best taste), then Gemini Flash, then Flash-Lite —
 * mixing providers so one provider's overload can't take the feature down.
 */
export const RECOMMEND_MODELS = parseModelList(process.env.RECOMMEND_MODELS, [
  "openai/gpt-5-mini",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
]);

/** Temperature for recommendations (creative but bounded). */
export const RECOMMEND_TEMPERATURE = Number.parseFloat(
  process.env.RECOMMEND_TEMPERATURE ?? "0.7",
);

/** Timeout for a single recommendation model attempt, in milliseconds. */
export const RECOMMEND_TIMEOUT_MS = Number.parseInt(
  process.env.RECOMMEND_TIMEOUT_MS ?? "20000",
  10,
);

/**
 * Returns true when the Books Recommend feature is available:
 * the AI Gateway must be authenticated.
 */
export function isRecommendEnabled(): boolean {
  return isGatewayConfigured();
}

/**
 * Returns true when the Watch Recommend feature is available (F2):
 * the AI Gateway must be authenticated and TMDB_API_KEY must be set.
 */
export function isWatchRecommendEnabled(): boolean {
  return isGatewayConfigured() && Boolean(process.env.TMDB_API_KEY);
}

/**
 * Returns whether a given shelf is gated and currently enabled.
 * Used by the API route and the UI button to decide visibility.
 */
export function isShelfRecommendEnabled(shelfId: RecommendShelfId): boolean {
  if (shelfId === "books") return isRecommendEnabled();
  if (shelfId === "watch") return isWatchRecommendEnabled();
  return false;
}
