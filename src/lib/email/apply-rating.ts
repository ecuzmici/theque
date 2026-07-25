/**
 * Applies a verified rating-link tap to an item.
 *
 * The user is not logged in when this runs — the signed token *is* the
 * authorization — so it goes through the admin client and every query is
 * constrained by BOTH `id` and `user_id`. A token that names someone else's
 * item simply matches no row.
 *
 * Idempotency matters more here than anywhere else in the app: email clients
 * prefetch links, users re-open old mail, and the same URL can be hit many
 * times. Re-applying the same tap is a no-op, and `done_at` is only ever
 * stamped once so a later tap can't keep pushing an item's completion date
 * forward. `verdict` and `note` are never written — this flow sets the star,
 * the done status, and the timestamp, nothing else.
 */
import "server-only";

import type { ItemCategory, ItemStatus } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

import type { RatingLinkPayload } from "./rating-link";

const RATED_ITEM_COLUMNS = "id, title, domain, category, status, rating_personal, done_at";

export type RatedItem = {
  id: string;
  title: string | null;
  domain: string;
  category: ItemCategory | null;
  status: ItemStatus;
  rating_personal: number | null;
  done_at: string | null;
};

export type ApplyRatingFailureReason = "not_found" | "write_failed" | "server_misconfigured";

export type ApplyRatingResult =
  | { ok: true; item: RatedItem }
  | { ok: false; reason: ApplyRatingFailureReason };

export async function applyRatingFromLink(
  payload: RatingLinkPayload,
  nowMs: number = Date.now(),
): Promise<ApplyRatingResult> {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error("[rate] admin_client_unavailable:", (error as Error).message);
    return { ok: false, reason: "server_misconfigured" };
  }

  const { data: row, error: loadError } = await admin
    .from("items")
    .select(RATED_ITEM_COLUMNS)
    .eq("id", payload.itemId)
    .eq("user_id", payload.userId)
    .maybeSingle();

  if (loadError) {
    console.error("[rate] load_failed:", loadError.message);
    return { ok: false, reason: "write_failed" };
  }
  // Deleted item, or a token naming an item that belongs to another profile.
  if (!row) return { ok: false, reason: "not_found" };

  const item = row as RatedItem;

  // Nothing to change: a prefetch, a double-tap, or a re-opened old email.
  if (item.status === "done" && item.rating_personal === payload.stars && item.done_at !== null) {
    return { ok: true, item };
  }

  const { data: updated, error: updateError } = await admin
    .from("items")
    .update({
      rating_personal: payload.stars,
      status: "done",
      // Keep the first completion timestamp; only stamp it if absent.
      done_at: item.done_at ?? new Date(nowMs).toISOString(),
    })
    .eq("id", payload.itemId)
    .eq("user_id", payload.userId)
    .select(RATED_ITEM_COLUMNS)
    .maybeSingle();

  if (updateError) {
    console.error("[rate] update_failed:", updateError.message);
    return { ok: false, reason: "write_failed" };
  }
  if (!updated) return { ok: false, reason: "not_found" };

  return { ok: true, item: updated as RatedItem };
}
