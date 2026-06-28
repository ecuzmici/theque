import "server-only";

import { getSessionUserOrNull } from "@/lib/auth/session-user";
import type {
  RecommendDismissReason,
  RecommendOutcomeAction,
  RecommendOutcomeRequest,
} from "@/lib/recommend/recommend-types";
import { createClient } from "@/lib/supabase/server";

const VALID_OUTCOMES: RecommendOutcomeAction[] = ["saved", "dismissed"];
const VALID_DISMISS_REASONS: RecommendDismissReason[] = [
  "not_my_thing",
  "already_seen",
  "not_right_now",
];

function jsonResponse(body: unknown, init?: ResponseInit) {
  return Response.json(body, init);
}

function isOutcomeAction(value: unknown): value is RecommendOutcomeAction {
  return typeof value === "string" && VALID_OUTCOMES.includes(value as RecommendOutcomeAction);
}

function isDismissReason(value: unknown): value is RecommendDismissReason {
  return (
    typeof value === "string" &&
    VALID_DISMISS_REASONS.includes(value as RecommendDismissReason)
  );
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

  const parsed = (body ?? {}) as Partial<RecommendOutcomeRequest>;
  const { outcomeId, outcome, dismissReason } = parsed;

  if (typeof outcomeId !== "string" || !outcomeId.trim()) {
    return jsonResponse({ error: "outcomeId is required" }, { status: 400 });
  }

  if (!isOutcomeAction(outcome)) {
    return jsonResponse(
      { error: "outcome must be 'saved' or 'dismissed'" },
      { status: 400 },
    );
  }

  if (
    dismissReason !== undefined &&
    outcome === "dismissed" &&
    !isDismissReason(dismissReason)
  ) {
    return jsonResponse({ error: "Invalid dismissReason" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: existing, error: lookupError } = await supabase
    .from("recommendation_outcomes")
    .select("id")
    .eq("id", outcomeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (lookupError) {
    console.error("[api/recommend/outcomes] lookup_failed:", lookupError.message);
    return jsonResponse({ error: "Could not load outcome" }, { status: 500 });
  }

  if (!existing) {
    return jsonResponse({ error: "Not found" }, { status: 404 });
  }

  const actedAt = new Date().toISOString();
  const updatePayload =
    outcome === "dismissed"
      ? {
          outcome,
          acted_at: actedAt,
          ...(dismissReason !== undefined ? { dismiss_reason: dismissReason } : {}),
        }
      : { outcome, acted_at: actedAt };

  // Guard against concurrent requests: adding .eq("outcome", "shown") makes the
  // UPDATE a no-op if another request already acted, which we treat as 409.
  const { data: updatedRows, error: updateError } = await supabase
    .from("recommendation_outcomes")
    .update(updatePayload)
    .eq("id", outcomeId)
    .eq("user_id", user.id)
    .eq("outcome", "shown")
    .select("id");

  if (updateError) {
    console.error("[api/recommend/outcomes] update_failed:", updateError.message);
    return jsonResponse({ error: "Could not update outcome" }, { status: 500 });
  }

  if (!updatedRows?.length) {
    return jsonResponse({ error: "Outcome already recorded" }, { status: 409 });
  }

  return jsonResponse({ ok: true }, { status: 200 });
}
