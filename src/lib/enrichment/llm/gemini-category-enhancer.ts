import "server-only";

import { generateJsonWithFallback } from "@/lib/ai/gateway";
import { isGatewayConfigured, parseModelList } from "@/lib/ai/gateway-config";
import type { ItemCategory } from "@/lib/database.types";
import type { RawMetadata } from "@/lib/enrichment/extract";
import {
  type LlmCategoryEnhancement,
  validateLlmCategoryEnhancement,
} from "@/lib/enrichment/llm/category-schemas";

/**
 * Ordered AI Gateway model fallback for category enrichment.
 *
 * A 4-book A/B benchmark showed gpt-5-nano returning near-empty output for this
 * task (only the required confidence/sources keys, omitting title/description/
 * structured) — and because that still passes validation, it silently neutered
 * the enrichment step. Gemini Flash-Lite produces complete, structured output,
 * so it is the primary; gemini-2.5-flash is the fuller-capacity fallback.
 */
const ENRICHMENT_MODELS = parseModelList(process.env.ENRICHMENT_MODELS, [
  "google/gemini-2.5-flash-lite",
  "google/gemini-2.5-flash",
]);

/**
 * Provider-specific options forwarded to every enrichment model attempt.
 * Disables Gemini "thinking" so the gemini-2.5-flash fallback stays within the
 * 10s enrichment timeout (with thinking on it spends ~20-40s reasoning).
 * Flash-Lite does not reason, so a zero budget is a no-op for the primary.
 */
const ENRICHMENT_PROVIDER_OPTIONS = {
  google: { thinkingConfig: { thinkingBudget: 0 } },
};

export type GeminiCategoryInput = {
  finalUrl: string;
  category: ItemCategory;
  categorySuggestionAllowed?: boolean;
  categorySuggestionReason?: string;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  structured: Record<string, unknown>;
  rawMetadata: RawMetadata;
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
  "music",
  "videos",
  "apps",
];

export function buildGeminiResponseJsonSchema(categorySuggestionAllowed: boolean) {
  const properties: Record<string, unknown> = {
    title: { type: "string" },
    subtitle: { type: "string" },
    description: { type: "string" },
    image_url: { type: "string" },
    structured: { type: "object" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    sources: { type: "array", items: { type: "string" }, minItems: 1 },
    notes: { type: "string" },
  };

  if (categorySuggestionAllowed) {
    properties.category_suggestion = { type: "string", enum: itemCategoryValues };
    properties.category_confidence = { type: "number", minimum: 0, maximum: 1 };
  }

  return {
    type: "object",
    properties,
    required: ["confidence", "sources"],
    additionalProperties: false,
  };
}

export function buildGeminiCategoryPrompt(input: GeminiCategoryInput): string {
  return [
    "You are normalizing metadata for a private visual bookmark library called Theque.",
    `The deterministic category is fixed: ${input.category}.`,
    input.categorySuggestionAllowed
      ? `Category suggestion is allowed because: ${input.categorySuggestionReason ?? "weak_evidence"}.`
      : "Do not change or return a different category.",
    "Use only the provided URL and metadata evidence.",
    input.categorySuggestionAllowed
      ? "Return category_suggestion and category_confidence only if evidence supports a better category."
      : "Return only fields allowed for the fixed category.",
    input.categorySuggestionAllowed
      ? "When returning category_suggestion, structured fields must match the suggested category."
      : "",
    input.categorySuggestionAllowed && input.categorySuggestionReason === "blocked_or_sparse_fetch"
      ? "For blocked or sparse pages, still return useful display metadata when it is evident from the URL; restaurant URLs can use a clear venue name as title and structured.place_name."
      : "",
    "Omit fields when evidence is insufficient. Do not invent prices, ratings, authors, years, or addresses.",
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
    "",
    "Respond with ONLY a JSON object. Required keys: confidence (number 0-1), sources (array of strings).",
    "Optional keys (omit when evidence is insufficient): title, subtitle, description, image_url, structured (object), notes."
      + (input.categorySuggestionAllowed
        ? " category_suggestion (one of the allowed categories), category_confidence (number 0-1)."
        : ""),
  ].join("\n");
}

export function normalizeGeminiPayload(category: ItemCategory, payload: unknown): GeminiCategoryResult {
  const validation = validateLlmCategoryEnhancement(category, payload);
  if (!validation.ok) return { status: "failed", reason: validation.reason };
  return {
    status: "enhanced",
    enhancement: validation.value,
    providerMetadata: {
      provider: "gateway",
      status: "enhanced",
    },
  };
}

/**
 * Normalize/augment item metadata via the Vercel AI Gateway (with model
 * fallback). Named `…Gemini` for historical reasons; it is now provider-neutral.
 */
export async function enhanceCategoryWithGemini(input: GeminiCategoryInput): Promise<GeminiCategoryResult> {
  if (!isGatewayConfigured()) return { status: "skipped", reason: "gateway_not_configured" };

  const timeoutMs = Number.parseInt(process.env.ENRICHMENT_TIMEOUT_MS ?? "10000", 10);
  const prompt = buildGeminiCategoryPrompt(input);

  let result;
  try {
    result = await generateJsonWithFallback({
      models: ENRICHMENT_MODELS,
      prompt,
      temperature: 0.1,
      timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 10000,
      providerOptions: ENRICHMENT_PROVIDER_OPTIONS,
      label: "enrich",
    });
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "llm_failed",
    };
  }

  const normalized = normalizeGeminiPayload(input.category, result.data);
  if (normalized.status !== "enhanced") return normalized;

  return {
    ...normalized,
    providerMetadata: {
      ...normalized.providerMetadata,
      model: result.model,
    },
  };
}
