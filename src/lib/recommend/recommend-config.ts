/**
 * Configuration and gating for the AI recommendations feature (Workstream F).
 *
 * LLM calls go through the Vercel AI Gateway, so the feature gates on the
 * gateway being authenticated (local AI_GATEWAY_API_KEY or Vercel OIDC).
 * F2 Watch additionally requires TMDB_API_KEY (used by the resolver).
 * All other values have safe defaults.
 */

import { isGatewayConfigured, parseModelList } from "@/lib/ai/gateway-config";
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

/** Max LOVED slots in the taste profile (4–5★ verdicts). */
export const RECOMMEND_LOVED_MAX = 10;

/** Max DISLIKED slots in the taste profile (1–2★ verdicts). */
export const RECOMMEND_DISLIKED_MAX = 3;

/** Max chars of verdict note included in the prompt. */
export const RECOMMEND_VERDICT_NOTE_MAX = 200;

/** Cooldown window for shown-but-not-acted outcomes (days). */
export const RECOMMEND_SHOWN_COOLDOWN_DAYS = 30;

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

/** Fallback region for streaming availability when geo detection misses. */
export const RECOMMEND_WATCH_REGION = (
  process.env.RECOMMEND_WATCH_REGION ?? "US"
).toUpperCase();

/**
 * Resolve the streaming-availability region for a request (ADR 0015):
 * Vercel's x-vercel-ip-country header when it looks like an ISO country
 * code, else the env fallback.
 */
export function pickWatchRegion(headerCountry: string | null | undefined): string {
  const candidate = headerCountry?.trim().toUpperCase();
  return candidate && /^[A-Z]{2}$/.test(candidate)
    ? candidate
    : RECOMMEND_WATCH_REGION;
}

/**
 * Ordered AI Gateway model fallback for recommendations.
 *
 * Chosen from a repeatable benchmark (scripts/bench-recommend.ts, 2026-06-28):
 * 9 models × 2 trials on a 22-book fixture with the ADR 0002 redesign prompt.
 * Latency gate: p50 ≤ 15s. Sorted by resolve-rate among survivors.
 *
 * gemini-3.1-flash-lite: primary — fastest (2.7s p50), 73% resolve, best era
 * diversity. gemini-2.5-flash-lite: highest resolve (88%) when stable, cheap.
 * claude-haiku-4.5: cross-provider fallback, best pick quality.
 *
 * Note: openai/gpt-5-nano (former primary) was absent from the Gateway catalog
 * on the benchmark date and removed.
 */
export const RECOMMEND_MODELS = parseModelList(process.env.RECOMMEND_MODELS, [
  "google/gemini-3.1-flash-lite",
  "google/gemini-2.5-flash-lite",
  "anthropic/claude-haiku-4.5",
]);

/**
 * Provider-specific options forwarded to every recommendation model attempt.
 * thinkingBudget: 0 disables the thinking pass on Google models (latency gate).
 * The google key is a no-op for Anthropic fallbacks.
 */
export const RECOMMEND_PROVIDER_OPTIONS = {
  google: { thinkingConfig: { thinkingBudget: 0 } },
};

/** Temperature for recommendations (some variety, but steadier than before). */
export const RECOMMEND_TEMPERATURE = Number.parseFloat(
  process.env.RECOMMEND_TEMPERATURE ?? "0.5",
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
