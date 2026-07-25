/**
 * Exactly-once claim checks for Resend/Svix webhook deliveries.
 *
 * Svix retries any delivery that does not answer 2xx — seven attempts spread
 * over roughly eighteen hours — and each retry carries the **same `svix-id`**
 * with a fresh `svix-timestamp`. Most of what the webhook handler does survives
 * that happily: suppressing an already-suppressed profile is a no-op, and so is
 * resetting a counter that is already zero.
 *
 * Incrementing `digest_soft_bounce_count` is the exception. It is the one
 * non-idempotent write in the handler, and a redelivered event would count the
 * same transient failure twice, walking a healthy address towards suppression
 * on a threshold of three. So the id is claimed before the event is acted on.
 *
 * Cost, stated honestly: one extra round trip per handled webhook, and a table
 * that grows one row per event forever. At this product's volume (a handful of
 * letters a week) that is a few hundred rows a year; if it ever matters, prune
 * on `received_at` — the claim only needs to outlive Svix's retry window.
 *
 * The claim is *released* when the work that follows it fails, so a genuine
 * error is retried by the provider rather than being silently consumed by its
 * own de-duplication.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

export type WebhookEventsDb = SupabaseClient<Database>;

export type WebhookClaim = "claimed" | "duplicate" | "failed";

/**
 * Try to claim a webhook delivery. `"duplicate"` means this `svix-id` has
 * already been processed and the caller must not act on it again — but must
 * still answer 2xx, or Svix will keep redelivering it.
 *
 * A failing claim returns `"failed"` rather than falling through to
 * `"claimed"`: without a working claim there is no exactly-once guarantee, and
 * letting the provider retry is better than double-counting.
 */
export async function claimWebhookEvent(
  admin: WebhookEventsDb,
  svixId: string,
  eventType: string,
): Promise<WebhookClaim> {
  const { error } = await admin
    .from("email_webhook_events")
    .insert({ svix_id: svixId, event_type: eventType });

  if (!error) return "claimed";

  // 23505 = unique_violation: the primary key already holds this delivery.
  if (error.code === "23505") return "duplicate";

  console.error("[webhook-events] claim_failed:", error.message);
  return "failed";
}

/**
 * Give a claim back after the work it guarded failed, so the provider's retry
 * can do it properly. Best-effort: if the release itself fails the event is
 * merely dropped, which is the same outcome as never having received it.
 */
export async function releaseWebhookEvent(
  admin: WebhookEventsDb,
  svixId: string,
): Promise<void> {
  const { error } = await admin
    .from("email_webhook_events")
    .delete()
    .eq("svix_id", svixId);

  if (error) console.error("[webhook-events] release_failed:", error.message);
}
