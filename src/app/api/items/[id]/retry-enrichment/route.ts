import { after } from "next/server";

import { getSessionUserOrNull } from "@/lib/auth/session-user";
import type { RetryEnrichmentResponseBody } from "@/lib/types/api";
import { enrichItem } from "@/lib/jobs/enrich-item";
import { createClient } from "@/lib/supabase/server";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUserOrNull();
  if (!user) return Response.json({ code: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: updatedRows, error } = await supabase
    .from("items")
    .update({
      processing_status: "pending",
      enrichment_attempts: 0,
      enrichment_error: null,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    console.error("[api/items/:id/retry-enrichment] update_failed:", error.message);
    return Response.json({ code: "update_failed" }, { status: 500 });
  }

  if (!updatedRows?.length) {
    return Response.json({ code: "not_found" }, { status: 404 });
  }

  after(async () => {
    await enrichItem(id);
  });

  const body: RetryEnrichmentResponseBody = {
    item_id: id,
    processing_status: "pending",
  };

  return Response.json(body, { status: 202 });
}
