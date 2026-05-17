import { timingSafeEqual } from "node:crypto";

import { parseBearerToken } from "@/lib/auth/capture-token";
import { enrichItem } from "@/lib/jobs/enrich-item";
import type { EnrichJobResponseBody } from "@/lib/types/api";
import { createAdminClient } from "@/lib/supabase/admin";

function hasValidCronSecret(bearer: string | null, secret: string | undefined): boolean {
  if (!bearer || !secret) return false;

  const bearerBuffer = Buffer.from(bearer);
  const secretBuffer = Buffer.from(secret);
  return bearerBuffer.length === secretBuffer.length && timingSafeEqual(bearerBuffer, secretBuffer);
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const bearer = parseBearerToken(req.headers.get("authorization"));
  if (!hasValidCronSecret(bearer, secret)) {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: ids, error } = await admin.rpc("claim_pending_enrichment_items", {
    batch_size: 10,
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
