import type { Json } from "@/lib/database.types";
import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { applyItemRewriteProposal } from "@/lib/enrichment/llm/apply-item-rewrite-proposal";
import { validateLlmItemRewriteProposal } from "@/lib/enrichment/llm/category-schemas";
import { ENRICHMENT_LLM_PROVIDER } from "@/lib/enrichment/llm/llm-config";
import type {
  AiEnrichmentApplyRequestBody,
  AiEnrichmentApplyResponseBody,
} from "@/lib/types/api";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUserOrNull();
  if (!user) return Response.json({ code: "unauthorized" }, { status: 401 });

  const rl = await rateLimit(`ai-enrichment:${user.id}`, 10, 60);
  if (!rl.ok) {
    return Response.json(
      { code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 60) } },
    );
  }

  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: row, error } = await supabase.from("items").select("*").eq("id", id).maybeSingle();

  if (error || !row || row.user_id !== user.id) {
    return Response.json({ code: "not_found" }, { status: 404 });
  }

  let body: AiEnrichmentApplyRequestBody;
  try {
    body = (await req.json()) as AiEnrichmentApplyRequestBody;
  } catch {
    return Response.json({ code: "invalid_body" }, { status: 400 });
  }

  const validation = validateLlmItemRewriteProposal(body.proposal);
  if (!validation.ok) {
    return Response.json({ code: validation.reason }, { status: 400 });
  }

  const merged = applyItemRewriteProposal({
    current: {
      title: row.title,
      subtitle: row.subtitle,
      description: row.description,
      image_url: row.image_url,
      category: row.category,
      category_confidence: row.category_confidence,
      category_source: row.category_source,
      structured: asRecord(row.structured),
      rawMetadata: asRecord(row.raw_metadata),
    },
    proposal: validation.value,
    providerMetadata: {
      provider: body.proposal_metadata?.provider ?? ENRICHMENT_LLM_PROVIDER,
      model: body.proposal_metadata?.model,
    },
    now: new Date().toISOString(),
  });

  const { error: updateError } = await supabase
    .from("items")
    .update({
      title: merged.title,
      subtitle: merged.subtitle,
      description: merged.description,
      image_url: merged.image_url,
      category: merged.category,
      category_confidence: merged.category_confidence,
      category_source: merged.category_source,
      structured: merged.structured as Json,
      raw_metadata: merged.rawMetadata as Json,
      processing_status: "ready",
      enrichment_error: null,
      enriched_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    console.error("[api/items/:id/ai-enrichment-apply] update_failed:", updateError.message);
    return Response.json({ code: "update_failed" }, { status: 500 });
  }

  const { data: updated } = await supabase.from("items").select("*").eq("id", id).single();
  if (!updated) {
    return Response.json({ code: "not_found" }, { status: 404 });
  }

  return Response.json(updated as AiEnrichmentApplyResponseBody);
}
