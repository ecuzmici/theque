import "server-only";

import { randomUUID } from "node:crypto";

import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { generateJsonWithFallback } from "@/lib/ai/gateway";
import { decryptItemFields } from "@/lib/crypto/field-crypto";
import { rateLimit } from "@/lib/rate-limit";
import {
  RECOMMEND_COUNT,
  RECOMMEND_MIN_ITEMS,
  RECOMMEND_MODELS,
  RECOMMEND_OVER_REQUEST,
  RECOMMEND_PROVIDER_OPTIONS,
  RECOMMEND_RATE_LIMIT_PER_DAY,
  RECOMMEND_SHOWN_COOLDOWN_DAYS,
  RECOMMEND_TEMPERATURE,
  RECOMMEND_TIMEOUT_MS,
  isShelfRecommendEnabled,
  pickWatchRegion,
} from "@/lib/recommend/recommend-config";
import { dedupRecommendations, normalizeTitle } from "@/lib/recommend/dedup";
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
  RecommendRequest,
  RecommendResponse,
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
import { createClient } from "@/lib/supabase/server";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return Response.json(body, init);
}

/** Build a Google search fallback query. */
function buildSearchQuery(candidate: LlmCandidate, shelfId: "books" | "watch"): string {
  const type = shelfId === "books" ? "book" : "film";
  const parts = [candidate.title];
  if (candidate.creator) parts.push(candidate.creator);
  parts.push(type);
  return parts.join(" ");
}

function isSuppressedOutcome(row: OutcomeRow, cutoffMs: number): boolean {
  if (row.outcome === "dismissed" || row.outcome === "saved") return true;
  if (row.outcome === "shown") {
    return new Date(row.shown_at).getTime() > cutoffMs;
  }
  return false;
}

export async function POST(req: Request) {
  const user = await getSessionUserOrNull();
  if (!user) {
    return jsonResponse({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = (body ?? {}) as Partial<RecommendRequest> & { items?: unknown };

  if ("items" in parsed && parsed.items !== undefined) {
    return jsonResponse(
      { error: "items must not be sent; the server builds the taste profile" },
      { status: 400 },
    );
  }

  const { shelfId } = parsed;

  if (shelfId !== "books" && shelfId !== "watch") {
    return jsonResponse(
      { error: "shelfId must be 'books' or 'watch'" },
      { status: 400 },
    );
  }

  if (!isShelfRecommendEnabled(shelfId)) {
    return jsonResponse(
      { error: "Recommendations not configured" },
      { status: 503 },
    );
  }

  const rl = await rateLimit(
    `recommend:${user.id}`,
    RECOMMEND_RATE_LIMIT_PER_DAY,
    86400,
  );
  if (!rl.ok) {
    return jsonResponse(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfter ?? 86400) },
      },
    );
  }

  const supabase = await createClient();
  const categories = categoriesForShelf(shelfId);
  const outcomeCategory = outcomeCategoryForShelf(shelfId);

  const { data: libraryRows, error: libraryError } = await supabase
    .from("items")
    .select("title, status, rating_personal, verdict, structured, category")
    .eq("user_id", user.id)
    .in("category", categories);

  if (libraryError) {
    console.error("[api/recommend] library_query_failed:", libraryError.message);
    return jsonResponse({ error: "Could not load library" }, { status: 500 });
  }

  // Decrypt-on-read (ADR 0013): verdict text feeds the taste profile prompt.
  // A tampered enc.* value throws; fail the whole request rather than risk
  // ciphertext reaching the LLM prompt or the response.
  let libraryItems: LibraryItemRow[];
  try {
    libraryItems = ((libraryRows ?? []) as LibraryItemRow[]).map((row) => decryptItemFields(row));
  } catch (err) {
    console.error(
      "[api/recommend] decrypt_failed:",
      err instanceof Error ? err.message : "unknown_error",
    );
    return jsonResponse({ error: "Could not load library" }, { status: 500 });
  }
  const titledItems = libraryItems.filter((row) => row.title?.trim());

  if (titledItems.length < RECOMMEND_MIN_ITEMS) {
    return jsonResponse(
      { error: `At least ${RECOMMEND_MIN_ITEMS} items are required in this shelf` },
      { status: 400 },
    );
  }

  const cutoffMs =
    Date.now() - RECOMMEND_SHOWN_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

  const { data: outcomeRows, error: outcomeError } = await supabase
    .from("recommendation_outcomes")
    .select("title_norm, outcome, shown_at")
    .eq("user_id", user.id)
    .eq("category", outcomeCategory);

  if (outcomeError) {
    console.error("[api/recommend] outcomes_query_failed:", outcomeError.message);
    return jsonResponse({ error: "Could not load recommendation history" }, { status: 500 });
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
    console.error("[api/recommend] llm_failed:", err instanceof Error ? err.message : err);
    return jsonResponse(
      { error: "Could not generate recommendations" },
      { status: 502 },
    );
  }

  const isWatch = shelfId === "watch";
  const overRequested = candidates.slice(0, RECOMMEND_OVER_REQUEST);

  type ResolvedCardDraft = ResolvedRecommendation & {
    external_id: string;
    title_norm: string;
    /** Kept off the subtitle until after the extras pass — a verified
     * director can replace the LLM's creator (ADR 0015). */
    creator: string | null;
    year: number | null;
    media_type?: "movie" | "tv";
  };

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
  const finalCards = filteredCards.slice(0, RECOMMEND_COUNT);

  if (finalCards.length === 0) {
    return jsonResponse({ cards: [] } satisfies RecommendResponse, { status: 200 });
  }

  // Extras pass (ADR 0015): only the final cards get one details fetch each,
  // in parallel — official synopsis, director, runtime, trailer, and
  // streaming providers (watch) or a real description (books). Every fetch
  // fails open; a miss keeps the LLM text and the search-pass fields.
  const region = pickWatchRegion(req.headers.get("x-vercel-ip-country"));
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
    user_id: user.id,
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
    console.error("[api/recommend] outcome_insert_failed:", insertError?.message);
    return jsonResponse({ error: "Could not record recommendations" }, { status: 500 });
  }

  const outcomeByTitleNorm = new Map(
    insertedOutcomes.map((r) => [r.title_norm, r.id]),
  );

  const cardsWithOutcomes: ResolvedRecommendation[] = enrichedCards
    .map((card) => {
      const outcomeId = outcomeByTitleNorm.get(card.title_norm);
      if (!outcomeId) return null;
      const { external_id: _e, title_norm: _t, creator, year, media_type: _m, ...responseCard } = card;
      const subtitle = [creator, year].filter(Boolean).join(" · ");
      return { ...responseCard, subtitle, outcome_id: outcomeId };
    })
    .filter((c): c is ResolvedRecommendation => c !== null);

  const responseBody: RecommendResponse = { cards: cardsWithOutcomes };
  return jsonResponse(responseBody, { status: 200 });
}
