import "server-only";

import { randomUUID } from "node:crypto";

import type { ItemCategory } from "@/lib/database.types";
import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { rateLimit } from "@/lib/rate-limit";
import {
  GEMINI_RECOMMEND_MODEL,
  GEMINI_RECOMMEND_TEMPERATURE,
  GEMINI_RECOMMEND_TIMEOUT_MS,
  RECOMMEND_COUNT,
  RECOMMEND_MAX_INPUT_ITEMS,
  RECOMMEND_MIN_ITEMS,
  RECOMMEND_OVER_REQUEST,
  RECOMMEND_RATE_LIMIT_PER_DAY,
  isShelfRecommendEnabled,
} from "@/lib/recommend/recommend-config";
import { dedupRecommendations } from "@/lib/recommend/dedup";
import { buildRecommendPrompt, RECOMMEND_RESPONSE_SCHEMA } from "@/lib/recommend/recommend-prompt";
import { resolveBookWithOpenLibrary } from "@/lib/recommend/resolve/open-library";
import { resolveMovieWithTmdb } from "@/lib/recommend/resolve/tmdb";
import type {
  LlmCandidate,
  RecommendRequest,
  RecommendResponse,
  ResolvedRecommendation,
} from "@/lib/recommend/recommend-types";
import { createClient } from "@/lib/supabase/server";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return Response.json(body, init);
}

/** Return category filter(s) for a given shelf. */
function categoriesForShelf(shelfId: "books" | "watch"): ItemCategory[] {
  if (shelfId === "books") return ["books"];
  return ["movies_and_tv", "videos"];
}

/** Build a Google search fallback query. */
function buildSearchQuery(candidate: LlmCandidate, shelfId: "books" | "watch"): string {
  const type = shelfId === "books" ? "book" : "film";
  const parts = [candidate.title];
  if (candidate.creator) parts.push(candidate.creator);
  parts.push(type);
  return parts.join(" ");
}

export async function POST(req: Request) {
  // Auth
  const user = await getSessionUserOrNull();
  if (!user) {
    return jsonResponse({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, { status: 400 });
  }

  const { shelfId, items } = (body ?? {}) as Partial<RecommendRequest>;

  // Validate shelfId
  if (shelfId !== "books" && shelfId !== "watch") {
    return jsonResponse(
      { error: "shelfId must be 'books' or 'watch'" },
      { status: 400 },
    );
  }

  // Gate check (defense-in-depth; button should already be hidden)
  if (!isShelfRecommendEnabled(shelfId)) {
    return jsonResponse(
      { error: "Recommendations not configured" },
      { status: 503 },
    );
  }

  // Validate items
  if (!Array.isArray(items) || items.length === 0) {
    return jsonResponse(
      { error: "items must be a non-empty array" },
      { status: 400 },
    );
  }
  if (items.length > RECOMMEND_MAX_INPUT_ITEMS) {
    return jsonResponse(
      { error: `items must not exceed ${RECOMMEND_MAX_INPUT_ITEMS}` },
      { status: 400 },
    );
  }
  if (items.length < RECOMMEND_MIN_ITEMS) {
    return jsonResponse(
      { error: `At least ${RECOMMEND_MIN_ITEMS} items are required` },
      { status: 400 },
    );
  }

  // B1 rate limit (daily cap per user)
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

  // Load existing titles for dedup (one scoped query)
  const supabase = await createClient();
  const categories = categoriesForShelf(shelfId);
  const { data: existingRows } = await supabase
    .from("items")
    .select("title")
    .eq("user_id", user.id)
    .in("category", categories);
  const existingTitles = (existingRows ?? []).map((r) => r.title);

  // Call Gemini for identity-only candidates
  let candidates: LlmCandidate[];
  try {
    const apiKey = process.env.GEMINI_API_KEY!;
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });

    const prompt = buildRecommendPrompt(shelfId, items);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      GEMINI_RECOMMEND_TIMEOUT_MS,
    );

    let responseText: string | null | undefined;
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_RECOMMEND_MODEL,
        contents: prompt,
        config: {
          abortSignal: controller.signal,
          temperature: GEMINI_RECOMMEND_TEMPERATURE,
          responseMimeType: "application/json",
          responseJsonSchema: RECOMMEND_RESPONSE_SCHEMA,
        },
      });
      responseText = response.text;
    } finally {
      clearTimeout(timeout);
    }

    if (!responseText) throw new Error("empty_response");
    const parsed = JSON.parse(responseText) as { candidates?: unknown[] };
    if (!Array.isArray(parsed.candidates)) throw new Error("invalid_response_shape");

    candidates = parsed.candidates.filter(
      (c): c is LlmCandidate =>
        c !== null &&
        typeof c === "object" &&
        typeof (c as Record<string, unknown>).title === "string" &&
        typeof (c as Record<string, unknown>).creator === "string" &&
        typeof (c as Record<string, unknown>).description === "string" &&
        typeof (c as Record<string, unknown>).reason === "string",
    );
  } catch (err) {
    console.error("[api/recommend] gemini_failed:", err instanceof Error ? err.message : err);
    return jsonResponse(
      { error: "Could not generate recommendations" },
      { status: 502 },
    );
  }

  // Resolve candidates in parallel
  const isWatch = shelfId === "watch";
  const overRequested = candidates.slice(0, RECOMMEND_OVER_REQUEST);

  const settledResults = await Promise.allSettled(
    overRequested.map(async (candidate) => {
      const resolved = isWatch
        ? await resolveMovieWithTmdb(candidate)
        : await resolveBookWithOpenLibrary(candidate);

      if (!resolved) return null;

      const subtitle = [
        candidate.creator,
        resolved.confirmed_year ?? candidate.year,
      ]
        .filter(Boolean)
        .join(" · ");

      const card: ResolvedRecommendation = {
        id: randomUUID(),
        title: candidate.title,
        subtitle,
        description: candidate.description,
        reason: candidate.reason,
        canonical_url: resolved.canonical_url,
        cover_url: resolved.cover_url,
        search_query: buildSearchQuery(candidate, shelfId),
        source: isWatch ? "tmdb" : "open_library",
      };
      return card;
    }),
  );

  // Collect resolved cards (drop nulls and rejections)
  const resolvedCards = settledResults
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((c): c is ResolvedRecommendation => c !== null);

  // Dedup against existing library
  const dedupedCards = dedupRecommendations(resolvedCards, existingTitles);

  // Return up to RECOMMEND_COUNT
  const finalCards = dedupedCards.slice(0, RECOMMEND_COUNT);

  const responseBody: RecommendResponse = { cards: finalCards };
  return jsonResponse(responseBody, { status: 200 });
}
