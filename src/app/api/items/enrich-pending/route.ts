/**
 * POST /api/items/enrich-pending — drain a slice of *your own* enrichment queue.
 *
 * ## Why this exists
 *
 * Bulk import lands rows at `processing_status = 'pending'` and lets the nightly
 * cron fetch the covers. That cron is shared and fair, which is exactly wrong for
 * someone who has just imported 400 books and is looking at 400 blank cards: at
 * a per-user slice per day the shelf would take months to fill. thèque is a
 * visual library, so this route lets the person who is actually waiting spend
 * their own attention draining their own backlog, in bounded slices, while the
 * import wizard shows the count going down.
 *
 * ## Bounds, because this is the most abusable surface in the app
 *
 * Every claimed row means an outbound fetch to a third-party site of the user's
 * choosing. Three things keep that in hand:
 *
 * 1. `DRAIN_BATCH_SIZE` — a handful of items per request, so one call cannot
 *    turn into a crawl and always finishes inside the function budget.
 * 2. Its own rate-limit bucket, tighter than a human loop needs but far tighter
 *    than a script would like.
 * 3. The claim itself: `target_user` is the *session* user, so the ceiling on
 *    everything this route will ever fetch is the caller's own pending rows,
 *    which `MAX_ITEMS_PER_USER` already caps.
 */

import { getSessionUserOrNull } from "@/lib/auth/session-user";
import {
  claimPendingEnrichmentItems,
  countPendingForUser,
  requeueStaleProcessing,
  runEnrichBatch,
} from "@/lib/jobs/enrich-queue";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EnrichPendingResponseBody } from "@/lib/types/api";

/** Hobby ceiling; the budget below stops work well short of it. */
export const maxDuration = 60;

/**
 * Items per request.
 *
 * `enrichItem` is one outbound fetch (8s ceiling) plus image caching, run
 * `ENRICH_CONCURRENCY` at a time — so six is two waves, a handful of seconds in
 * practice and comfortably inside the budget even when every fetch times out.
 * Small batches also make the loop *interruptible*: a closed tab strands at most
 * six rows in `processing`, and they come back on the next call (see the retry
 * below) or on the nightly stale sweep.
 */
const DRAIN_BATCH_SIZE = 6;

/** Leaves room to release leftovers and answer before the platform gives up. */
const DRAIN_BUDGET_MS = 40_000;

/**
 * Requests per minute per user. A wizard loop is paced by its own round trips
 * (~6 calls/minute), so this is headroom for a human with two tabs open, and a
 * hard ceiling of ~120 items/minute on anyone scripting it.
 */
const DRAIN_RATE_LIMIT = 20;
const DRAIN_RATE_WINDOW_SEC = 60;

/**
 * GET — how many rows are still waiting, without enriching anything.
 *
 * This is what makes a drain resumable: a tab closed half-way leaves the
 * backlog in the database, and a later visit asks this before deciding whether
 * to offer to continue. Its own (looser) bucket, because it is a single count
 * and triggers no outbound traffic at all.
 */
export async function GET() {
  const user = await getSessionUserOrNull();
  if (!user) return Response.json({ code: "unauthorized" }, { status: 401 });

  const rl = await rateLimit(`enrich-pending-status:${user.id}`, 30, DRAIN_RATE_WINDOW_SEC);
  if (!rl.ok) {
    return Response.json(
      { code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? DRAIN_RATE_WINDOW_SEC) } },
    );
  }

  const admin = createAdminClient();
  const body: EnrichPendingResponseBody = {
    claimed: 0,
    processed: 0,
    failed: 0,
    remaining: (await countPendingForUser(admin, user.id)) ?? 0,
  };
  return Response.json(body);
}

export async function POST() {
  const user = await getSessionUserOrNull();
  if (!user) return Response.json({ code: "unauthorized" }, { status: 401 });

  const rl = await rateLimit(`enrich-pending:${user.id}`, DRAIN_RATE_LIMIT, DRAIN_RATE_WINDOW_SEC);
  if (!rl.ok) {
    return Response.json(
      { code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? DRAIN_RATE_WINDOW_SEC) } },
    );
  }

  // Service role: `claim_pending_enrichment_items` is granted to `service_role`
  // only, and enrichment writes columns the user's own client has no business
  // setting. The scope comes from `target_user`/`user_id`, never from the
  // request — there is no request body to trust.
  const admin = createAdminClient();

  const claim = () =>
    claimPendingEnrichmentItems(admin, {
      batchSize: DRAIN_BATCH_SIZE,
      perUserCap: DRAIN_BATCH_SIZE,
      targetUser: user.id,
    });

  let { ids, error } = await claim();

  // Nothing claimable can mean "done" or "the last run died holding rows".
  // Sweeping only in that case keeps the cost off the common path while still
  // letting someone who closed the tab pick up where they left off.
  if (!error && ids.length === 0) {
    await requeueStaleProcessing(admin, user.id);
    ({ ids, error } = await claim());
  }

  if (error) {
    console.error("[api/items/enrich-pending] claim_failed:", error);
    return Response.json({ code: "claim_failed" }, { status: 500 });
  }

  const { processed, failed } = await runEnrichBatch(admin, ids, {
    budgetMs: DRAIN_BUDGET_MS,
  });

  // A failed count would leave the client looping forever; 0 stops it, and the
  // nightly cron still has the backlog.
  const remaining = (await countPendingForUser(admin, user.id)) ?? 0;

  const body: EnrichPendingResponseBody = {
    claimed: ids.length,
    processed,
    failed,
    remaining,
  };
  return Response.json(body);
}
