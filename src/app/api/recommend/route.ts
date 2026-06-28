import "server-only";

import { randomUUID } from "node:crypto";

import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { generateJsonWithFallback } from "@/lib/ai/gateway";
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
} from "@/lib/recommend/recommend-config";
import { dedupRecommendations, normalizeTitle } from "@/lib/recommend/dedup";
import { buildRecommendPrompt } from "@/lib/recommend/recommend-prompt";
import { resolveBookWithOpenLibrary } from "@/lib/recommend/resolve/open-library";
import { resolveMovieWithTmdb } from "@/lib/recommend/resolve/tmdb";
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
  if (row.outcome === "dismissed") return true;
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

  const libraryItems = (libraryRows ?? []) as LibraryItemRow[];
  const titledItems = libraryItems.filter((row) => row.title?.trim());

  if (titledItems.length < RECOMMEND_MIN_ITEMS) {
    return jsonResponse(
      { error: `At least ${RECOMMEND_MIN_ITEMS} items are required in this shelf` },
      { status: 400 },
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
  };

  const settledResults = await Promise.allSettled(
    overRequested.map(async (candidate) => {
      const resolved = isWatch
        ? await resolveMovieWithTmdb(candidate)
        : await resolveBookWithOpenLibrary(candidate);

      if (!resolved) return null;

      const subtitle = [
        resolved.verified_author ?? candidate.creator,
        resolved.confirmed_year ?? candidate.year,
      ]
        .filter(Boolean)
        .join(" · ");

      const card: ResolvedCardDraft = {
        id: randomUUID(),
        outcome_id: "",
        title: candidate.title,
        subtitle,
        description: candidate.description,
        reason: candidate.reason,
        canonical_url: resolved.canonical_url,
        cover_url: resolved.cover_url,
        search_query: buildSearchQuery(candidate, shelfId),
        source: isWatch ? "tmdb" : "open_library",
        external_id: resolved.external_id,
        title_norm: normalizeTitle(candidate.title),
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

  const cardsWithOutcomes: ResolvedRecommendation[] = [];
  for (const card of finalCards) {
    const { data: inserted, error: insertError } = await supabase
      .from("recommendation_outcomes")
      .insert({
        user_id: user.id,
        category: outcomeCategory,
        external_id: card.external_id,
        title_norm: card.title_norm,
        outcome: "shown",
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      console.error("[api/recommend] outcome_insert_failed:", insertError?.message);
      continue;
    }

    const { external_id: _e, title_norm: _t, ...responseCard } = card;
    cardsWithOutcomes.push({
      ...responseCard,
      outcome_id: inserted.id,
    });
  }

  const responseBody: RecommendResponse = { cards: cardsWithOutcomes };
  return jsonResponse(responseBody, { status: 200 });
}
