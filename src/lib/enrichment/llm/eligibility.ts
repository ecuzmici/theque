import type { CategorySource, ItemCategory } from "@/lib/database.types";
import { isWeakTitle } from "@/lib/enrichment/meta-utils";
import { hasCanonicalIdInUrl } from "@/lib/enrichment/url-identity";

export type LlmEligibilityInput = {
  enabled: boolean;
  hasApiKey: boolean;
  fetchBlocked: boolean;
  fetchSparse?: boolean;
  category: ItemCategory | null;
  categorySource?: CategorySource;
  title: string | null;
  description: string | null;
  image_url?: string | null;
  structured: Record<string, unknown>;
  /** Phase 2: grounding opt-in flag and the URL used for identity detection. */
  groundingEnabled?: boolean;
  canonicalUrl?: string;
};

type CategorySuggestionDecision =
  | {
      categorySuggestionAllowed: true;
      categorySuggestionReason: "blocked_or_sparse_fetch" | "manual_no_useful_metadata" | "uncategorized";
    }
  | {
      categorySuggestionAllowed: false;
      categorySuggestionReason: "disabled" | "missing_api_key" | "manual_metadata_useful" | "deterministic_data_sufficient";
    };

export type LlmEligibility =
  | ({ eligible: true; reason: "sparse_category_fields" | "blocked_or_sparse_fetch" | "weak_title_or_description" | "uncategorized"; groundingRecommended: boolean } & CategorySuggestionDecision)
  | ({ eligible: false; reason: "disabled" | "missing_api_key" | "deterministic_data_sufficient"; groundingRecommended: false } & CategorySuggestionDecision);

const importantFieldsByCategory: Record<ItemCategory, string[]> = {
  books: ["authors", "published_year"],
  movies_and_tv: ["year", "directors"],
  restaurants: ["place_name", "cuisine", "address"],
  products: ["brand", "price"],
  travel: ["destination", "lodging_name"],
  recipes: ["author", "ingredients"],
  articles: ["author", "publisher", "published_at"],
  music: ["artist", "album"],
  videos: ["channel"],
  apps: ["developer"],
};

function hasUsefulValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

function hasUsefulMetadata(input: LlmEligibilityInput): boolean {
  return (
    !isWeakTitle(input.title) ||
    Boolean(input.description?.trim()) ||
    Boolean(input.image_url?.trim()) ||
    Object.values(input.structured).some(hasUsefulValue)
  );
}

function decideCategorySuggestion(input: LlmEligibilityInput): CategorySuggestionDecision {
  if (!input.enabled) {
    return { categorySuggestionAllowed: false, categorySuggestionReason: "disabled" };
  }
  if (!input.hasApiKey) {
    return { categorySuggestionAllowed: false, categorySuggestionReason: "missing_api_key" };
  }

  if (input.category === null) {
    return { categorySuggestionAllowed: true, categorySuggestionReason: "uncategorized" };
  }

  const blockedOrSparse = input.fetchBlocked || input.fetchSparse === true;
  if (input.categorySource === "manual") {
    if (blockedOrSparse && !hasUsefulMetadata(input)) {
      return { categorySuggestionAllowed: true, categorySuggestionReason: "manual_no_useful_metadata" };
    }
    return { categorySuggestionAllowed: false, categorySuggestionReason: "manual_metadata_useful" };
  }

  if (blockedOrSparse) {
    return { categorySuggestionAllowed: true, categorySuggestionReason: "blocked_or_sparse_fetch" };
  }

  return { categorySuggestionAllowed: false, categorySuggestionReason: "deterministic_data_sufficient" };
}

function decideGrounding(input: LlmEligibilityInput, eligible: boolean, reason: string): boolean {
  if (!eligible) return false;
  if (input.groundingEnabled !== true) return false;
  // Grounding helps blocked/sparse/uncategorized cases that aren't already
  // pinned to a known entity by their URL.
  const groundableReason =
    reason === "blocked_or_sparse_fetch" || reason === "uncategorized" || reason === "sparse_category_fields";
  if (!groundableReason) return false;
  if (input.canonicalUrl && hasCanonicalIdInUrl(input.canonicalUrl)) return false;
  return true;
}

export function decideLlmEligibility(input: LlmEligibilityInput): LlmEligibility {
  const categorySuggestion = decideCategorySuggestion(input);

  if (!input.enabled) return { eligible: false, reason: "disabled", groundingRecommended: false, ...categorySuggestion };
  if (!input.hasApiKey) return { eligible: false, reason: "missing_api_key", groundingRecommended: false, ...categorySuggestion };
  if (input.category === null) {
    return { eligible: true, reason: "uncategorized", groundingRecommended: decideGrounding(input, true, "uncategorized"), ...categorySuggestion };
  }
  if (input.fetchBlocked || input.fetchSparse === true) {
    return { eligible: true, reason: "blocked_or_sparse_fetch", groundingRecommended: decideGrounding(input, true, "blocked_or_sparse_fetch"), ...categorySuggestion };
  }

  const importantFields = importantFieldsByCategory[input.category];
  const usefulFieldCount = importantFields.filter((field) => hasUsefulValue(input.structured[field])).length;
  if (usefulFieldCount < Math.min(2, importantFields.length)) {
    return { eligible: true, reason: "sparse_category_fields", groundingRecommended: decideGrounding(input, true, "sparse_category_fields"), ...categorySuggestion };
  }

  if (isWeakTitle(input.title) || !input.description?.trim() || input.description.trim().length < 30) {
    return { eligible: true, reason: "weak_title_or_description", groundingRecommended: decideGrounding(input, true, "weak_title_or_description"), ...categorySuggestion };
  }

  return { eligible: false, reason: "deterministic_data_sufficient", groundingRecommended: false, ...categorySuggestion };
}

/** Whether an item would still benefit from LLM enrichment (e.g. after a fresh snapshot). */
export function wouldBenefitFromLlmReenrichment(
  input: Pick<LlmEligibilityInput, "category" | "title" | "description" | "structured">,
): boolean {
  return decideLlmEligibility({
    enabled: true,
    hasApiKey: true,
    fetchBlocked: false,
    ...input,
  }).eligible;
}
