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

  it("rejects invalid proposed categories", () => {
    const result = validateLlmItemRewriteProposal({
      category: "music",
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
