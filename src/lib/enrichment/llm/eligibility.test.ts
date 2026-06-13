import { describe, expect, it } from "vitest";

import { decideLlmEligibility } from "@/lib/enrichment/llm/eligibility";

const baseInput = {
  enabled: true,
  hasApiKey: true,
  fetchBlocked: false,
  fetchSparse: false,
  category: "books" as const,
  categorySource: "schema_org" as const,
  title: "A Real Book",
  description: "A useful description with enough detail.",
  image_url: "https://example.com/book.jpg",
  structured: {
    authors: ["Jane Doe"],
    published_year: 2024,
  },
};

describe("decideLlmEligibility", () => {
  it("skips when disabled", () => {
    expect(decideLlmEligibility({ ...baseInput, enabled: false }).eligible).toBe(false);
  });

  it("skips without an API key", () => {
    expect(decideLlmEligibility({ ...baseInput, hasApiKey: false }).eligible).toBe(false);
  });

  it("runs for sparse structured fields", () => {
    const result = decideLlmEligibility({ ...baseInput, structured: {} });
    expect(result).toMatchObject({ eligible: true, reason: "sparse_category_fields" });
  });

  it("runs for blocked fetches", () => {
    const result = decideLlmEligibility({ ...baseInput, fetchBlocked: true });
    expect(result).toMatchObject({ eligible: true, reason: "blocked_or_sparse_fetch" });
  });

  it("skips when deterministic data is strong enough", () => {
    const result = decideLlmEligibility(baseInput);
    expect(result).toMatchObject({ eligible: false, reason: "deterministic_data_sufficient" });
  });

  it("allows category suggestions for blocked deterministic fetches", () => {
    const result = decideLlmEligibility({ ...baseInput, fetchBlocked: true });

    expect(result).toMatchObject({
      categorySuggestionAllowed: true,
      categorySuggestionReason: "blocked_or_sparse_fetch",
    });
  });

  it("allows category suggestions for sparse deterministic fetches", () => {
    const result = decideLlmEligibility({ ...baseInput, fetchSparse: true });

    expect(result).toMatchObject({
      categorySuggestionAllowed: true,
      categorySuggestionReason: "blocked_or_sparse_fetch",
    });
  });

  it("allows manual category suggestions only when metadata has no useful value", () => {
    const result = decideLlmEligibility({
      ...baseInput,
      fetchBlocked: true,
      categorySource: "manual",
      title: null,
      description: null,
      image_url: null,
      structured: {},
    });

    expect(result).toMatchObject({
      categorySuggestionAllowed: true,
      categorySuggestionReason: "manual_no_useful_metadata",
    });
  });

  it("does not allow manual category suggestions when useful metadata exists", () => {
    const result = decideLlmEligibility({
      ...baseInput,
      fetchBlocked: true,
      categorySource: "manual",
    });

    expect(result).toMatchObject({
      categorySuggestionAllowed: false,
      categorySuggestionReason: "manual_metadata_useful",
    });
  });
});

describe("decideLlmEligibility uncategorized", () => {
  it("is eligible with category suggestion when category is null", () => {
    const result = decideLlmEligibility({
      enabled: true,
      hasApiKey: true,
      fetchBlocked: false,
      category: null,
      title: "Some page",
      description: null,
      structured: {},
    });
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe("uncategorized");
    expect(result.categorySuggestionAllowed).toBe(true);
    expect(result.categorySuggestionReason).toBe("uncategorized");
  });

  it("stays disabled for null category when the flag is off", () => {
    const result = decideLlmEligibility({
      enabled: false,
      hasApiKey: true,
      fetchBlocked: false,
      category: null,
      title: null,
      description: null,
      structured: {},
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("disabled");
  });
});

describe("decideLlmEligibility groundingRecommended", () => {
  const base = {
    enabled: true,
    hasApiKey: true,
    title: null,
    description: null,
    structured: {},
  };

  it("recommends grounding for a blocked, non-identifiable page when flag on", () => {
    const result = decideLlmEligibility({
      ...base,
      fetchBlocked: true,
      category: "restaurants",
      groundingEnabled: true,
      canonicalUrl: "https://www.google.com/maps/place/Selva",
    });
    expect(result.eligible).toBe(true);
    expect(result.groundingRecommended).toBe(true);
  });

  it("does NOT recommend grounding for an identifiable URL", () => {
    const result = decideLlmEligibility({
      ...base,
      fetchBlocked: true,
      category: "movies_and_tv",
      groundingEnabled: true,
      canonicalUrl: "https://www.imdb.com/title/tt0468569/",
    });
    expect(result.groundingRecommended).toBe(false);
  });

  it("does NOT recommend grounding when the flag is off", () => {
    const result = decideLlmEligibility({
      ...base,
      fetchBlocked: true,
      category: "restaurants",
      groundingEnabled: false,
      canonicalUrl: "https://selva.example/",
    });
    expect(result.groundingRecommended).toBe(false);
  });

  it("does NOT recommend grounding for a healthy page", () => {
    const result = decideLlmEligibility({
      enabled: true,
      hasApiKey: true,
      fetchBlocked: false,
      category: "articles",
      title: "A complete title",
      description: "A sufficiently long description that clears the thresholds for enrichment.",
      structured: { author: "x", publisher: "y", published_at: "2026" },
      groundingEnabled: true,
      canonicalUrl: "https://blog.example/post",
    });
    expect(result.groundingRecommended).toBe(false);
  });

  it("defaults groundingRecommended to false when grounding inputs are omitted", () => {
    const result = decideLlmEligibility({
      ...base,
      fetchBlocked: true,
      category: "restaurants",
    });
    expect(result.groundingRecommended).toBe(false);
  });
});
