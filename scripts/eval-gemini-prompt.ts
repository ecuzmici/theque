import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { GoogleGenAI } from "@google/genai";

import type { ItemCategory } from "../src/lib/database.types";
import type { RawMetadata } from "../src/lib/enrichment/extract";
import {
  type LlmCategoryEnhancement,
  validateLlmCategoryEnhancement,
} from "../src/lib/enrichment/llm/category-schemas";
import { buildGeminiCategoryPromptV2 } from "../src/lib/enrichment/llm/prompt-builder";

const MODEL = "gemini-2.5-flash";
const TEMPERATURE = 0.1;
const TIMEOUT_MS = 30_000;
const DELAY_BETWEEN_CALLS_MS = 1_000;
const EVAL_OUTPUT_DIR = "docs/superpowers/evals/gemini-enrichment-2026-05-16";
const EVAL_OUTPUT_FILE = "ab-results.json";
const EVAL_TIMESTAMP = "2026-05-16T00:00:00.000Z";

const VALID_SOURCE_LABELS = [
  "url",
  "open_graph",
  "twitter",
  "json_ld",
  "title_tag",
  "existing_structured",
] as const;

const evalConfig = {
  model: MODEL,
  temperature: TEMPERATURE,
  timeoutMs: TIMEOUT_MS,
  delayBetweenCallsMs: DELAY_BETWEEN_CALLS_MS,
} as const;

type GeminiCategoryInput = {
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

type ExpectedOutcome = {
  titleShouldBeAbsent?: boolean;
  titleContains?: string;
  categorySuggestion?: ItemCategory;
  noCategorySuggestion?: boolean;
  structuredFieldsPresent?: string[];
  structuredFieldsAbsent?: string[];
  validSourcesOnly?: boolean;
};

type EvalCase = {
  name: string;
  input: GeminiCategoryInput;
  expected: ExpectedOutcome;
};

type ScoreDimensions = {
  valid: 0 | 1;
  no_hallucination: 0 | 1;
  correct_category: 0 | 1;
  good_sources: 0 | 1;
  good_notes: 0 | 1;
};

type ResponseScore = {
  dimensions: ScoreDimensions;
  total: number;
};

type PromptVariant = "old" | "new";

type PromptRunResult =
  | {
      variant: PromptVariant;
      status: "enhanced";
      latencyMs: number;
      rawText: string;
      parsedPayload: unknown;
      validation: { ok: true; reason: null } | { ok: false; reason: string };
      enhancement: LlmCategoryEnhancement | null;
      score: ResponseScore;
    }
  | {
      variant: PromptVariant;
      status: "failed";
      latencyMs: number;
      rawText: string | null;
      parsedPayload: unknown;
      validation: { ok: false; reason: string };
      enhancement: null;
      error: string;
      score: ResponseScore;
    };

type CaseResult = {
  index: number;
  name: string;
  input: GeminiCategoryInput;
  expected: ExpectedOutcome;
  prompts: Record<PromptVariant, string>;
  old: PromptRunResult;
  new: PromptRunResult;
  winner: "old" | "new" | "tie";
};

const itemCategoryValues: ItemCategory[] = [
  "books",
  "movies_and_tv",
  "restaurants",
  "products",
  "gifts",
  "travel",
  "recipes",
  "articles",
];

const zeroScore: ResponseScore = {
  dimensions: {
    valid: 0,
    no_hallucination: 0,
    correct_category: 0,
    good_sources: 0,
    good_notes: 0,
  },
  total: 0,
};

const fieldEvidenceTokens: Record<string, string[]> = {
  address: ["address", "streetAddress", "addressLocality", "postalAddress"],
  author: ["author", "article:author", "creator"],
  authors: ["author", "authors", "creator"],
  availability: ["availability", "inStock", "outOfStock"],
  average_rating: ["aggregateRating", "ratingValue", "average_rating"],
  brand: ["brand", "manufacturer"],
  cook_time_minutes: ["cookTime", "cook_time", "cook time"],
  cuisine: ["servesCuisine", "cuisine"],
  destination: ["destination", "location", "addressLocality"],
  directors: ["director", "directors"],
  genres: ["genre", "genres"],
  ingredients: ["recipeIngredient", "ingredients"],
  isbn: ["isbn"],
  lodging_name: ["lodging", "hotel", "name"],
  media_type: ["@type", "Movie", "TVSeries", "media_type"],
  page_count: ["numberOfPages", "page_count", "pages"],
  place_name: ["place_name", "name", "restaurant", "place"],
  prep_time_minutes: ["prepTime", "prep_time", "prep time"],
  price: ["price", "priceCurrency", "lowPrice", "highPrice"],
  price_level: ["priceRange", "price_level"],
  published_at: ["published_time", "datePublished", "published_at"],
  published_year: ["datePublished", "published", "published_year"],
  publisher: ["publisher", "site_name", "og:site_name"],
  rating: ["aggregateRating", "ratingValue", "rating"],
  rating_scale: ["bestRating", "worstRating", "rating_scale"],
  ratings_count: ["ratingCount", "reviewCount", "ratings_count"],
  reading_time_minutes: ["reading_time", "reading time"],
  runtime_minutes: ["duration", "runtime", "runtime_minutes"],
  travel_dates: ["check_in", "check_out", "travel_dates"],
  year: ["datePublished", "releaseDate", "year"],
  yield: ["recipeYield", "yield"],
};

function buildGeminiResponseJsonSchema(categorySuggestionAllowed: boolean) {
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

// Inline copy of the pure builder in gemini-category-enhancer.ts.
// Importing that module from this script trips its server-only guard.
function buildGeminiCategoryPrompt(input: GeminiCategoryInput): string {
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
  ].join("\n");
}

function rawMetadata(
  finalUrl: string,
  opts: {
    statusCode?: number;
    openGraph?: Record<string, string>;
    twitter?: Record<string, string>;
    jsonLd?: RawMetadata["json_ld"];
    parser?: string;
  } = {},
): RawMetadata {
  return {
    fetched_at: EVAL_TIMESTAMP,
    final_url: finalUrl,
    status_code: opts.statusCode ?? 200,
    open_graph: opts.openGraph ?? {},
    twitter: opts.twitter ?? {},
    json_ld: opts.jsonLd ?? [],
    parser: opts.parser ?? "generic",
  };
}

const evalCases: EvalCase[] = [
  {
    name: "404 page should not copy error title",
    input: {
      finalUrl: "https://example.com/missing-page",
      category: "articles",
      categorySuggestionAllowed: false,
      title: "404 Not Found",
      subtitle: null,
      description: null,
      image_url: null,
      structured: {},
      rawMetadata: rawMetadata("https://example.com/missing-page", {
        statusCode: 404,
        openGraph: {},
        jsonLd: [],
      }),
    },
    expected: {
      titleShouldBeAbsent: true,
      noCategorySuggestion: true,
      structuredFieldsAbsent: ["author", "publisher", "published_at", "reading_time_minutes"],
      validSourcesOnly: true,
    },
  },
  {
    name: "Blocked restaurant should use URL venue",
    input: {
      finalUrl: "https://www.selva-restaurant.com/en/",
      category: "articles",
      categorySuggestionAllowed: true,
      categorySuggestionReason: "blocked_or_sparse_fetch",
      title: null,
      subtitle: null,
      description: null,
      image_url: null,
      structured: {},
      rawMetadata: rawMetadata("https://www.selva-restaurant.com/en/", {
        statusCode: 403,
      }),
    },
    expected: {
      titleContains: "Selva",
      categorySuggestion: "restaurants",
      structuredFieldsPresent: ["place_name"],
      structuredFieldsAbsent: ["address", "cuisine", "price_level"],
      validSourcesOnly: true,
    },
  },
  {
    name: "Recipe JSON-LD should suggest recipes",
    input: {
      finalUrl: "https://www.cozykitchen.example/lemon-herb-pasta-recipe/",
      category: "articles",
      categorySuggestionAllowed: true,
      categorySuggestionReason: "weak_evidence",
      title: "Lemon Herb Pasta Recipe - A Cozy Kitchen",
      subtitle: null,
      description: "A bright weeknight pasta with lemon, herbs, and parmesan.",
      image_url: "https://www.cozykitchen.example/images/lemon-herb-pasta.jpg",
      structured: {},
      rawMetadata: rawMetadata("https://www.cozykitchen.example/lemon-herb-pasta-recipe/", {
        openGraph: {
          "og:title": "Lemon Herb Pasta Recipe",
          "og:description": "A bright weeknight pasta with lemon, herbs, and parmesan.",
          "og:type": "article",
          "og:site_name": "A Cozy Kitchen",
        },
        jsonLd: [
          {
            "@context": "https://schema.org",
            "@type": "Recipe",
            name: "Lemon Herb Pasta",
            author: { "@type": "Person", name: "Ari Lane" },
            prepTime: "PT15M",
            cookTime: "PT20M",
            recipeYield: "4 servings",
            recipeIngredient: ["spaghetti", "lemon", "parsley", "parmesan"],
          },
        ],
      }),
    },
    expected: {
      titleContains: "Lemon Herb Pasta",
      categorySuggestion: "recipes",
      structuredFieldsPresent: ["author", "prep_time_minutes", "cook_time_minutes", "yield", "ingredients"],
      validSourcesOnly: true,
    },
  },
  {
    name: "Amazon product should not invent ratings",
    input: {
      finalUrl: "https://www.amazon.com/Fellow-Stagg-EKG-Electric-Kettle/dp/B077JBQZPX/",
      category: "products",
      categorySuggestionAllowed: false,
      title: "Amazon.com: Fellow Stagg EKG Electric Kettle",
      subtitle: null,
      description: "Fellow Stagg EKG electric pour-over kettle with variable temperature control.",
      image_url: "https://m.media-amazon.com/images/I/stagg.jpg",
      structured: {},
      rawMetadata: rawMetadata("https://www.amazon.com/Fellow-Stagg-EKG-Electric-Kettle/dp/B077JBQZPX/", {
        parser: "amazon",
        openGraph: {
          "og:title": "Fellow Stagg EKG Electric Kettle",
          "og:description": "Variable temperature pour-over kettle.",
          "og:type": "product",
          "product:price:amount": "165.00",
          "product:price:currency": "USD",
          "product:availability": "in stock",
        },
        jsonLd: [
          {
            "@context": "https://schema.org",
            "@type": "Product",
            name: "Fellow Stagg EKG Electric Kettle",
            brand: { "@type": "Brand", name: "Fellow" },
            offers: {
              "@type": "Offer",
              price: "165.00",
              priceCurrency: "USD",
              availability: "https://schema.org/InStock",
            },
          },
        ],
      }),
    },
    expected: {
      titleContains: "Fellow Stagg",
      noCategorySuggestion: true,
      structuredFieldsPresent: ["brand", "price", "availability"],
      structuredFieldsAbsent: ["average_rating", "ratings_count", "rating", "rating_scale"],
      validSourcesOnly: true,
    },
  },
  {
    name: "IMDb movie should only use metadata fields",
    input: {
      finalUrl: "https://www.imdb.com/title/tt0118694/",
      category: "movies_and_tv",
      categorySuggestionAllowed: false,
      title: "In the Mood for Love (2000) - IMDb",
      subtitle: null,
      description: "Two neighbors form a strong bond after both suspect extramarital activities of their spouses.",
      image_url: "https://m.media-amazon.com/images/M/in-the-mood.jpg",
      structured: {},
      rawMetadata: rawMetadata("https://www.imdb.com/title/tt0118694/", {
        parser: "imdb",
        openGraph: {
          "og:title": "In the Mood for Love (2000)",
          "og:description": "Two neighbors form a strong bond.",
          "og:type": "video.movie",
          "og:image": "https://m.media-amazon.com/images/M/in-the-mood.jpg",
        },
        jsonLd: [
          {
            "@context": "https://schema.org",
            "@type": "Movie",
            name: "In the Mood for Love",
            datePublished: "2000-05-20",
            director: [{ "@type": "Person", name: "Wong Kar-wai" }],
            genre: ["Drama", "Romance"],
            duration: "PT1H38M",
          },
        ],
      }),
    },
    expected: {
      titleContains: "In the Mood for Love",
      noCategorySuggestion: true,
      structuredFieldsPresent: ["year", "directors", "runtime_minutes", "genres"],
      structuredFieldsAbsent: ["rating", "rating_scale"],
      validSourcesOnly: true,
    },
  },
  {
    name: "Goodreads book should extract evidenced fields",
    input: {
      finalUrl: "https://www.goodreads.com/book/show/4671.The_Great_Gatsby",
      category: "books",
      categorySuggestionAllowed: false,
      title: "The Great Gatsby by F. Scott Fitzgerald | Goodreads",
      subtitle: null,
      description: "A portrait of the Jazz Age in all of its decadence and excess.",
      image_url: "https://images-na.ssl-images-amazon.com/gatsby.jpg",
      structured: {},
      rawMetadata: rawMetadata("https://www.goodreads.com/book/show/4671.The_Great_Gatsby", {
        parser: "goodreads",
        openGraph: {
          "og:title": "The Great Gatsby",
          "og:description": "A portrait of the Jazz Age.",
          "og:type": "books.book",
        },
        jsonLd: [
          {
            "@context": "https://schema.org",
            "@type": "Book",
            name: "The Great Gatsby",
            author: [{ "@type": "Person", name: "F. Scott Fitzgerald" }],
            isbn: "9780743273565",
            datePublished: "1925-04-10",
            numberOfPages: 180,
          },
        ],
      }),
    },
    expected: {
      titleContains: "The Great Gatsby",
      noCategorySuggestion: true,
      structuredFieldsPresent: ["authors", "isbn", "published_year", "page_count"],
      structuredFieldsAbsent: ["average_rating", "ratings_count"],
      validSourcesOnly: true,
    },
  },
  {
    name: "AllRecipes about page should stay article",
    input: {
      finalUrl: "https://www.allrecipes.com/about",
      category: "articles",
      categorySuggestionAllowed: true,
      categorySuggestionReason: "weak_evidence",
      title: "About Allrecipes",
      subtitle: null,
      description: "Learn more about Allrecipes, our community, and our editorial guidelines.",
      image_url: null,
      structured: {},
      rawMetadata: rawMetadata("https://www.allrecipes.com/about", {
        openGraph: {
          "og:title": "About Allrecipes",
          "og:description": "Learn more about Allrecipes, our community, and our editorial guidelines.",
          "og:type": "website",
          "og:site_name": "Allrecipes",
        },
        jsonLd: [
          {
            "@context": "https://schema.org",
            "@type": "AboutPage",
            name: "About Allrecipes",
            publisher: { "@type": "Organization", name: "Allrecipes" },
          },
        ],
      }),
    },
    expected: {
      titleContains: "About",
      noCategorySuggestion: true,
      structuredFieldsPresent: ["publisher"],
      structuredFieldsAbsent: ["ingredients", "prep_time_minutes", "cook_time_minutes", "yield"],
      validSourcesOnly: true,
    },
  },
  {
    name: "Generic blog article should use OG article data",
    input: {
      finalUrl: "https://examplemagazine.com/design/how-quiet-interfaces-age-well",
      category: "articles",
      categorySuggestionAllowed: false,
      title: "How Quiet Interfaces Age Well",
      subtitle: null,
      description: "An essay about calm interface patterns and visual systems.",
      image_url: "https://examplemagazine.com/images/quiet-interfaces.jpg",
      structured: {},
      rawMetadata: rawMetadata("https://examplemagazine.com/design/how-quiet-interfaces-age-well", {
        openGraph: {
          "og:title": "How Quiet Interfaces Age Well",
          "og:description": "An essay about calm interface patterns and visual systems.",
          "og:type": "article",
          "og:site_name": "Example Magazine",
          "article:author": "Mina Kline",
          "article:published_time": "2026-04-12T10:00:00.000Z",
        },
      }),
    },
    expected: {
      titleContains: "Quiet Interfaces",
      noCategorySuggestion: true,
      structuredFieldsPresent: ["author", "published_at", "publisher"],
      validSourcesOnly: true,
    },
  },
  {
    name: "Airbnb listing should extract destination",
    input: {
      finalUrl:
        "https://www.airbnb.com/rooms/12345678?location=Copenhagen%2C%20Denmark&check_in=2026-06-10&check_out=2026-06-14",
      category: "travel",
      categorySuggestionAllowed: true,
      categorySuggestionReason: "blocked_or_sparse_fetch",
      title: null,
      subtitle: null,
      description: null,
      image_url: null,
      structured: {},
      rawMetadata: rawMetadata(
        "https://www.airbnb.com/rooms/12345678?location=Copenhagen%2C%20Denmark&check_in=2026-06-10&check_out=2026-06-14",
        {
          statusCode: 403,
        },
      ),
    },
    expected: {
      titleContains: "Copenhagen",
      noCategorySuggestion: true,
      structuredFieldsPresent: ["destination"],
      structuredFieldsAbsent: ["lodging_name"],
      validSourcesOnly: true,
    },
  },
  {
    name: "Google Maps restaurant should suggest restaurants",
    input: {
      finalUrl: "https://www.google.com/maps/place/Cafe+De+Jaren/@52.3676,4.8931,17z/",
      category: "articles",
      categorySuggestionAllowed: true,
      categorySuggestionReason: "blocked_or_sparse_fetch",
      title: null,
      subtitle: null,
      description: null,
      image_url: null,
      structured: {},
      rawMetadata: rawMetadata("https://www.google.com/maps/place/Cafe+De+Jaren/@52.3676,4.8931,17z/", {
        statusCode: 403,
      }),
    },
    expected: {
      titleContains: "Cafe De Jaren",
      categorySuggestion: "restaurants",
      structuredFieldsPresent: ["place_name"],
      structuredFieldsAbsent: ["address", "cuisine", "price_level"],
      validSourcesOnly: true,
    },
  },
];

function parseEnvValue(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === "\"" || quote === "'") && trimmed.endsWith(quote)) {
    return trimmed
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t");
  }
  return trimmed;
}

function loadEnvLocal(): void {
  let contents: string;
  try {
    contents = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  } catch {
    return;
  }

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = normalized.slice(0, separatorIndex).trim();
    const value = parseEnvValue(normalized.slice(separatorIndex + 1));
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function responseLike(parsed: unknown): Partial<LlmCategoryEnhancement> | null {
  return isRecord(parsed) ? (parsed as Partial<LlmCategoryEnhancement>) : null;
}

function sourcesAreValid(value: unknown): boolean {
  const allowed = new Set<string>(VALID_SOURCE_LABELS);
  return Array.isArray(value) && value.length > 0 && value.every((source) => allowed.has(source));
}

function structuredFieldIsEvidenced(input: GeminiCategoryInput, field: string): boolean {
  if (Object.prototype.hasOwnProperty.call(input.structured, field)) return true;

  const tokens = fieldEvidenceTokens[field] ?? [field];
  const haystack = JSON.stringify({
    url: input.finalUrl,
    title: input.title,
    subtitle: input.subtitle,
    description: input.description,
    image_url: input.image_url,
    structured: input.structured,
    rawMetadata: input.rawMetadata,
  }).toLowerCase();

  return tokens.some((token) => haystack.includes(token.toLowerCase()));
}

function titleMatchesExpected(
  expected: ExpectedOutcome,
  candidate: Partial<LlmCategoryEnhancement>,
): boolean {
  if (expected.titleShouldBeAbsent && typeof candidate.title === "string" && candidate.title.trim()) {
    return false;
  }

  if (expected.titleContains) {
    const title = typeof candidate.title === "string" ? candidate.title.toLowerCase() : "";
    if (!title.includes(expected.titleContains.toLowerCase())) return false;
  }

  return true;
}

function structuredMatchesExpected(
  input: GeminiCategoryInput,
  expected: ExpectedOutcome,
  candidate: Partial<LlmCategoryEnhancement>,
): boolean {
  const structured = isRecord(candidate.structured) ? candidate.structured : {};
  const expectedPresent = new Set(expected.structuredFieldsPresent ?? []);

  for (const field of expectedPresent) {
    if (!Object.prototype.hasOwnProperty.call(structured, field)) return false;
  }

  for (const field of expected.structuredFieldsAbsent ?? []) {
    if (Object.prototype.hasOwnProperty.call(structured, field)) return false;
  }

  for (const field of Object.keys(structured)) {
    if (!expectedPresent.has(field) && !structuredFieldIsEvidenced(input, field)) {
      return false;
    }
  }

  return true;
}

function categoryMatchesExpected(
  expected: ExpectedOutcome,
  candidate: Partial<LlmCategoryEnhancement>,
): boolean {
  if (expected.categorySuggestion) return candidate.category_suggestion === expected.categorySuggestion;
  if (expected.noCategorySuggestion) return candidate.category_suggestion === undefined;
  return true;
}

function notesAreUseful(
  expected: ExpectedOutcome,
  candidate: Partial<LlmCategoryEnhancement>,
): boolean {
  if (typeof candidate.notes !== "string" || candidate.notes.trim().length <= 20) return false;

  const structuredFields = isRecord(candidate.structured) ? Object.keys(candidate.structured) : [];
  const fieldNames = [
    "title",
    "subtitle",
    "description",
    "image_url",
    "structured",
    "category_suggestion",
    ...(expected.structuredFieldsPresent ?? []),
    ...(expected.structuredFieldsAbsent ?? []),
    ...structuredFields,
  ];
  const notes = candidate.notes.toLowerCase();
  return [...new Set(fieldNames)].some((field) => notes.includes(field.toLowerCase()));
}

function scoreResponse(
  input: GeminiCategoryInput,
  expected: ExpectedOutcome,
  parsed: unknown,
  validationOk: boolean,
): ResponseScore {
  const candidate = responseLike(parsed);
  if (!candidate) return zeroScore;

  const dimensions: ScoreDimensions = {
    valid: validationOk ? 1 : 0,
    no_hallucination:
      titleMatchesExpected(expected, candidate) &&
      structuredMatchesExpected(input, expected, candidate)
        ? 1
        : 0,
    correct_category: categoryMatchesExpected(expected, candidate) ? 1 : 0,
    good_sources: sourcesAreValid(candidate.sources) ? 1 : 0,
    good_notes: notesAreUseful(expected, candidate) ? 1 : 0,
  };

  return {
    dimensions,
    total: Object.values(dimensions).reduce((sum, value) => sum + value, 0),
  };
}

async function runPrompt(
  ai: GoogleGenAI,
  variant: PromptVariant,
  input: GeminiCategoryInput,
  expected: ExpectedOutcome,
  prompt: string,
): Promise<PromptRunResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();
  let rawText: string | null = null;

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        abortSignal: controller.signal,
        temperature: TEMPERATURE,
        responseMimeType: "application/json",
        responseJsonSchema: buildGeminiResponseJsonSchema(input.categorySuggestionAllowed === true),
      },
    });

    rawText = response.text ?? "";
    if (!rawText.trim()) throw new Error("empty_response_text");

    const parsedPayload: unknown = JSON.parse(rawText);
    const validation = validateLlmCategoryEnhancement(input.category, parsedPayload);
    const score = scoreResponse(input, expected, parsedPayload, validation.ok);

    return {
      variant,
      status: "enhanced",
      latencyMs: Date.now() - startedAt,
      rawText,
      parsedPayload,
      validation: validation.ok
        ? { ok: true, reason: null }
        : { ok: false, reason: validation.reason },
      enhancement: validation.ok ? validation.value : null,
      score,
    };
  } catch (error) {
    return {
      variant,
      status: "failed",
      latencyMs: Date.now() - startedAt,
      rawText,
      parsedPayload: null,
      validation: { ok: false, reason: "call_failed" },
      enhancement: null,
      error: error instanceof Error ? error.message : "gemini_call_failed",
      score: zeroScore,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function winnerFor(oldScore: number, newScore: number): CaseResult["winner"] {
  if (oldScore > newScore) return "old";
  if (newScore > oldScore) return "new";
  return "tie";
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function displayCategory(result: PromptRunResult): string {
  const candidate = responseLike(result.parsedPayload);
  return typeof candidate?.category_suggestion === "string" ? candidate.category_suggestion : "-";
}

function displayValid(result: PromptRunResult): string {
  return result.validation.ok ? "yes" : "no";
}

function printMarkdownResults(results: CaseResult[]): void {
  console.log("| # | Case | Old Score | New Score | Old Valid | New Valid | Old Cat | New Cat | Winner |");
  console.log("| - | ---- | --------- | --------- | --------- | --------- | ------- | ------- | ------ |");

  for (const result of results) {
    const cells = [
      result.index,
      escapeMarkdownCell(result.name),
      result.old.score.total,
      result.new.score.total,
      displayValid(result.old),
      displayValid(result.new),
      displayCategory(result.old),
      displayCategory(result.new),
      result.winner,
    ];
    console.log(`| ${cells.join(" | ")} |`);
  }

  const totalOldScore = results.reduce((sum, result) => sum + result.old.score.total, 0);
  const totalNewScore = results.reduce((sum, result) => sum + result.new.score.total, 0);
  const oldWins = results.filter((result) => result.winner === "old").length;
  const newWins = results.filter((result) => result.winner === "new").length;
  const ties = results.filter((result) => result.winner === "tie").length;

  console.log("");
  console.log("## Summary");
  console.log(`Old total score: ${totalOldScore}`);
  console.log(`New total score: ${totalNewScore}`);
  console.log(`Wins: old=${oldWins}, new=${newWins}, ties=${ties}`);
}

async function saveResults(results: CaseResult[]): Promise<void> {
  const outputDir = path.join(process.cwd(), EVAL_OUTPUT_DIR);
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, EVAL_OUTPUT_FILE),
    `${JSON.stringify(
      {
        model: MODEL,
        temperature: TEMPERATURE,
        timeoutMs: TIMEOUT_MS,
        delayBetweenCallsMs: DELAY_BETWEEN_CALLS_MS,
        validSourceLabels: VALID_SOURCE_LABELS,
        generatedAt: new Date().toISOString(),
        results,
      },
      null,
      2,
    )}\n`,
  );
}

async function runEval(): Promise<void> {
  loadEnvLocal();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required in .env.local or the current environment");

  const ai = new GoogleGenAI({ apiKey });
  const results: CaseResult[] = [];

  for (const [index, evalCase] of evalCases.entries()) {
    const oldPrompt = buildGeminiCategoryPrompt(evalCase.input);
    const newPrompt = buildGeminiCategoryPromptV2(evalCase.input);

    console.error(`Running case ${index + 1}/${evalCases.length}: ${evalCase.name} (old)`);
    const oldResult = await runPrompt(ai, "old", evalCase.input, evalCase.expected, oldPrompt);
    await delay(DELAY_BETWEEN_CALLS_MS);

    console.error(`Running case ${index + 1}/${evalCases.length}: ${evalCase.name} (new)`);
    const newResult = await runPrompt(ai, "new", evalCase.input, evalCase.expected, newPrompt);
    if (index < evalCases.length - 1) await delay(DELAY_BETWEEN_CALLS_MS);

    results.push({
      index: index + 1,
      name: evalCase.name,
      input: evalCase.input,
      expected: evalCase.expected,
      prompts: {
        old: oldPrompt,
        new: newPrompt,
      },
      old: oldResult,
      new: newResult,
      winner: winnerFor(oldResult.score.total, newResult.score.total),
    });
  }

  printMarkdownResults(results);
  await saveResults(results);
}

function printDryRun(): void {
  const cases = evalCases.map((evalCase, index) => ({
    index: index + 1,
    name: evalCase.name,
    oldPromptChars: buildGeminiCategoryPrompt(evalCase.input).length,
    newPromptChars: buildGeminiCategoryPromptV2(evalCase.input).length,
  }));
  console.log(JSON.stringify({ model: MODEL, cases }, null, 2));
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  if (!entrypoint) return false;
  return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(entrypoint);
}

if (isMainModule()) {
  if (process.argv.includes("--dry-run")) {
    printDryRun();
  } else {
    runEval().catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
  }
}

export {
  buildGeminiCategoryPrompt,
  buildGeminiResponseJsonSchema,
  evalConfig,
  evalCases,
  scoreResponse,
};
