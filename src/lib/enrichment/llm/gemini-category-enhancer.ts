import "server-only";

import type { ItemCategory } from "@/lib/database.types";
import type { RawMetadata } from "@/lib/enrichment/extract";
import {
  FIELD_SOURCE_VALUES,
  type LlmCategoryEnhancement,
  buildStructuredJsonSchema,
  validateLlmCategoryEnhancement,
} from "@/lib/enrichment/llm/category-schemas";
import { generateJsonWithFallback } from "@/lib/ai/gateway";
import { buildGeminiCategoryPromptV3 } from "@/lib/enrichment/llm/prompt-builder";
import { groundedLookup } from "@/lib/enrichment/llm/grounded-search";
import {
  ENRICHMENT_LLM_PROVIDER,
  ENRICHMENT_PROVIDER_OPTIONS,
  enrichmentModels,
  enrichmentTimeoutMs,
  isEnrichmentLlmConfigured,
} from "@/lib/enrichment/llm/llm-config";
import { normalizeLlmPayload } from "@/lib/enrichment/llm/normalize-llm-payload";

/**
 * AI Gateway enrichment (unified LLM core, phase 1 of the evidence pipeline).
 * The models in enrichmentModels() run in order. The next model runs when a
 * model errors, times out, or returns a payload that fails validation. The
 * "Gemini" names are historical: only the grounded lookup still calls Gemini.
 */

export type GeminiCategoryInput = {
  finalUrl: string;
  /** null when classification found nothing — the model must then suggest one. */
  category: ItemCategory | null;
  categorySuggestionAllowed?: boolean;
  categorySuggestionReason?: string;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  structured: Record<string, unknown>;
  rawMetadata: RawMetadata;
  /** Readable main-content text (snapshot innerText or stripped fetched HTML). */
  pageText: string | null;
  /** Phase 2: when true, run a grounded Google-Search lookup before structuring. */
  groundingRecommended?: boolean;
};

export type GeminiCategoryResult =
  | {
      status: "enhanced";
      enhancement: LlmCategoryEnhancement;
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

export function buildGeminiResponseJsonSchema(
  categorySuggestionAllowed: boolean,
  category: ItemCategory | null,
) {
  const properties: Record<string, unknown> = {
    title: { type: "string" },
    subtitle: { type: "string" },
    description: { type: "string" },
    image_url: { type: "string" },
    structured: buildStructuredJsonSchema(
      categorySuggestionAllowed || category === null ? undefined : category,
    ),
    field_sources: {
      type: "object",
      additionalProperties: { type: "string", enum: [...FIELD_SOURCE_VALUES] },
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    sources: { type: "array", items: { type: "string" }, minItems: 1 },
    notes: { type: "string" },
  };

  const required = ["confidence", "sources"];

  if (categorySuggestionAllowed || category === null) {
    properties.category_suggestion = { type: "string", enum: itemCategoryValues };
    properties.category_confidence = { type: "number", minimum: 0, maximum: 1 };
  }
  if (category === null) {
    required.push("category_suggestion", "category_confidence");
  }

  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

export function normalizeGeminiPayload(
  category: ItemCategory | null,
  payload: unknown,
): GeminiCategoryResult {
  const validation = validateLlmCategoryEnhancement(category, normalizeLlmPayload(payload));
  if (!validation.ok) return { status: "failed", reason: validation.reason };
  return {
    status: "enhanced",
    enhancement: validation.value,
    providerMetadata: { provider: ENRICHMENT_LLM_PROVIDER, status: "enhanced" },
  };
}

export async function enhanceCategoryWithGemini(
  input: GeminiCategoryInput,
): Promise<GeminiCategoryResult> {
  if (!isEnrichmentLlmConfigured()) return { status: "skipped", reason: "missing_api_key" };

  let effectivePageText = input.pageText;
  let groundedUsed = false;
  if (input.groundingRecommended) {
    const grounded = await groundedLookup({ finalUrl: input.finalUrl, title: input.title });
    if (grounded) {
      groundedUsed = true;
      effectivePageText = effectivePageText
        ? `Search findings (treat as grounded_search evidence): ${grounded}\n\n${effectivePageText}`
        : `Search findings (treat as grounded_search evidence): ${grounded}`;
    }
  }

  const prompt = buildGeminiCategoryPromptV3({ ...input, pageText: effectivePageText });
  const schema = buildGeminiResponseJsonSchema(
    input.categorySuggestionAllowed === true,
    input.category,
  );

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
        label: "enrich",
      });
      const normalized = normalizeGeminiPayload(input.category, data);
      if (normalized.status === "enhanced") {
        return {
          ...normalized,
          providerMetadata: { ...normalized.providerMetadata, model, grounded: groundedUsed },
        };
      }
      if (normalized.status === "failed") lastReason = normalized.reason;
    } catch (error) {
      lastReason = error instanceof Error ? error.message : "llm_failed";
    }
  }

  return { status: "failed", reason: lastReason };
}
