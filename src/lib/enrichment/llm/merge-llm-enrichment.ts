import { isJunkDescription, isWeakTitle } from "@/lib/enrichment/meta-utils";
import type { GeminiCategoryResult } from "@/lib/enrichment/llm/gemini-category-enhancer";
import type { CategorySource, ItemCategory } from "@/lib/database.types";

export type MergeLlmInput = {
  current: {
    title: string | null;
    subtitle: string | null;
    description: string | null;
    image_url: string | null;
    category: ItemCategory | null;
    category_confidence: number;
    category_source: CategorySource;
    structured: Record<string, unknown>;
    rawMetadata: Record<string, unknown>;
  };
  categorySuggestionAllowed?: boolean;
  categorySuggestionReason?: string;
  llmResult: GeminiCategoryResult;
  now: string;
};

export type MergeLlmOutput = MergeLlmInput["current"];

function addLlmMetadata(rawMetadata: Record<string, unknown>, llm: Record<string, unknown>): Record<string, unknown> {
  return {
    ...rawMetadata,
    llm,
  };
}

function isMissingOrSparse(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (value && typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

export function mergeLlmEnrichment(input: MergeLlmInput): MergeLlmOutput {
  const current = input.current;

  if (input.llmResult.status !== "enhanced") {
    return {
      ...current,
      rawMetadata: addLlmMetadata(current.rawMetadata, {
        provider: "gemini",
        status: input.llmResult.status,
        reason: input.llmResult.reason,
        enriched_at: input.now,
      }),
    };
  }

  const enhancement = input.llmResult.enhancement;
  const categorySuggestion = enhancement.category_suggestion;
  const categorySuggestionConfidence = enhancement.category_confidence;
  const shouldApplyCategorySuggestion =
    input.categorySuggestionAllowed === true &&
    categorySuggestion !== undefined &&
    categorySuggestionConfidence !== undefined;
  const structured = { ...current.structured };
  const returnedFields: string[] = [];
  const nextTitle =
    isWeakTitle(current.title) && enhancement.title?.trim() ? enhancement.title.trim() : current.title;

  if (!categorySuggestion || shouldApplyCategorySuggestion) {
    for (const [key, value] of Object.entries(enhancement.structured ?? {})) {
      if (value === undefined || value === null) continue;
      if (isMissingOrSparse(structured[key])) {
        structured[key] = value;
        returnedFields.push(key);
      }
    }
  }

  if (nextTitle !== current.title && nextTitle) {
    returnedFields.unshift("title");
  }

  if (
    shouldApplyCategorySuggestion &&
    categorySuggestion === "restaurants" &&
    nextTitle?.trim() &&
    isMissingOrSparse(structured.place_name)
  ) {
    structured.place_name = nextTitle;
    returnedFields.push("place_name");
  }

  const categorySuggestionMetadata =
    categorySuggestion !== undefined
      ? {
          category: categorySuggestion,
          confidence: categorySuggestionConfidence,
          allowed: input.categorySuggestionAllowed === true,
          applied: shouldApplyCategorySuggestion,
          reason: input.categorySuggestionReason,
        }
      : undefined;

  const fieldSources = enhancement.field_sources;
  const knowledgeOnly =
    fieldSources !== undefined &&
    Object.keys(fieldSources).length > 0 &&
    Object.values(fieldSources).every((source) => source === "model_knowledge");
  const recordedConfidence = knowledgeOnly
    ? Math.min(enhancement.confidence, 0.7)
    : enhancement.confidence;

  return {
    title: nextTitle,
    subtitle: current.subtitle ?? enhancement.subtitle ?? null,
    description:
      isJunkDescription(current.description) && enhancement.description?.trim()
        ? enhancement.description.trim()
        : current.description,
    image_url: current.image_url ?? enhancement.image_url ?? null,
    category: shouldApplyCategorySuggestion ? categorySuggestion : current.category,
    category_confidence: shouldApplyCategorySuggestion
      ? categorySuggestionConfidence
      : current.category_confidence,
    category_source: shouldApplyCategorySuggestion ? "llm" : current.category_source,
    structured,
    rawMetadata: addLlmMetadata(current.rawMetadata, {
      ...input.llmResult.providerMetadata,
      provider: "gemini",
      status: "enhanced",
      confidence: recordedConfidence,
      sources: enhancement.sources,
      field_sources: fieldSources,
      returned_fields: returnedFields,
      category_suggestion: categorySuggestionMetadata,
      enriched_at: input.now,
    }),
  };
}
