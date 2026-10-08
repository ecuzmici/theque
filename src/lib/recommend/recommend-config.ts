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

/**
 * Cooldown window for shown-but-not-acted outcomes (days).
 *
 * "Shown but you ignored it" is not rejection, so ignored titles cycle back
 * after this window instead of being suppressed for a month (ADR 0016). Kept
 * short so a heavy user's never-list stays bounded; `dismissed`/`saved` outcomes
 * are still suppressed permanently (see isSuppressedOutcome in the route).
 */
export const RECOMMEND_SHOWN_COOLDOWN_DAYS = Number.parseInt(
  process.env.RECOMMEND_SHOWN_COOLDOWN_DAYS ?? "14",
  10,
);

/**
 * Number of candidates requested from the LLM (buffer for dedup/resolve drops).
 *
 * Deliberately generous (ADR 0016): the funnel drops candidates at resolve,
 * dedup-against-library, and never-filter, so a small pool collapses to empty
 * for heavy users. Env-configurable so the yield eval can sweep it.
 */
export const RECOMMEND_OVER_REQUEST = Number.parseInt(
  process.env.RECOMMEND_OVER_REQUEST ?? "24",
  10,
);

/**
 * Max owned/library titles echoed into the prompt as an explicit
 * "already have — do not suggest" block (ADR 0016). Dedup still runs against the
 * full library server-side; this only bounds prompt size so the LLM stops
 * burning candidates on titles the user already owns.
 */
export const RECOMMEND_MAX_OWNED_TITLES = Number.parseInt(
  process.env.RECOMMEND_MAX_OWNED_TITLES ?? "250",
  10,
);

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
 * Chosen from the yield eval (scripts/eval-recommend.ts, ADR 0016) re-run on
 * 2026-10-09 against the owner's real library at over_request=24 (ADR 0018).
 * The recommend path has no search grounding, so the model's training cutoff
 * is a hard ceiling on how fresh a suggestion can be. Every model gets the
 * RECOMMEND_RESPONSE_SCHEMA structured output.
 *
 * gemini-3.6-flash: primary. It kept the books shelf full in 3 of 3 runs
 * (6/6, 6/6, 8/8 full rounds) because its picks stay diverse round over
 * round. gpt-6-luna: fallback. Newest knowledge (2026-05) and the best
 * resolve rate, but it repeats earlier picks, so the books shelf ran dry in
 * 3 of 3 runs (5/6, 5/6, 5/8). gemini-3.5-flash-lite: cheap backstop.
 *
 * Rejected: claude-haiku-5.5 (invented titles, starved the books shelf by
 * round 6), gemini-3.1-flash-lite (intermittent JSON truncation at 24),
 * openai/gpt-5-nano (too slow, aborts), zai/glm-4.7-flash (JSON truncation),
 * openai/gpt-4.1-mini (reliable but oldest cutoff, ~mid-2024).
 */
export const RECOMMEND_MODELS = parseModelList(process.env.RECOMMEND_MODELS, [
  "google/gemini-3.6-flash",
  "openai/gpt-6-luna",
  "google/gemini-3.5-flash-lite",
]);

/**
 * Provider-specific options forwarded to every recommendation model attempt.
 * Each key turns off the reasoning pass for one provider (latency gate) and
 * applies only to models of that provider. gemini-3.5-flash-lite rejects
 * thinkingBudget: 0, so the google key uses thinkingLevel instead.
 */
export const RECOMMEND_PROVIDER_OPTIONS = {
  openai: { reasoningEffort: "none" },
  google: { thinkingConfig: { thinkingLevel: "minimal" } },
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
