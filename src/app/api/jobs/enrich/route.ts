import { parseBearerToken } from "@/lib/auth/capture-token";
import { hasValidCronSecret } from "@/lib/auth/cron-secret";
import {
  claimPendingEnrichmentItems,
  enrichBatchSize,
  enrichPerUserCap,
  requeueStaleProcessing,
  runEnrichBatch,
} from "@/lib/jobs/enrich-queue";
import type { EnrichJobResponseBody } from "@/lib/types/api";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The nightly backstop for everyone who does not sit and watch the import
 * wizard. One run is one function invocation, so its real limit is the clock,
 * not the batch size — 60s is the Hobby ceiling and `CRON_BUDGET_MS` keeps the
 * runner from being killed with rows still marked `processing`.
 */
export const maxDuration = 60;

/** Stop starting new items with enough slack to release the rest and respond. */
const CRON_BUDGET_MS = 50_000;

async function handleEnrichJob(req: Request) {
  const secret = process.env.CRON_SECRET;
  const bearer = parseBearerToken(req.headers.get("authorization"));
  if (!hasValidCronSecret(bearer, secret)) {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  await requeueStaleProcessing(admin);

  const { ids, error } = await claimPendingEnrichmentItems(admin, {
    batchSize: enrichBatchSize(),
    perUserCap: enrichPerUserCap(),
  });

  if (error) {
    console.error("[api/jobs/enrich] claim_failed:", error);
    return Response.json({ code: "claim_failed" }, { status: 500 });
  }

  const { processed, failed } = await runEnrichBatch(admin, ids, {
    budgetMs: CRON_BUDGET_MS,
  });

  const body: EnrichJobResponseBody = { processed, failed };
  return Response.json(body);
}

export async function GET(req: Request) {
  return handleEnrichJob(req);
}

export async function POST(req: Request) {
  return handleEnrichJob(req);
}
