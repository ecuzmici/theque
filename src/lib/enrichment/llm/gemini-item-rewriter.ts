import "server-only";

import type { ItemCategory } from "@/lib/database.types";
import { generateJsonWithFallback } from "@/lib/ai/gateway";
import type { RawMetadata } from "@/lib/enrichment/extract";
import {
  type LlmItemRewriteProposal,
  buildStructuredJsonSchema,
  structuredFieldNamesForCategory,
  validateLlmItemRewriteProposal,
} from "@/lib/enrichment/llm/category-schemas";
import {
  ENRICHMENT_LLM_PROVIDER,
  ENRICHMENT_PROVIDER_OPTIONS,
  enrichmentModels,
  enrichmentTimeoutMs,
  isEnrichmentLlmConfigured,
} from "@/lib/enrichment/llm/llm-config";
import { normalizeLlmPayload } from "@/lib/enrichment/llm/normalize-llm-payload";

export type GeminiItemRewriteInput = {
  finalUrl: string;
  currentCategory: ItemCategory | null;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  structured: Record<string, unknown>;
  rawMetadata: RawMetadata;
  /** Readable main-content text (snapshot innerText or freshly fetched). */
  pageText: string | null;
};

export type GeminiItemRewriteResult =
  | {
      status: "enhanced";
      proposal: LlmItemRewriteProposal;
      providerMetadata: Record<string, unknown>;
    }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

const itemCategoryValues: ItemCategory[] = [
  "books",
  "movies_and_tv",
  "restaurants",
  "products",
  "travel",
  "recipes",
  "articles",
];

export function buildGeminiItemRewriteResponseJsonSchema(currentCategory?: ItemCategory | null) {
  return {
    type: "object",
    properties: {
      category: { type: "string", enum: itemCategoryValues },
      category_confidence: { type: "number", minimum: 0, maximum: 1 },
      title: { type: "string" },
      subtitle: { type: "string" },
      description: { type: "string" },
      image_url: { type: "string" },
      structured: buildStructuredJsonSchema(currentCategory ?? undefined),
      confidence: { type: "number", minimum: 0, maximum: 1 },
      sources: { type: "array", items: { type: "string" }, minItems: 1 },
      notes: { type: "string" },
    },
    required: ["category", "category_confidence", "confidence", "sources"],
    additionalProperties: false,
  };
}

export function buildGeminiItemRewritePrompt(input: GeminiItemRewriteInput): string {
  const supportedFields = input.currentCategory
    ? structuredFieldNamesForCategory(input.currentCategory)
    : [];
  return [
    "You are proposing a full metadata rewrite for a single item in Theque.",
    `Current category: ${input.currentCategory ?? "uncategorized"}.`,
    "You may change category, title, description, image_url, and structured metadata.",
    "This is a review flow, so return your best proposal even when it overwrites existing fields.",
    "Use only the provided URL and metadata evidence.",
    "Return the final proposed category and structured fields that match that category.",
    supportedFields.length > 0
      ? `Structured fields for ${input.currentCategory}: ${supportedFields.join(", ")}. If the category changes, use the fields for the new category instead.`
      : "Populate the structured fields that match the chosen category.",
    "Always preserve existing structured values when they are still accurate, and fill in any supported fields you have evidence for. Do not return an empty structured object when supported fields can be populated from the evidence.",
    "When evidence is strong from the URL or title, use it to correct obvious misclassifications.",
    "If the URL or title unambiguously identifies a specific well-known work, venue, or product (e.g. an IMDb title ID, a Goodreads book page, an exact title plus author), you MAY fill widely-known stable facts (authors, directors, year, genres, page counts, cuisine) from your own knowledge; include \"model_knowledge\" in sources when you do.",
    "NEVER invent volatile or unverifiable facts: prices, current ratings, ratings counts, availability, addresses, phone numbers, opening hours. These require page evidence.",
    "",
    `URL: ${input.finalUrl}`,
    `Title: ${input.title ?? ""}`,
    `Subtitle: ${input.subtitle ?? ""}`,
    `Description: ${input.description ?? ""}`,
    `Image URL: ${input.image_url ?? ""}`,
    `Structured: ${JSON.stringify(input.structured)}`,
    `Open Graph: ${JSON.stringify(input.rawMetadata.open_graph)}`,
    `Twitter: ${JSON.stringify(input.rawMetadata.twitter)}`,
    `JSON-LD: ${JSON.stringify(input.rawMetadata.json_ld)}`,
    `Parser: ${input.rawMetadata.parser}`,
    ...(input.pageText ? [`Page text: ${input.pageText}`] : []),
  ].join("\n");
}

export function normalizeGeminiItemRewritePayload(payload: unknown): GeminiItemRewriteResult {
  const validation = validateLlmItemRewriteProposal(normalizeLlmPayload(payload));
  if (!validation.ok) return { status: "failed", reason: validation.reason };
  return {
    status: "enhanced",
    proposal: validation.value,
    providerMetadata: {
      provider: ENRICHMENT_LLM_PROVIDER,
      status: "enhanced",
    },
  };
}

/**
 * Proposes a full metadata rewrite through the AI Gateway. The models in
 * enrichmentModels() run in order. The next model runs when a model errors,
 * times out, or returns a payload that fails validation.
 */
export async function rewriteItemWithGemini(input: GeminiItemRewriteInput): Promise<GeminiItemRewriteResult> {
  if (!isEnrichmentLlmConfigured()) return { status: "skipped", reason: "missing_api_key" };

  const prompt = buildGeminiItemRewritePrompt(input);
  const schema = buildGeminiItemRewriteResponseJsonSchema(input.currentCategory);
  const timeoutMs = enrichmentTimeoutMs();

  let lastReason = "llm_failed";
  for (const model of enrichmentModels()) {
    try {
      const { data } = await generateJsonWithFallback({
        models: [model],
        prompt,
        schema,
        timeoutMs,
        providerOptions: ENRICHMENT_PROVIDER_OPTIONS,
        label: "rewrite",
      });
      const normalized = normalizeGeminiItemRewritePayload(data);
      if (normalized.status === "enhanced") {
        return {
          ...normalized,
          providerMetadata: { ...normalized.providerMetadata, model },
        };
      }
      if (normalized.status === "failed") lastReason = normalized.reason;
    } catch (error) {
      lastReason = error instanceof Error ? error.message : "llm_failed";
    }
  }

  return { status: "failed", reason: lastReason };
}
