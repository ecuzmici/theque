import { parseBearerToken } from "@/lib/auth/capture-token";
import { hasValidCronSecret } from "@/lib/auth/cron-secret";
import { enrichItem } from "@/lib/jobs/enrich-item";
import type { EnrichJobResponseBody } from "@/lib/types/api";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Items stuck in `processing` longer than this were claimed by a run that died
 * before writing a terminal status (serverless timeout, deploy mid-run, OOM).
 * The cutoff is far longer than any real enrichment (an 8s fetch plus a few
 * attempts), so in-flight work is never reset.
 */
const STALE_PROCESSING_MS = 15 * 60 * 1000;

/**
 * Recover orphaned `processing` rows. `claim_pending_enrichment_items` only
 * picks `pending` rows, so without this they would never be retried. Rows
 * already at the attempt cap are given up on (`failed`); the rest are requeued.
 * Failures here are logged but do not abort the job.
 */
async function requeueStaleProcessing(admin: ReturnType<typeof createAdminClient>) {
  const cutoff = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();

  const capped = await admin
    .from("items")
    .update({ processing_status: "failed", enrichment_error: "stale_processing" })
    .eq("processing_status", "processing")
    .lt("updated_at", cutoff)
    .gte("enrichment_attempts", 3);
  if (capped.error) {
    console.error("[api/jobs/enrich] stale_fail_failed:", capped.error.message);
  }

  const requeued = await admin
    .from("items")
    .update({ processing_status: "pending" })
    .eq("processing_status", "processing")
    .lt("updated_at", cutoff);
  if (requeued.error) {
    console.error("[api/jobs/enrich] stale_requeue_failed:", requeued.error.message);
  }
}

async function handleEnrichJob(req: Request) {
  const secret = process.env.CRON_SECRET;
  const bearer = parseBearerToken(req.headers.get("authorization"));
  if (!hasValidCronSecret(bearer, secret)) {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  await requeueStaleProcessing(admin);

  const { data: ids, error } = await admin.rpc("claim_pending_enrichment_items", {
    batch_size: 10,
    per_user_cap: 3,
  });

  if (error) {
    console.error("[api/jobs/enrich] claim_failed:", error.message);
    return Response.json({ code: "claim_failed" }, { status: 500 });
  }

  let processed = 0;
  let failed = 0;

  for (const id of ids ?? []) {
    const outcome = await enrichItem(id);
    if (outcome === "ready") processed += 1;
    else if (outcome === "failed") failed += 1;
  }

  const body: EnrichJobResponseBody = { processed, failed };
  return Response.json(body);
}

export async function GET(req: Request) {
  return handleEnrichJob(req);
}

export async function POST(req: Request) {
  return handleEnrichJob(req);
}
