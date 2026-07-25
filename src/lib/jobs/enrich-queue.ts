import "server-only";

import { enrichItem } from "@/lib/jobs/enrich-item";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Items stuck in `processing` longer than this were claimed by a run that died
 * before writing a terminal status (serverless timeout, deploy mid-run, OOM).
 * The cutoff is far longer than any real enrichment (an 8s fetch plus a few
 * attempts), so in-flight work is never reset.
 */
export const STALE_PROCESSING_MS = 15 * 60 * 1000;

/**
 * Recover orphaned `processing` rows. `claim_pending_enrichment_items` only
 * picks `pending` rows, so without this they would never be retried. Rows
 * already at the attempt cap are given up on (`failed`); the rest are requeued.
 * Failures here are logged but do not abort the caller.
 *
 * `userId` scopes the sweep to one library. The cron sweeps everyone; the
 * interactive drain sweeps only the caller, so a user who closed the tab
 * mid-batch gets their own rows back the moment they return, instead of waiting
 * for the next nightly run.
 */
export async function requeueStaleProcessing(admin: AdminClient, userId?: string) {
  const cutoff = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();

  const capped = admin
    .from("items")
    .update({ processing_status: "failed", enrichment_error: "stale_processing" })
    .eq("processing_status", "processing")
    .lt("updated_at", cutoff)
    .gte("enrichment_attempts", 3);
  const cappedResult = await (userId ? capped.eq("user_id", userId) : capped);
  if (cappedResult.error) {
    console.error("[jobs/enrich-queue] stale_fail_failed:", cappedResult.error.message);
  }

  const requeued = admin
    .from("items")
    .update({ processing_status: "pending" })
    .eq("processing_status", "processing")
    .lt("updated_at", cutoff);
  const requeuedResult = await (userId ? requeued.eq("user_id", userId) : requeued);
  if (requeuedResult.error) {
    console.error("[jobs/enrich-queue] stale_requeue_failed:", requeuedResult.error.message);
  }
}

function readPositiveInt(raw: string | undefined, fallback: number, max: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

/**
 * Rows one cron run claims.
 *
 * Sized against the wall clock, not against fairness: a run enriches serially
 * (times `ENRICH_CONCURRENCY`) inside one 60s function, so anything past
 * ~budget/latency is claimed and immediately released again. 60 is deliberately
 * a little above what a run can finish — `runEnrichBatch` hands the remainder
 * back, and over-claiming costs one UPDATE while under-claiming costs a day.
 */
export function enrichBatchSize(): number {
  return readPositiveInt(process.env.ENRICH_BATCH_SIZE, 60, 500);
}

/**
 * Rows one *user* can take from a single cron run.
 *
 * This is the fairness knob: without it, one 5,000-row import would own every
 * nightly run until it finished and nobody else's captures would get covers.
 * Raised from 3 to 20 because a shared run now processes far more rows than it
 * used to, so a bigger slice for the importer no longer means a smaller one for
 * everyone else — with 13 active libraries, 20 is roughly a third of a run.
 * Interactive drains (`POST /api/items/enrich-pending`) are how an import
 * actually finishes; this only has to keep the tail moving.
 */
export function enrichPerUserCap(): number {
  return readPositiveInt(process.env.ENRICH_PER_USER_CAP, 20, 500);
}

/**
 * Items enriched at once. Each one is dominated by a single outbound fetch (8s
 * ceiling), so a little concurrency multiplies throughput per function-second;
 * too much multiplies memory (sharp decodes covers) and the load we put on the
 * sites being fetched.
 */
export function enrichConcurrency(): number {
  return readPositiveInt(process.env.ENRICH_CONCURRENCY, 3, 10);
}

export type ClaimArgs = {
  batchSize: number;
  perUserCap: number;
  /** Restrict the claim to one library. Must come from a verified session. */
  targetUser?: string;
};

/**
 * Atomically move `pending` rows to `processing` and return their ids.
 *
 * The RPC does the work in one statement with `for update skip locked`, so two
 * concurrent callers — two cron runs, two browser tabs — can never be handed the
 * same row. `target_user` is applied inside that same statement, which is what
 * makes the user-scoped drain safe: there is no read-then-filter window in
 * application code where the two could disagree.
 */
export async function claimPendingEnrichmentItems(
  admin: AdminClient,
  { batchSize, perUserCap, targetUser }: ClaimArgs,
): Promise<{ ids: string[]; error: string | null }> {
  // Omitting `target_user` entirely (rather than passing null) keeps the call
  // identical to the one the cron has always made, so a run against a database
  // where the migration has not yet landed still resolves.
  const args = {
    batch_size: batchSize,
    per_user_cap: perUserCap,
    ...(targetUser ? { target_user: targetUser } : {}),
  };

  const { data, error } = await admin.rpc("claim_pending_enrichment_items", args);
  if (error) return { ids: [], error: error.message };
  return { ids: (data as string[] | null) ?? [], error: null };
}

export type EnrichBatchResult = {
  processed: number;
  failed: number;
  /** Claimed but never started, and handed back to `pending` before returning. */
  released: number;
};

export type RunEnrichBatchOptions = {
  /**
   * Wall-clock budget for *starting* work. A serverless function that is killed
   * mid-batch leaves rows stranded in `processing` until the stale sweep, so the
   * runner stops taking new items well before the platform's limit and returns
   * the rest to the queue itself.
   */
  budgetMs: number;
  concurrency?: number;
  /** Injectable clock, for tests. */
  now?: () => number;
};

/**
 * Enrich a claimed batch, then release whatever the budget did not reach.
 *
 * Releasing is what lets `enrichBatchSize()` be set optimistically: a run claims
 * more than it can certainly finish, keeps the pipeline full for its whole
 * budget, and gives the leftovers straight back instead of parking them in
 * `processing` for the 15-minute stale window.
 */
export async function runEnrichBatch(
  admin: AdminClient,
  ids: string[],
  options: RunEnrichBatchOptions,
): Promise<EnrichBatchResult> {
  const now = options.now ?? Date.now;
  const concurrency = Math.max(1, options.concurrency ?? enrichConcurrency());
  const start = now();

  const attempted = new Set<string>();
  let processed = 0;
  let failed = 0;
  let cursor = 0;
  let started = 0;

  async function worker() {
    for (;;) {
      const index = cursor;
      if (index >= ids.length) return;
      // The first wave always runs: a batch must make progress even if the
      // budget was already spent by the claim itself.
      if (started >= concurrency && now() - start >= options.budgetMs) return;
      cursor += 1;
      started += 1;

      const id = ids[index];
      attempted.add(id);
      try {
        const outcome = await enrichItem(id);
        if (outcome === "ready") processed += 1;
        else if (outcome === "failed") failed += 1;
      } catch (err) {
        // `enrichItem` writes its own terminal status; anything thrown past it
        // is infrastructure (the row stays `processing` for the stale sweep).
        console.error("[jobs/enrich-queue] enrich_threw:", id, err);
        failed += 1;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, ids.length) }, () => worker()),
  );

  const leftover = ids.filter((id) => !attempted.has(id));
  if (leftover.length > 0) {
    const { error } = await admin
      .from("items")
      .update({ processing_status: "pending" })
      .in("id", leftover)
      // Only undo *our* claim; a row someone else already moved on is theirs.
      .eq("processing_status", "processing");
    if (error) {
      console.error("[jobs/enrich-queue] release_failed:", error.message);
    }
  }

  return { processed, failed, released: leftover.length };
}

/** Rows still waiting for enrichment in one library. */
export async function countPendingForUser(
  admin: AdminClient,
  userId: string,
): Promise<number | null> {
  const { count, error } = await admin
    .from("items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("processing_status", "pending");
  if (error) {
    console.error("[jobs/enrich-queue] pending_count_failed:", error.message);
    return null;
  }
  return count ?? 0;
}
