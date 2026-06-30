import type { ItemCategory } from "@/lib/database.types";

export const FIELD_SOURCE_VALUES = ["page", "model_knowledge", "grounded_search"] as const;
export type FieldSource = (typeof FIELD_SOURCE_VALUES)[number];

export type LlmCategoryEnhancement = {
  category_suggestion?: ItemCategory;
  category_confidence?: number;
  title?: string;
  subtitle?: string;
  description?: string;
  image_url?: string;
  structured?: Record<string, unknown>;
  /** Per-structured-field provenance, e.g. { authors: "model_knowledge" }. */
  field_sources?: Record<string, FieldSource>;
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
  travel: new Set(["destination", "travel_dates", "lodging_name"]),
  recipes: new Set(["author", "prep_time_minutes", "cook_time_minutes", "yield", "ingredients"]),
  articles: new Set(["author", "published_at", "reading_time_minutes", "publisher"]),
};

type JsonSchemaFragment = Record<string, unknown>;

const stringSchema: JsonSchemaFragment = { type: "string" };
const integerSchema: JsonSchemaFragment = { type: "integer" };
const numberSchema: JsonSchemaFragment = { type: "number" };
const stringArraySchema: JsonSchemaFragment = { type: "array", items: { type: "string" } };
const priceSchema: JsonSchemaFragment = {
  type: "object",
  properties: { amount: { type: "number" }, currency: { type: "string" } },
};

/**
 * JSON-schema fragments for each structured field, mirroring `fieldValidators`.
 * These are fed to the model so it knows exactly which fields a category
 * supports and what shape they take, instead of guessing (and returning `{}`).
 */
const structuredFieldJsonSchemas: Record<ItemCategory, Record<string, JsonSchemaFragment>> = {
  books: {
    authors: stringArraySchema,
    isbn: stringSchema,
    published_year: integerSchema,
    page_count: integerSchema,
    average_rating: numberSchema,
    ratings_count: integerSchema,
  },
  movies_and_tv: {
    year: integerSchema,
    directors: stringArraySchema,
    runtime_minutes: integerSchema,
    genres: stringArraySchema,
    media_type: stringSchema,
    rating: numberSchema,
    rating_scale: numberSchema,
  },
  restaurants: {
    cuisine: stringSchema,
    price_level: stringSchema,
    address: stringSchema,
    place_name: stringSchema,
  },
  products: {
    brand: stringSchema,
    price: priceSchema,
    availability: stringSchema,
  },
  travel: {
    destination: stringSchema,
    travel_dates: stringSchema,
    lodging_name: stringSchema,
  },
  recipes: {
    author: stringSchema,
    prep_time_minutes: integerSchema,
    cook_time_minutes: integerSchema,
    yield: stringSchema,
    ingredients: stringArraySchema,
  },
  articles: {
    author: stringSchema,
    published_at: stringSchema,
    reading_time_minutes: integerSchema,
    publisher: stringSchema,
  },
};

/**
 * Builds the `structured` object schema for a category. When no category is
 * given (e.g. the model may reclassify), the union of every category's fields
 * is offered so the model can populate whichever apply to its chosen category;
 * `validateLlmItemRewriteProposal` still enforces the per-category allowlist.
 */
export function buildStructuredJsonSchema(category?: ItemCategory): JsonSchemaFragment {
  const properties: Record<string, JsonSchemaFragment> = {};
  if (category && structuredFieldJsonSchemas[category]) {
    Object.assign(properties, structuredFieldJsonSchemas[category]);
  } else {
    for (const fields of Object.values(structuredFieldJsonSchemas)) {
      Object.assign(properties, fields);
    }
  }
  return { type: "object", properties, additionalProperties: false };
}

/** Ordered list of structured field names a category supports, for prompting. */
export function structuredFieldNamesForCategory(category: ItemCategory): string[] {
  return Object.keys(structuredFieldJsonSchemas[category] ?? {});
}

const allowedCategories = new Set<ItemCategory>([
  "books",
  "movies_and_tv",
  "restaurants",
  "products",
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

function isOptionalStringOrNull(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
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

const validFieldSources = new Set<string>(FIELD_SOURCE_VALUES);

export function validateLlmCategoryEnhancement(
  category: ItemCategory | null,
  value: unknown,
): LlmValidationResult {
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
    if (!isOptionalStringOrNull(field)) {
      return { ok: false, reason: `invalid_${key}` };
    }
  }

  // A single out-of-schema or malformed field must not throw away an otherwise
  // good enhancement — drop the offending field and keep the valid ones
  // (partial enrichment beats none). The model's structured schema also sets
  // additionalProperties:false so these should be rare in the first place.
  let cleanedStructured: Record<string, unknown> | undefined;
  const structured = value.structured;
  if (structured !== undefined) {
    if (!isRecord(structured)) return { ok: false, reason: "invalid_structured" };
    const structuredCategory = allowedCategories.has(categorySuggestion as ItemCategory)
      ? (categorySuggestion as ItemCategory)
      : category;
    if (structuredCategory === null) {
      // No category to bind the fields to — we cannot validate them at all.
      if (Object.keys(structured).length > 0) {
        return { ok: false, reason: "structured_without_category" };
      }
      cleanedStructured = {};
    } else {
      const allowed = allowedStructuredFields[structuredCategory];
      const validators = fieldValidators[structuredCategory];
      cleanedStructured = {};
      for (const [key, fieldValue] of Object.entries(structured)) {
        if (!allowed.has(key)) continue; // drop unknown field
        if (!validators[key]?.(fieldValue)) continue; // drop invalid value
        cleanedStructured[key] = fieldValue;
      }
    }
  }

  let fieldSources: Record<string, FieldSource> | undefined;
  const rawFieldSources = value.field_sources;
  if (rawFieldSources !== undefined) {
    if (!isRecord(rawFieldSources)) return { ok: false, reason: "invalid_field_sources" };
    fieldSources = {};
    for (const [key, source] of Object.entries(rawFieldSources)) {
      if (typeof source !== "string" || !validFieldSources.has(source)) {
        return { ok: false, reason: "invalid_field_sources" };
      }
      fieldSources[key] = source as FieldSource;
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
      structured: cleanedStructured,
      field_sources: fieldSources,
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
    if (!isOptionalStringOrNull(field)) {
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
