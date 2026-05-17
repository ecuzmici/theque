import type { Json } from "@/lib/database.types";
import type { RawMetadata } from "@/lib/enrichment/extract";
import { rewriteItemWithGemini } from "@/lib/enrichment/llm/gemini-item-rewriter";
import { getSessionUserOrNull } from "@/lib/auth/session-user";
import type { AiEnrichmentProposalResponseBody } from "@/lib/types/api";
import { createClient } from "@/lib/supabase/server";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeRawMetadata(value: Json, canonicalUrl: string): RawMetadata {
  const raw = asRecord(value);
  return {
    fetched_at: typeof raw.fetched_at === "string" ? raw.fetched_at : new Date().toISOString(),
    final_url: typeof raw.final_url === "string" ? raw.final_url : canonicalUrl,
    status_code: typeof raw.status_code === "number" ? raw.status_code : 200,
    open_graph: asRecord(raw.open_graph) as Record<string, string>,
    twitter: asRecord(raw.twitter) as Record<string, string>,
    json_ld: Array.isArray(raw.json_ld) ? (raw.json_ld as Json) : [],
    parser: typeof raw.parser === "string" ? raw.parser : "generic",
  };
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUserOrNull();
  if (!user) return Response.json({ code: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: row, error } = await supabase.from("items").select("*").eq("id", id).maybeSingle();

  if (error || !row || row.user_id !== user.id) {
    return Response.json({ code: "not_found" }, { status: 404 });
  }

  const result = await rewriteItemWithGemini({
    finalUrl: row.canonical_url,
    currentCategory: row.category,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    image_url: row.image_url,
    structured: asRecord(row.structured),
    rawMetadata: normalizeRawMetadata(row.raw_metadata, row.canonical_url),
  });

  if (result.status === "skipped") {
    return Response.json({ code: result.reason }, { status: 503 });
  }

  if (result.status === "failed") {
    console.error("[api/items/:id/ai-enrichment-proposal] proposal_failed:", result.reason);
    return Response.json({ code: "proposal_failed" }, { status: 502 });
  }

  const body: AiEnrichmentProposalResponseBody = {
    item_id: id,
    proposal: {
      category: result.proposal.category,
      category_confidence: result.proposal.category_confidence,
      title: result.proposal.title ?? null,
      subtitle: result.proposal.subtitle ?? null,
      description: result.proposal.description ?? null,
      image_url: result.proposal.image_url ?? null,
      structured: (result.proposal.structured ?? {}) as Record<string, Json>,
      confidence: result.proposal.confidence,
      sources: result.proposal.sources,
      notes: result.proposal.notes ?? null,
    },
    proposal_metadata: {
      provider: String(result.providerMetadata.provider ?? "gemini"),
      model:
        typeof result.providerMetadata.model === "string"
          ? result.providerMetadata.model
          : undefined,
    },
  };

  return Response.json(body);
}
