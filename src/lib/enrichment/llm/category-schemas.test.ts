import { describe, expect, it } from "vitest";

import {
  validateLlmCategoryEnhancement,
  validateLlmItemRewriteProposal,
} from "@/lib/enrichment/llm/category-schemas";

describe("validateLlmCategoryEnhancement", () => {
  it("accepts valid movie fields", () => {
    const result = validateLlmCategoryEnhancement("movies_and_tv", {
      title: "Inception",
      subtitle: "Christopher Nolan · 2010",
      description: "A dream thief is offered a chance to erase his criminal record.",
      structured: {
        year: 2010,
        directors: ["Christopher Nolan"],
        runtime_minutes: 148,
        genres: ["Action", "Sci-Fi"],
        media_type: "movie",
      },
      confidence: 0.84,
      sources: ["open_graph", "json_ld"],
    });

    expect(result.ok).toBe(true);
  });

  it("rejects fields from the wrong category", () => {
    const result = validateLlmCategoryEnhancement("books", {
      structured: {
        directors: ["Wrong category"],
      },
      confidence: 0.7,
      sources: ["model"],
    });

    expect(result.ok).toBe(false);
  });

  it("rejects invalid confidence values", () => {
    const result = validateLlmCategoryEnhancement("articles", {
      structured: {
        author: "Jane Doe",
      },
      confidence: 2,
      sources: ["open_graph"],
    });

    expect(result.ok).toBe(false);
  });

  it("rejects invalid structured value shapes", () => {
    const result = validateLlmCategoryEnhancement("books", {
      structured: {
        authors: [123],
        published_year: "unknown",
      },
      confidence: 0.7,
      sources: ["json_ld"],
    });

    expect(result.ok).toBe(false);
  });

  it("accepts a valid category suggestion", () => {
    const result = validateLlmCategoryEnhancement("articles", {
      category_suggestion: "restaurants",
      category_confidence: 0.76,
      confidence: 0.8,
      sources: ["model"],
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        category_suggestion: "restaurants",
        category_confidence: 0.76,
      },
    });
  });

  it("validates structured fields against the suggested category", () => {
    const result = validateLlmCategoryEnhancement("articles", {
      category_suggestion: "restaurants",
      category_confidence: 0.76,
      structured: {
        place_name: "Selva",
        cuisine: "Latin American",
      },
      confidence: 0.8,
      sources: ["model"],
    });

    expect(result.ok).toBe(true);
  });

  it("rejects invalid category suggestions", () => {
    const result = validateLlmCategoryEnhancement("articles", {
      category_suggestion: "concerts",
      category_confidence: 0.76,
      confidence: 0.8,
      sources: ["model"],
    });

    expect(result).toEqual({ ok: false, reason: "invalid_category_suggestion" });
  });

  it("rejects invalid category suggestion confidence", () => {
    const result = validateLlmCategoryEnhancement("articles", {
      category_suggestion: "restaurants",
      category_confidence: 1.2,
      confidence: 0.8,
      sources: ["model"],
    });

    expect(result).toEqual({ ok: false, reason: "invalid_category_confidence" });
  });
});

describe("validateLlmCategoryEnhancement field_sources and null category", () => {
  it("accepts valid field_sources values", () => {
    const result = validateLlmCategoryEnhancement("books", {
      confidence: 0.6,
      sources: ["model_knowledge"],
      structured: { authors: ["Frank Herbert"], published_year: 1965 },
      field_sources: { authors: "model_knowledge", published_year: "page" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.field_sources).toEqual({
        authors: "model_knowledge",
        published_year: "page",
      });
    }
  });

  it("rejects unknown field_sources values", () => {
    const result = validateLlmCategoryEnhancement("books", {
      confidence: 0.6,
      sources: ["url"],
      field_sources: { authors: "telepathy" },
    });
    expect(result).toEqual({ ok: false, reason: "invalid_field_sources" });
  });

  it("validates structured against the suggestion when category is null", () => {
    const result = validateLlmCategoryEnhancement(null, {
      confidence: 0.5,
      sources: ["url"],
      category_suggestion: "restaurants",
      category_confidence: 0.7,
      structured: { place_name: "Selva" },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects structured fields when category is null and no suggestion is given", () => {
    const result = validateLlmCategoryEnhancement(null, {
      confidence: 0.5,
      sources: ["url"],
      structured: { place_name: "Selva" },
    });
    expect(result).toEqual({ ok: false, reason: "structured_without_category" });
  });
});

describe("validateLlmItemRewriteProposal", () => {
  it("accepts a full rewrite proposal with a new category", () => {
    const result = validateLlmItemRewriteProposal({
      category: "books",
      category_confidence: 0.93,
      title: "A Drop of Corruption",
      description: "A detective fantasy sequel.",
      structured: {
        authors: ["Robert Jackson Bennett"],
        published_year: 2025,
      },
      confidence: 0.88,
      sources: ["open_graph", "url"],
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        category: "books",
        category_confidence: 0.93,
        title: "A Drop of Corruption",
      },
    });
  });

  it("accepts null optional string fields from the proposal API response", () => {
    const result = validateLlmItemRewriteProposal({
      category: "books",
      category_confidence: 1,
      title: "A Drop of Corruption",
      subtitle: null,
      description: null,
      image_url: null,
      structured: {},
      confidence: 1,
      sources: ["https://example.com/book"],
      notes: null,
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        category: "books",
        image_url: undefined,
        notes: undefined,
      },
    });
  });

  it("rejects invalid proposed categories", () => {
    const result = validateLlmItemRewriteProposal({
      category: "wishlist",
      category_confidence: 0.7,
      confidence: 0.8,
      sources: ["url"],
    });

    expect(result).toEqual({ ok: false, reason: "invalid_category" });
  });

  it("validates structured fields against the proposed category", () => {
    const result = validateLlmItemRewriteProposal({
      category: "products",
      category_confidence: 0.8,
      structured: {
        authors: ["Wrong"],
      },
      confidence: 0.8,
      sources: ["url"],
    });

    expect(result).toEqual({ ok: false, reason: "unknown_structured_field:authors" });
  });
});
