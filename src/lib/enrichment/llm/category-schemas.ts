import type { ItemCategory } from "@/lib/database.types";

export type LlmCategoryEnhancement = {
  category_suggestion?: ItemCategory;
  category_confidence?: number;
  title?: string;
  subtitle?: string;
  description?: string;
  image_url?: string;
  structured?: Record<string, unknown>;
  confidence: number;
  sources: string[];
  notes?: string;
};

export type LlmItemRewriteProposal = {
  category: ItemCategory;
  category_confidence: number;
  title?: string;
  subtitle?: string;
  description?: string;
  image_url?: string;
  structured?: Record<string, unknown>;
  confidence: number;
  sources: string[];
  notes?: string;
};

export type LlmValidationResult =
  | { ok: true; value: LlmCategoryEnhancement }
  | { ok: false; reason: string };

export type LlmItemRewriteValidationResult =
  | { ok: true; value: LlmItemRewriteProposal }
  | { ok: false; reason: string };

const allowedStructuredFields: Record<ItemCategory, Set<string>> = {
  books: new Set(["authors", "isbn", "published_year", "page_count", "average_rating", "ratings_count"]),
  movies_and_tv: new Set(["year", "directors", "runtime_minutes", "genres", "media_type", "rating", "rating_scale"]),
  restaurants: new Set(["cuisine", "price_level", "address", "place_name"]),
  products: new Set(["brand", "price", "availability"]),
  gifts: new Set(["recipient_hint", "occasion", "price"]),
  travel: new Set(["destination", "travel_dates", "lodging_name"]),
  recipes: new Set(["author", "prep_time_minutes", "cook_time_minutes", "yield", "ingredients"]),
  articles: new Set(["author", "published_at", "reading_time_minutes", "publisher"]),
};

const allowedCategories = new Set<ItemCategory>([
  "books",
  "movies_and_tv",
  "restaurants",
  "products",
  "gifts",
  "travel",
  "recipes",
  "articles",
]);

type FieldValidator = (value: unknown) => boolean;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === "string" && entry.trim().length > 0);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isYear(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1000 && value <= 3000;
}

function isPrice(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isFiniteNumber(value.amount) && isNonEmptyString(value.currency);
}

const fieldValidators: Record<ItemCategory, Record<string, FieldValidator>> = {
  books: {
    authors: isNonEmptyStringArray,
    isbn: isNonEmptyString,
    published_year: isYear,
    page_count: isPositiveInteger,
    average_rating: isFiniteNumber,
    ratings_count: (value) => typeof value === "number" && Number.isInteger(value) && value >= 0,
  },
  movies_and_tv: {
    year: isYear,
    directors: isNonEmptyStringArray,
    runtime_minutes: isPositiveInteger,
    genres: isNonEmptyStringArray,
    media_type: isNonEmptyString,
    rating: isFiniteNumber,
    rating_scale: isFiniteNumber,
  },
  restaurants: {
    cuisine: isNonEmptyString,
    price_level: isNonEmptyString,
    address: isNonEmptyString,
    place_name: isNonEmptyString,
  },
  products: {
    brand: isNonEmptyString,
    price: isPrice,
    availability: isNonEmptyString,
  },
  gifts: {
    recipient_hint: isNonEmptyString,
    occasion: isNonEmptyString,
    price: isPrice,
  },
  travel: {
    destination: isNonEmptyString,
    travel_dates: (value) => value === null || isNonEmptyString(value),
    lodging_name: isNonEmptyString,
  },
  recipes: {
    author: isNonEmptyString,
    prep_time_minutes: isPositiveInteger,
    cook_time_minutes: isPositiveInteger,
    yield: isNonEmptyString,
    ingredients: isNonEmptyStringArray,
  },
  articles: {
    author: isNonEmptyString,
    published_at: isNonEmptyString,
    reading_time_minutes: isPositiveInteger,
    publisher: isNonEmptyString,
  },
};

export function validateLlmCategoryEnhancement(category: ItemCategory, value: unknown): LlmValidationResult {
  if (!isRecord(value)) return { ok: false, reason: "output_not_object" };

  const confidence = value.confidence;
  if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
    return { ok: false, reason: "invalid_confidence" };
  }

  if (!isNonEmptyStringArray(value.sources)) {
    return { ok: false, reason: "invalid_sources" };
  }

  const categorySuggestion = value.category_suggestion;
  if (categorySuggestion !== undefined) {
    if (typeof categorySuggestion !== "string" || !allowedCategories.has(categorySuggestion as ItemCategory)) {
      return { ok: false, reason: "invalid_category_suggestion" };
    }
  }

  const categoryConfidence = value.category_confidence;
  if (categoryConfidence !== undefined) {
    if (typeof categoryConfidence !== "number" || categoryConfidence < 0 || categoryConfidence > 1) {
      return { ok: false, reason: "invalid_category_confidence" };
    }
  }

  for (const key of ["title", "subtitle", "description", "image_url", "notes"]) {
    const field = value[key];
    if (field !== undefined && typeof field !== "string") {
      return { ok: false, reason: `invalid_${key}` };
    }
  }

  const structured = value.structured;
  if (structured !== undefined) {
    if (!isRecord(structured)) return { ok: false, reason: "invalid_structured" };
    const structuredCategory = allowedCategories.has(categorySuggestion as ItemCategory)
      ? (categorySuggestion as ItemCategory)
      : category;
    const allowed = allowedStructuredFields[structuredCategory];
    const validators = fieldValidators[structuredCategory];
    for (const [key, fieldValue] of Object.entries(structured)) {
      if (!allowed.has(key)) return { ok: false, reason: `unknown_structured_field:${key}` };
      if (!validators[key]?.(fieldValue)) return { ok: false, reason: `invalid_structured_field:${key}` };
    }
  }

  return {
    ok: true,
    value: {
      category_suggestion: allowedCategories.has(categorySuggestion as ItemCategory)
        ? (categorySuggestion as ItemCategory)
        : undefined,
      category_confidence: typeof categoryConfidence === "number" ? categoryConfidence : undefined,
      title: typeof value.title === "string" ? value.title : undefined,
      subtitle: typeof value.subtitle === "string" ? value.subtitle : undefined,
      description: typeof value.description === "string" ? value.description : undefined,
      image_url: typeof value.image_url === "string" ? value.image_url : undefined,
      structured: isRecord(structured) ? structured : undefined,
      confidence,
      sources: value.sources,
      notes: typeof value.notes === "string" ? value.notes : undefined,
    },
  };
}

export function validateLlmItemRewriteProposal(value: unknown): LlmItemRewriteValidationResult {
  if (!isRecord(value)) return { ok: false, reason: "output_not_object" };

  const category = value.category;
  if (typeof category !== "string" || !allowedCategories.has(category as ItemCategory)) {
    return { ok: false, reason: "invalid_category" };
  }

  const categoryConfidence = value.category_confidence;
  if (typeof categoryConfidence !== "number" || categoryConfidence < 0 || categoryConfidence > 1) {
    return { ok: false, reason: "invalid_category_confidence" };
  }

  const confidence = value.confidence;
  if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
    return { ok: false, reason: "invalid_confidence" };
  }

  if (!isNonEmptyStringArray(value.sources)) {
    return { ok: false, reason: "invalid_sources" };
  }

  for (const key of ["title", "subtitle", "description", "image_url", "notes"]) {
    const field = value[key];
    if (field !== undefined && typeof field !== "string") {
      return { ok: false, reason: `invalid_${key}` };
    }
  }

  const structured = value.structured;
  if (structured !== undefined) {
    if (!isRecord(structured)) return { ok: false, reason: "invalid_structured" };
    const allowed = allowedStructuredFields[category as ItemCategory];
    const validators = fieldValidators[category as ItemCategory];
    for (const [key, fieldValue] of Object.entries(structured)) {
      if (!allowed.has(key)) return { ok: false, reason: `unknown_structured_field:${key}` };
      if (!validators[key]?.(fieldValue)) return { ok: false, reason: `invalid_structured_field:${key}` };
    }
  }

  return {
    ok: true,
    value: {
      category: category as ItemCategory,
      category_confidence: categoryConfidence,
      title: typeof value.title === "string" ? value.title : undefined,
      subtitle: typeof value.subtitle === "string" ? value.subtitle : undefined,
      description: typeof value.description === "string" ? value.description : undefined,
      image_url: typeof value.image_url === "string" ? value.image_url : undefined,
      structured: isRecord(structured) ? structured : undefined,
      confidence,
      sources: value.sources,
      notes: typeof value.notes === "string" ? value.notes : undefined,
    },
  };
}
