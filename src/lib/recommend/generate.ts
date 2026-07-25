/**
 * The recommendation pipeline, extracted from POST /api/recommend so it can run
 * without an HTTP request (ADR 0002 / 0015 / 0016).
 *
 * Taste profile → LLM candidates → resolve (TMDB / Open Library) → dedup against
 * the library → never-filter → extras pass → log `shown` outcomes.
 *
 * Deliberately request-free: no session lookup, no header reads. The caller
 * supplies `userId`, an already-resolved `region`, and a Supabase client, so the
 * same pipeline serves the interactive deck and a session-less cron job.
 *
 * Auth/quota policy stays with the caller: the route keeps the 401/503/429 gates
 * (`getSessionUserOrNull`, `isShelfRecommendEnabled`, `rateLimit` +
 * `aiDailyLimitForUser`) because those are per-surface policies — an email job
 * must not spend the interactive deck's daily bucket, or vice versa.
 *
 * User scoping is enforced here, not inherited: every query filters on
 * `user_id = userId` explicitly, so passing the service-role client (a cron
 * caller has no session, hence no RLS identity) stays confined to one profile.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { generateJsonWithFallback } from "@/lib/ai/gateway";
import { decryptItemFields } from "@/lib/crypto/field-crypto";
import type { Database } from "@/lib/database.types";
import {
  RECOMMEND_COUNT,
  RECOMMEND_MIN_ITEMS,
  RECOMMEND_MODELS,
  RECOMMEND_OVER_REQUEST,
  RECOMMEND_PROVIDER_OPTIONS,
  RECOMMEND_SHOWN_COOLDOWN_DAYS,
  RECOMMEND_TEMPERATURE,
  RECOMMEND_TIMEOUT_MS,
} from "@/lib/recommend/recommend-config";
import { dedupRecommendations, normalizeTitle } from "@/lib/recommend/dedup";
import { isSuppressedOutcome } from "@/lib/recommend/suppression";
import { buildRecommendPrompt } from "@/lib/recommend/recommend-prompt";
import { fetchBookDescription } from "@/lib/recommend/resolve/google-books";
import { resolveBookWithOpenLibrary } from "@/lib/recommend/resolve/open-library";
import {
  fetchTmdbCardExtras,
  formatWatchLength,
  resolveMovieWithTmdb,
} from "@/lib/recommend/resolve/tmdb";
import type {
  LlmCandidate,
  RecommendEmptyReason,
  RecommendShelfId,
  ResolvedRecommendation,
} from "@/lib/recommend/recommend-types";
import {
  buildTasteProfile,
  categoriesForShelf,
  filterNeverTitles,
  outcomeCategoryForShelf,
  type LibraryItemRow,
  type OutcomeRow,
} from "@/lib/recommend/taste-profile";

/** Funnel telemetry (ADR 0016): where the candidate pool collapses. */
export type RecommendFunnel = {
  llm_returned: number;
  resolved: number;
  after_dedup: number;
  after_never: number;
  final: number;
};

/**
 * Why the pipeline could not produce a result. An empty `cards` array is *not*
 * one of these — it is a legitimate success (ADR 0016).
 */
export type RecommendGenerationErrorCode =
  | "library_query_failed"
  | "decrypt_failed"
  | "insufficient_items"
  | "outcomes_query_failed"
  | "llm_failed"
  | "outcome_insert_failed";

export type GenerateRecommendationsInput = {
  /** Auth user id. Every query is filtered on this. */
  userId: string;
  shelfId: RecommendShelfId;
  /**
   * Supabase client to run under. The route passes the session client (RLS);
   * a session-less caller may pass the admin client — scoping is still enforced
   * by the explicit `user_id` filters below.
   */
  supabase: SupabaseClient<Database>;
  /**
   * Streaming-availability region for the watch extras pass (ADR 0015).
   * Resolved by the caller — the route uses
   * `pickWatchRegion(req.headers.get("x-vercel-ip-country"))`.
   */
  region: string;
  /** How many cards to keep. Defaults to RECOMMEND_COUNT. */
  count?: number;
  /** Log prefix, so a cron caller's lines stay distinguishable from the route's. */
  logPrefix?: string;
};

export type GenerateRecommendationsResult =
  | {
      ok: true;
      cards: ResolvedRecommendation[];
      /** Present only when `cards` is empty; tells the caller which copy to show. */
      reason?: RecommendEmptyReason;
      funnel: RecommendFunnel;
    }
  | { ok: false; code: RecommendGenerationErrorCode };

/** Build a Google search fallback query. */
function buildSearchQuery(candidate: LlmCandidate, shelfId: RecommendShelfId): string {
  const type = shelfId === "books" ? "book" : "film";
  const parts = [candidate.title];
  if (candidate.creator) parts.push(candidate.creator);
  parts.push(type);
  return parts.join(" ");
}

type ResolvedCardDraft = ResolvedRecommendation & {
  external_id: string;
  title_norm: string;
  /** Kept off the subtitle until after the extras pass — a verified
   * director can replace the LLM's creator (ADR 0015). */
  creator: string | null;
  year: number | null;
  media_type?: "movie" | "tv";
};

/**
 * Run the full recommendation pipeline for one user and shelf, logging a
 * `shown` outcome row per returned card so the next run suppresses it.
 *
 * The caller is responsible for authenticating the user, checking
 * `isShelfRecommendEnabled(shelfId)`, and applying whatever rate limit its
 * surface warrants.
 */
export async function generateRecommendations({
  userId,
  shelfId,
  supabase,
  region,
  count = RECOMMEND_COUNT,
  logPrefix = "[api/recommend]",
}: GenerateRecommendationsInput): Promise<GenerateRecommendationsResult> {
  const categories = categoriesForShelf(shelfId);
  const outcomeCategory = outcomeCategoryForShelf(shelfId);

  const { data: libraryRows, error: libraryError } = await supabase
    .from("items")
    .select("title, status, rating_personal, verdict, structured, category")
    .eq("user_id", userId)
    .in("category", categories);

  if (libraryError) {
    console.error(`${logPrefix} library_query_failed:`, libraryError.message);
    return { ok: false, code: "library_query_failed" };
  }

  // Decrypt-on-read (ADR 0013): verdict text feeds the taste profile prompt.
  // A tampered enc.* value throws; fail the whole run rather than risk
  // ciphertext reaching the LLM prompt or the response.
  let libraryItems: LibraryItemRow[];
  try {
    libraryItems = ((libraryRows ?? []) as LibraryItemRow[]).map((row) => decryptItemFields(row));
  } catch (err) {
    console.error(
      `${logPrefix} decrypt_failed:`,
      err instanceof Error ? err.message : "unknown_error",
    );
    return { ok: false, code: "decrypt_failed" };
  }
  const titledItems = libraryItems.filter((row) => row.title?.trim());

  if (titledItems.length < RECOMMEND_MIN_ITEMS) {
    return { ok: false, code: "insufficient_items" };
  }

  const cutoffMs =
    Date.now() - RECOMMEND_SHOWN_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

  const { data: outcomeRows, error: outcomeError } = await supabase
    .from("recommendation_outcomes")
    .select("title_norm, outcome, shown_at")
    .eq("user_id", userId)
    .eq("category", outcomeCategory);

  if (outcomeError) {
    console.error(`${logPrefix} outcomes_query_failed:`, outcomeError.message);
    return { ok: false, code: "outcomes_query_failed" };
  }

  const suppressedTitles = ((outcomeRows ?? []) as OutcomeRow[])
    .filter((row) => isSuppressedOutcome(row, cutoffMs))
    .map((row) => row.title_norm);

  const tasteProfile = buildTasteProfile(libraryItems, suppressedTitles);
  const existingTitles = titledItems.map((row) => row.title!);

  let candidates: LlmCandidate[];
  try {
    const prompt = buildRecommendPrompt(shelfId, tasteProfile);
    const { data } = await generateJsonWithFallback<{ candidates?: unknown[] }>({
      models: RECOMMEND_MODELS,
      prompt,
      temperature: RECOMMEND_TEMPERATURE,
      timeoutMs: RECOMMEND_TIMEOUT_MS,
      providerOptions: RECOMMEND_PROVIDER_OPTIONS,
      label: "recommend",
    });

    if (!Array.isArray(data.candidates)) throw new Error("invalid_response_shape");

    candidates = data.candidates.filter(
      (c): c is LlmCandidate =>
        c !== null &&
        typeof c === "object" &&
        typeof (c as Record<string, unknown>).title === "string" &&
        typeof (c as Record<string, unknown>).creator === "string" &&
        typeof (c as Record<string, unknown>).description === "string" &&
        typeof (c as Record<string, unknown>).reason === "string",
    );
  } catch (err) {
    console.error(`${logPrefix} llm_failed:`, err instanceof Error ? err.message : err);
    return { ok: false, code: "llm_failed" };
  }

  const isWatch = shelfId === "watch";
  const overRequested = candidates.slice(0, RECOMMEND_OVER_REQUEST);

  const settledResults = await Promise.allSettled(
    overRequested.map(async (candidate) => {
      const resolved = isWatch
        ? await resolveMovieWithTmdb(candidate)
        : await resolveBookWithOpenLibrary(candidate);

      if (!resolved) return null;

      const card: ResolvedCardDraft = {
        id: randomUUID(),
        outcome_id: "",
        title: candidate.title,
        subtitle: "",
        description: candidate.description,
        reason: candidate.reason,
        canonical_url: resolved.canonical_url,
        cover_url: resolved.cover_url,
        search_query: buildSearchQuery(candidate, shelfId),
        source: isWatch ? "tmdb" : "open_library",
        external_id: resolved.external_id,
        title_norm: normalizeTitle(candidate.title),
        source_rating: resolved.source_rating ?? null,
        rating_count: resolved.rating_count ?? null,
        length: resolved.length ?? null,
        genres: resolved.genres,
        creator: resolved.verified_author ?? candidate.creator ?? null,
        year: resolved.confirmed_year ?? candidate.year ?? null,
        media_type: "media_type" in resolved ? resolved.media_type : undefined,
        opening_line: "opening_line" in resolved ? resolved.opening_line ?? null : null,
      };
      return card;
    }),
  );

  const resolvedCards = settledResults
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((c): c is ResolvedCardDraft => c !== null);

  const dedupedCards = dedupRecommendations(
    resolvedCards,
    existingTitles,
  ) as ResolvedCardDraft[];
  const filteredCards = filterNeverTitles(dedupedCards, tasteProfile.never);
  const finalCards = filteredCards.slice(0, count);

  // Funnel telemetry (ADR 0016): where the candidate pool collapses is otherwise
  // invisible. These counts also drive the empty-reason discriminant below.
  const funnel: RecommendFunnel = {
    llm_returned: candidates.length,
    resolved: resolvedCards.length,
    after_dedup: dedupedCards.length,
    after_never: filteredCards.length,
    final: finalCards.length,
  };
  console.log(
    `${logPrefix} funnel shelf=${shelfId} owned=${existingTitles.length} never=${tasteProfile.never.length} ` +
      `llm_returned=${funnel.llm_returned} resolved=${funnel.resolved} ` +
      `after_dedup=${funnel.after_dedup} after_never=${funnel.after_never} final=${funnel.final}`,
  );

  if (finalCards.length === 0) {
    // Exhausted = the LLM generated a full batch and titles resolved, but every
    // one was already owned or recently seen (the user is near the edge of their
    // taste graph). Otherwise the miss is transient (LLM under-produced or
    // nothing resolved) and retrying may help. See ADR 0016 / RecommendDeck.
    const reason: RecommendEmptyReason =
      funnel.llm_returned >= count && funnel.resolved > 0 ? "exhausted" : "transient";
    return { ok: true, cards: [], reason, funnel };
  }

  // Extras pass (ADR 0015): only the final cards get one details fetch each,
  // in parallel — official synopsis, director, runtime, trailer, and
  // streaming providers (watch) or a real description (books). Every fetch
  // fails open; a miss keeps the LLM text and the search-pass fields.
  const enrichedCards: ResolvedCardDraft[] = await Promise.all(
    finalCards.map(async (card) => {
      if (isWatch && card.media_type) {
        const extras = await fetchTmdbCardExtras(card.media_type, card.external_id, region);
        if (!extras) return card;
        return {
          ...card,
          description: extras.overview ?? card.description,
          creator:
            extras.directors.length > 0
              ? extras.directors.slice(0, 2).join(", ")
              : card.creator,
          length:
            formatWatchLength(card.media_type, extras.runtime_minutes, extras.seasons) ??
            card.length,
          trailer_url: extras.trailer_url,
          providers: extras.providers.length > 0 ? extras.providers : undefined,
          providers_link: extras.providers_link,
        };
      }
      const description = await fetchBookDescription(card.title, card.creator);
      return description ? { ...card, description } : card;
    }),
  );

  const insertRows = enrichedCards.map((card) => ({
    user_id: userId,
    category: outcomeCategory,
    external_id: card.external_id,
    title_norm: card.title_norm,
    outcome: "shown" as const,
  }));

  const { data: insertedOutcomes, error: insertError } = await supabase
    .from("recommendation_outcomes")
    .insert(insertRows)
    .select("id, title_norm");

  if (insertError || !insertedOutcomes?.length) {
    console.error(`${logPrefix} outcome_insert_failed:`, insertError?.message);
    return { ok: false, code: "outcome_insert_failed" };
  }

  const outcomeByTitleNorm = new Map(
    insertedOutcomes.map((r) => [r.title_norm, r.id]),
  );

  const cards: ResolvedRecommendation[] = enrichedCards
    .map((card) => {
      const outcomeId = outcomeByTitleNorm.get(card.title_norm);
      if (!outcomeId) return null;
      const { external_id: _e, title_norm: _t, creator, year, media_type: _m, ...responseCard } = card;
      const subtitle = [creator, year].filter(Boolean).join(" · ");
      return { ...responseCard, subtitle, outcome_id: outcomeId };
    })
    .filter((c): c is ResolvedRecommendation => c !== null);

  return { ok: true, cards, funnel };
}
