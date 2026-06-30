/**
 * Gemini category-enhancer prompt builder — v2.
 *
 * Extracted from gemini-category-enhancer.ts so the prompt can be
 * iterated, tested, and A/B-compared independently of the API call
 * mechanics.
 *
 * Design doc: docs/superpowers/evals/prompt-redesign.md
 */

import type { ItemCategory } from "@/lib/database.types";
import type { GeminiCategoryInput } from "@/lib/enrichment/llm/gemini-category-enhancer";

// ── Category schema descriptions (mirrors category-schemas.ts) ──

const categorySchemaDescriptions: Record<ItemCategory, string> = {
  books:
    "books → authors: string[], isbn: string, published_year: integer (1000–3000), page_count: positive integer, average_rating: number, ratings_count: integer ≥ 0",
  movies_and_tv:
    "movies_and_tv → year: integer (1000–3000), directors: string[], runtime_minutes: positive integer, genres: string[], media_type: string, rating: number, rating_scale: number",
  restaurants:
    'restaurants → cuisine: string, price_level: string (e.g. "$$"), address: string, place_name: string',
  products:
    "products → brand: string, price: { amount: number, currency: string }, availability: string",
  travel:
    "travel → destination: string, travel_dates: string | null, lodging_name: string",
  recipes:
    "recipes → author: string, prep_time_minutes: positive integer, cook_time_minutes: positive integer, yield: string, ingredients: string[]",
  articles:
    "articles → author: string, published_at: string (ISO 8601), reading_time_minutes: positive integer, publisher: string",
};

function formatCategorySchema(category: ItemCategory): string {
  return `- ${categorySchemaDescriptions[category]}`;
}

// ── Category meaning one-liners ─────────────────────────────────

const categoryMeanings: Record<ItemCategory, string> = {
  books: "a specific book (Goodreads, Amazon book listing, Storytel, publisher page)",
  movies_and_tv:
    "a specific movie, TV show, or episode (IMDb, TMDb, Letterboxd)",
  restaurants:
    "a specific restaurant or food venue (Google Maps, Yelp, venue's own site)",
  products:
    "a specific purchasable product (Amazon, Etsy, brand product page)",
  travel:
    "a specific destination, hotel, or travel listing (Booking, Airbnb, TripAdvisor)",
  recipes:
    "a specific recipe with ingredients/instructions (recipe blogs, schema.org Recipe)",
  articles:
    "news, blog post, essay, magazine article — this is the DEFAULT fallback",
};

// ── Valid source labels ─────────────────────────────────────────

export const VALID_SOURCE_LABELS = [
  "url",
  "open_graph",
  "twitter",
  "json_ld",
  "title_tag",
  "existing_structured",
] as const;

export type SourceLabel = (typeof VALID_SOURCE_LABELS)[number];

// ── All categories (order matches category-schemas.ts) ──────────

const allCategories: ItemCategory[] = [
  "books",
  "movies_and_tv",
  "restaurants",
  "products",
  "travel",
  "recipes",
  "articles",
];

// ── Prompt builder ──────────────────────────────────────────────

export function buildGeminiCategoryPromptV2(
  input: GeminiCategoryInput & { category: ItemCategory },
): string {
  const sections: string[] = [];

  // ── Role & task
  sections.push(
    "You are enriching metadata for a single saved item in Theque, a private visual bookmark library.",
    "Your job: improve the item's title, description, and structured fields using ONLY the evidence supplied below.",
  );

  // ── Error-page guard
  sections.push(
    "",
    "## Error-page guard",
    'If the title, description, or OG metadata contains error indicators (e.g. "404", "Not Found", "Access Denied", "Page Not Available", "Forbidden", "Bot or Not"), treat those fields as ABSENT — do not copy them into your output. If ALL supplied metadata is error/blocked content, return only confidence, sources, and notes explaining the situation.',
  );

  // ── Evidence rules
  sections.push(
    "",
    "## Evidence rules",
    '- "Evidence" means a value explicitly present in the URL, Open Graph tags, Twitter card, JSON-LD, or the deterministic structured fields supplied below.',
    "- Do NOT use general world knowledge to fill in authors, directors, ratings, prices, dates, addresses, or any structured field. If you recognize the item but the metadata lacks the value, omit the field.",
    '- URL path segments are valid evidence for item names, venue names, and destinations (e.g. "/selva-restaurant/" → place_name: "Selva").',
    "- Prefer structured metadata (JSON-LD > Open Graph > Twitter > title tag) when sources conflict.",
  );

  // ── Category
  sections.push("", "## Category", `Deterministic category: **${input.category}**`);

  if (input.categorySuggestionAllowed) {
    sections.push(
      `Category suggestion is allowed (reason: ${input.categorySuggestionReason ?? "weak_evidence"}).`,
      'You MAY return category_suggestion + category_confidence ONLY if the supplied metadata clearly identifies the item as a different category. The bar is high: a recipe page on a food blog is "recipes", not "articles"; an Amazon book listing is "books", not "products". Classify the SPECIFIC ITEM the user saved, not the website\'s general genre.',
      "When you return a category_suggestion, all structured fields MUST match the SUGGESTED category's schema below.",
      "If evidence is ambiguous, keep the deterministic category and do NOT return category_suggestion.",
    );
  } else {
    sections.push(
      "Do NOT change the category. Do NOT return category_suggestion or category_confidence.",
      `Return only structured fields allowed for: ${input.category}.`,
    );
  }

  // ── Category meanings
  sections.push("", "## Category meanings");
  for (const cat of allCategories) {
    sections.push(`- ${cat}: ${categoryMeanings[cat]}`);
  }

  // ── Structured field schemas
  sections.push(
    "",
    "## Allowed structured fields",
    "Return ONLY fields from the schema for the active category. Any unlisted field will be rejected by the validator.",
  );

  if (input.categorySuggestionAllowed) {
    // Show all schemas so the model can pick the right one
    for (const cat of allCategories) {
      sections.push(formatCategorySchema(cat));
    }
  } else {
    sections.push(formatCategorySchema(input.category));
  }

  // ── Field-level rules
  sections.push(
    "",
    "## Field rules",
    '- title: The item\'s specific name. Discard site names, error text, and domain-only titles. For restaurants, use the venue name. For products, use the product name (strip "Amazon.com:" prefixes).',
    "- subtitle: Author/director + year for books/movies. Cuisine + location for restaurants. Brand for products. Omit if not evident.",
    "- description: 1–2 sentence summary of the SPECIFIC item, not the website. Omit if only generic site boilerplate is available.",
    "- image_url: Keep the existing image URL if valid (starts with http). Do not invent image URLs.",
    "- structured: Only fields from the schema above with values directly supported by evidence. Omit rather than guess.",
    "- confidence: 0.0–1.0 reflecting how much supplied metadata you could use. 0.3 = sparse/mostly URL-derived. 0.7+ = rich metadata present.",
    `- sources: Array of evidence source LABELS you actually used. Valid values: ${VALID_SOURCE_LABELS.map((s) => `"${s}"`).join(", ")}. Do NOT use raw URLs. Do NOT use "model", "general_knowledge", "description", or "image_url". Do NOT use "description". Do NOT use "image_url".`,
    '- notes: A single string with per-field provenance. Example: "title from og:title; year from JSON-LD datePublished; authors omitted (not in metadata)". Always explain omitted important fields.',
    "- If notes say a structured field was extracted or sourced, that key MUST appear in structured with the extracted value. If a field is omitted from structured, notes must say it was omitted.",
  );

  // ── Blocked/sparse page guidance
  if (
    input.categorySuggestionAllowed &&
    input.categorySuggestionReason === "blocked_or_sparse_fetch"
  ) {
    sections.push(
      "",
      "## Blocked/sparse page",
      "The page fetch was blocked or returned very little HTML. Use URL structure as primary evidence. Extract venue names, product names, or destinations from URL path segments when clearly readable. Set confidence to 0.2–0.4 for URL-only evidence.",
    );
  }

  // ── Omission rules
  sections.push(
    "",
    "## When to omit fields",
    "- Omit title if the only available title is an error page, a bare domain, or the site name.",
    '- Omit description if only boilerplate ("Welcome to our site") or error text is available.',
    "- Omit ALL structured fields rather than guessing. An empty structured object is valid.",
    "- Omit image_url rather than inventing a URL.",
  );

  // ── Supplied metadata
  sections.push(
    "",
    "## Supplied metadata",
    `URL: ${input.finalUrl}`,
    `Title: ${input.title ?? "(none)"}`,
    `Subtitle: ${input.subtitle ?? "(none)"}`,
    `Description: ${input.description ?? "(none)"}`,
    `Image URL: ${input.image_url ?? "(none)"}`,
    `Existing structured: ${JSON.stringify(input.structured)}`,
    `Open Graph: ${JSON.stringify(input.rawMetadata.open_graph)}`,
    `Twitter card: ${JSON.stringify(input.rawMetadata.twitter)}`,
    `JSON-LD: ${JSON.stringify(input.rawMetadata.json_ld)}`,
    `Parser used: ${input.rawMetadata.parser}`,
  );

  return sections.join("\n");
}

// ── V3: page text + tiered world knowledge + provenance ─────────

export const VALID_SOURCE_LABELS_V3 = [
  ...VALID_SOURCE_LABELS,
  "page_text",
  "model_knowledge",
] as const;

export function buildGeminiCategoryPromptV3(input: GeminiCategoryInput): string {
  const sections: string[] = [];

  sections.push(
    "You are enriching metadata for a single saved item in Theque, a private visual bookmark library.",
    "Your job: improve the item's title, description, and structured fields using the evidence below, plus carefully-bounded world knowledge.",
  );

  sections.push(
    "",
    "## Error-page guard",
    'If the title, description, or OG metadata contains error indicators (e.g. "404", "Not Found", "Access Denied", "Page Not Available", "Forbidden", "Bot or Not"), treat those fields as ABSENT — do not copy them into your output.',
  );

  sections.push(
    "",
    "## Evidence tiers",
    '- Tier 1 — page evidence: values explicitly present in the URL, page text, Open Graph tags, Twitter card, JSON-LD, or the deterministic structured fields below. Always preferred. Label these fields "page" in field_sources.',
    "- Tier 2 — world knowledge: ONLY when the item is unambiguously identified (a canonical ID in the URL such as an IMDb title ID or Goodreads book ID, or an exact title plus creator in the evidence), you MAY fill widely-known, stable facts about that specific work, venue, or product: authors, publication/release year, genres, page counts, cuisine type, media type. Label every such field \"model_knowledge\" in field_sources and include \"model_knowledge\" in sources.",
    "- NEVER use world knowledge for crew: film/TV directors and TV creators must come from page evidence only — recalled crew is unreliable (the model tends to return a cast member instead of the director). Omit `directors` when the page does not state them.",
    "- NEVER use world knowledge for volatile or unverifiable facts: prices, current ratings, ratings counts, availability, addresses, phone numbers, opening hours. These require page evidence. Omit them otherwise.",
    "- If you are not certain the identified entity matches this exact URL, do not use world knowledge. Omit instead.",
    '- URL path segments are valid page evidence for item names, venue names, and destinations (e.g. "/selva-restaurant/" → place_name: "Selva").',
    "- Prefer structured metadata (JSON-LD > Open Graph > Twitter > page text > title tag) when sources conflict.",
  );

  sections.push("", "## Category");
  if (input.category === null) {
    sections.push(
      "No reliable category was determined for this item.",
      "You MUST return category_suggestion (your best category from the list below) and category_confidence.",
      "All structured fields MUST match the suggested category's schema.",
    );
  } else {
    sections.push(`Deterministic category: **${input.category}**`);
    if (input.categorySuggestionAllowed) {
      sections.push(
        `Category suggestion is allowed (reason: ${input.categorySuggestionReason ?? "weak_evidence"}).`,
        'You MAY return category_suggestion + category_confidence ONLY if the evidence clearly identifies the item as a different category. The bar is high: a recipe page on a food blog is "recipes", not "articles"; an Amazon book listing is "books", not "products". Classify the SPECIFIC ITEM the user saved, not the website\'s general genre.',
        "When you return a category_suggestion, all structured fields MUST match the SUGGESTED category's schema below.",
        "If evidence is ambiguous, keep the deterministic category and do NOT return category_suggestion.",
      );
    } else {
      sections.push(
        "Do NOT change the category. Do NOT return category_suggestion or category_confidence.",
        `Return only structured fields allowed for: ${input.category}.`,
      );
    }
  }

  sections.push("", "## Category meanings");
  for (const cat of allCategories) {
    sections.push(`- ${cat}: ${categoryMeanings[cat]}`);
  }

  sections.push(
    "",
    "## Allowed structured fields",
    "Return ONLY fields from the schema for the active category. Any unlisted field will be rejected by the validator.",
  );
  if (input.category === null || input.categorySuggestionAllowed) {
    for (const cat of allCategories) {
      sections.push(formatCategorySchema(cat));
    }
  } else {
    sections.push(formatCategorySchema(input.category));
  }

  sections.push(
    "",
    "## Field rules",
    '- title: The item\'s specific name. Discard site names, error text, and domain-only titles. For restaurants, use the venue name. For products, use the product name (strip "Amazon.com:" prefixes).',
    "- subtitle: Author/director + year for books/movies. Cuisine + location for restaurants. Brand for products. Omit if not evident.",
    "- description: 1–2 sentence summary of the SPECIFIC item, not the website. World knowledge MAY be used here when the entity is Tier-2 identified.",
    "- image_url: Keep the existing image URL if valid (starts with http). Do not invent image URLs.",
    "- structured: Only fields from the schema above, each backed by page evidence or Tier-2 world knowledge.",
    '- field_sources: For EVERY key you return in structured, record where it came from: "page" or "model_knowledge". Example: {"authors": "model_knowledge", "published_year": "page"}.',
    "- confidence: 0.0–1.0. Cap at 0.7 when your output relies mainly on world knowledge. 0.3 = sparse/mostly URL-derived. 0.8+ = rich page evidence.",
    `- sources: Array of evidence source LABELS you actually used. Valid values: ${VALID_SOURCE_LABELS_V3.map((s) => `"${s}"`).join(", ")}. Do NOT use raw URLs.`,
    '- notes: A single string with per-field provenance notes, e.g. "title from og:title; year from model knowledge (IMDb ID identified); price omitted (volatile, no page evidence)".',
  );

  if (input.pageText) {
    sections.push("", "## Page text", input.pageText);
  }

  sections.push(
    "",
    "## Supplied metadata",
    `URL: ${input.finalUrl}`,
    `Title: ${input.title ?? "(none)"}`,
    `Subtitle: ${input.subtitle ?? "(none)"}`,
    `Description: ${input.description ?? "(none)"}`,
    `Image URL: ${input.image_url ?? "(none)"}`,
    `Existing structured: ${JSON.stringify(input.structured)}`,
    `Open Graph: ${JSON.stringify(input.rawMetadata.open_graph)}`,
    `Twitter card: ${JSON.stringify(input.rawMetadata.twitter)}`,
    `JSON-LD: ${JSON.stringify(input.rawMetadata.json_ld)}`,
    `Parser used: ${input.rawMetadata.parser}`,
  );

  return sections.join("\n");
}
