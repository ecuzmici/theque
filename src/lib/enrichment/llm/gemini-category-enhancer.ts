import "server-only";

import type { ItemCategory } from "@/lib/database.types";
import type { RawMetadata } from "@/lib/enrichment/extract";
import {
  FIELD_SOURCE_VALUES,
  type LlmCategoryEnhancement,
  buildStructuredJsonSchema,
  validateLlmCategoryEnhancement,
} from "@/lib/enrichment/llm/category-schemas";
import { buildGeminiCategoryPromptV3 } from "@/lib/enrichment/llm/prompt-builder";
import { groundedLookup } from "@/lib/enrichment/llm/grounded-search";

/**
 * Direct Gemini SDK enrichment (unified LLM core, phase 1 of the evidence
 * pipeline). Flash-Lite is primary; gemini-2.5-flash is the fuller-capacity
 * fallback when the primary errors or returns invalid JSON. Thinking is
 * disabled so the fallback stays inside the enrichment timeout.
 */
const DEFAULT_PRIMARY_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_FALLBACK_MODEL = "gemini-2.5-flash";
const DEFAULT_TIMEOUT_MS = 15000;

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

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
  const validation = validateLlmCategoryEnhancement(category, payload);
  if (!validation.ok) return { status: "failed", reason: validation.reason };
  return {
    status: "enhanced",
    enhancement: validation.value,
    providerMetadata: { provider: "gemini", status: "enhanced" },
  };
}

export async function enhanceCategoryWithGemini(
  input: GeminiCategoryInput,
): Promise<GeminiCategoryResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { status: "skipped", reason: "missing_api_key" };

  const timeoutEnv = Number.parseInt(process.env.ENRICHMENT_TIMEOUT_MS ?? "", 10);
  const timeoutMs = Number.isFinite(timeoutEnv) && timeoutEnv > 0 ? timeoutEnv : DEFAULT_TIMEOUT_MS;

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

  const primary = process.env.GEMINI_ENRICHMENT_MODEL || DEFAULT_PRIMARY_MODEL;
  const models = primary === DEFAULT_FALLBACK_MODEL ? [primary] : [primary, DEFAULT_FALLBACK_MODEL];

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });

  let lastReason = "llm_failed";
  for (const model of models) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          abortSignal: controller.signal,
          temperature: 0.1,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
          responseJsonSchema: schema,
        },
      });

      const parsed = typeof response.text === "string" ? JSON.parse(response.text) : null;
      const normalized = normalizeGeminiPayload(input.category, parsed);
      if (normalized.status === "enhanced") {
        return {
          ...normalized,
          providerMetadata: { ...normalized.providerMetadata, model, grounded: groundedUsed },
        };
      }
      if (normalized.status === "failed") lastReason = normalized.reason;
    } catch (error) {
      lastReason = error instanceof Error ? error.message : "llm_failed";
    } finally {
      clearTimeout(timeout);
    }
  }

  return { status: "failed", reason: lastReason };
}
