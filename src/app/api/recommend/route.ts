import "server-only";

import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { aiDailyLimitForUser } from "@/lib/ai/limits";
import { rateLimit } from "@/lib/rate-limit";
import {
  RECOMMEND_MIN_ITEMS,
  RECOMMEND_RATE_LIMIT_PER_DAY,
  isShelfRecommendEnabled,
  pickWatchRegion,
} from "@/lib/recommend/recommend-config";
import {
  generateRecommendations,
  type RecommendGenerationErrorCode,
} from "@/lib/recommend/generate";
import type { RecommendRequest, RecommendResponse } from "@/lib/recommend/recommend-types";
import { createClient } from "@/lib/supabase/server";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return Response.json(body, init);
}

/** Map a pipeline failure onto its HTTP shape. */
function errorResponse(code: RecommendGenerationErrorCode) {
  switch (code) {
    case "library_query_failed":
    case "decrypt_failed":
      return jsonResponse({ error: "Could not load library" }, { status: 500 });
    case "insufficient_items":
      return jsonResponse(
        { error: `At least ${RECOMMEND_MIN_ITEMS} items are required in this shelf` },
        { status: 400 },
      );
    case "outcomes_query_failed":
      return jsonResponse({ error: "Could not load recommendation history" }, { status: 500 });
    case "llm_failed":
      return jsonResponse({ error: "Could not generate recommendations" }, { status: 502 });
    case "outcome_insert_failed":
      return jsonResponse({ error: "Could not record recommendations" }, { status: 500 });
  }
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

  // Per-request budget stays here: it is this surface's policy (a 429 with
  // Retry-After), not part of the pipeline. Other callers of
  // generateRecommendations bring their own limiter.
  const rl = await rateLimit(
    `recommend:${user.id}`,
    aiDailyLimitForUser(user.id, RECOMMEND_RATE_LIMIT_PER_DAY),
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
  const result = await generateRecommendations({
    userId: user.id,
    shelfId,
    supabase,
    region: pickWatchRegion(req.headers.get("x-vercel-ip-country")),
  });

  if (!result.ok) {
    return errorResponse(result.code);
  }

  const responseBody: RecommendResponse = result.reason
    ? { cards: result.cards, reason: result.reason }
    : { cards: result.cards };
  return jsonResponse(responseBody, { status: 200 });
}
