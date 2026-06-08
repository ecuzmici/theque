/**
 * Configuration and gating for the AI recommendations feature (Workstream F).
 *
 * Gates on GEMINI_API_KEY (shared with enrichment).
 * F2 Watch additionally requires TMDB_API_KEY.
 * All other values have safe defaults.
 */

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

/** Gemini model to use for recommendations. */
export const GEMINI_RECOMMEND_MODEL =
  process.env.GEMINI_RECOMMEND_MODEL ?? "gemini-2.5-flash";

/** Gemini temperature for recommendations (creative but bounded). */
export const GEMINI_RECOMMEND_TEMPERATURE = Number.parseFloat(
  process.env.GEMINI_RECOMMEND_TEMPERATURE ?? "0.7",
);

/** Timeout for the Gemini recommendation call in milliseconds. */
export const GEMINI_RECOMMEND_TIMEOUT_MS = Number.parseInt(
  process.env.GEMINI_RECOMMEND_TIMEOUT_MS ?? "20000",
  10,
);

/**
 * Returns true when the Books Recommend feature is available:
 * GEMINI_API_KEY must be set.
 */
export function isRecommendEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * Returns true when the Watch Recommend feature is available (F2):
 * both GEMINI_API_KEY and TMDB_API_KEY must be set.
 */
export function isWatchRecommendEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY) && Boolean(process.env.TMDB_API_KEY);
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
