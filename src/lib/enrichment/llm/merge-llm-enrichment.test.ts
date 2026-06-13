import { describe, expect, it } from "vitest";

import { mergeLlmEnrichment } from "@/lib/enrichment/llm/merge-llm-enrichment";

describe("mergeLlmEnrichment", () => {
  it("fills missing structured fields without overwriting existing values", () => {
    const result = mergeLlmEnrichment({
      current: {
        title: "Existing Title",
        subtitle: null,
        description: null,
        image_url: null,
        category: "books",
        category_confidence: 0.85,
        category_source: "schema_org",
        structured: { authors: ["Parser Author"] },
        rawMetadata: { parser: "generic" },
      },
      llmResult: {
        status: "enhanced",
        enhancement: {
          title: "LLM Title",
          structured: {
            authors: ["LLM Author"],
            published_year: 2024,
          },
          confidence: 0.8,
          sources: ["open_graph"],
        },
        providerMetadata: { provider: "gemini", model: "gemini-2.5-flash" },
      },
      now: "2026-05-16T00:00:00.000Z",
    });

    expect(result.title).toBe("Existing Title");
    expect(result.structured).toEqual({
      authors: ["Parser Author"],
      published_year: 2024,
    });
    expect(result.rawMetadata.llm).toMatchObject({
      provider: "gemini",
      status: "enhanced",
      confidence: 0.8,
      returned_fields: ["published_year"],
    });
  });

  it("records failed attempts without changing deterministic fields", () => {
    const result = mergeLlmEnrichment({
      current: {
        title: "Existing Title",
        subtitle: null,
        description: "Existing description.",
        image_url: null,
        category: "articles",
        category_confidence: 0.4,
        category_source: "heuristic",
        structured: {},
        rawMetadata: { parser: "generic" },
      },
      llmResult: { status: "failed", reason: "timeout" },
      now: "2026-05-16T00:00:00.000Z",
    });

    expect(result.title).toBe("Existing Title");
    expect(result.rawMetadata.llm).toMatchObject({
      provider: "gemini",
      status: "failed",
      reason: "timeout",
    });
  });

  it("fills empty arrays and objects as sparse structured values", () => {
    const result = mergeLlmEnrichment({
      current: {
        title: "Existing Title",
        subtitle: null,
        description: null,
        image_url: null,
        category: "books",
        category_confidence: 0.4,
        category_source: "heuristic",
        structured: { authors: [], price: {} },
        rawMetadata: { parser: "generic" },
      },
      llmResult: {
        status: "enhanced",
        enhancement: {
          structured: {
            authors: ["LLM Author"],
            price: { amount: 20, currency: "EUR" },
          },
          confidence: 0.8,
          sources: ["json_ld"],
        },
        providerMetadata: { provider: "gemini", model: "gemini-2.5-flash" },
      },
      now: "2026-05-16T00:00:00.000Z",
    });

    expect(result.structured).toEqual({
      authors: ["LLM Author"],
      price: { amount: 20, currency: "EUR" },
    });
    expect(result.rawMetadata.llm).toMatchObject({
      returned_fields: ["authors", "price"],
    });
  });

  it("applies an allowed category suggestion and records audit metadata", () => {
    const result = mergeLlmEnrichment({
      current: {
        title: null,
        subtitle: null,
        description: null,
        image_url: null,
        category: "articles",
        category_confidence: 0.4,
        category_source: "heuristic",
        structured: {},
        rawMetadata: { parser: "generic" },
      },
      categorySuggestionAllowed: true,
      categorySuggestionReason: "blocked_or_sparse_fetch",
      llmResult: {
        status: "enhanced",
        enhancement: {
          category_suggestion: "restaurants",
          category_confidence: 0.78,
          title: "Selva",
          structured: {
            place_name: "Selva",
            cuisine: "Latin American",
          },
          confidence: 0.8,
          sources: ["model"],
        },
        providerMetadata: { provider: "gemini", model: "gemini-2.5-flash" },
      },
      now: "2026-05-16T00:00:00.000Z",
    });

    expect(result).toMatchObject({
      category: "restaurants",
      category_confidence: 0.78,
      category_source: "llm",
      structured: {
        place_name: "Selva",
        cuisine: "Latin American",
      },
    });
    expect(result.rawMetadata.llm).toMatchObject({
      category_suggestion: {
        category: "restaurants",
        confidence: 0.78,
        allowed: true,
        applied: true,
        reason: "blocked_or_sparse_fetch",
      },
    });
  });

  it("uses an LLM restaurant title as place_name when the suggested category is applied", () => {
    const result = mergeLlmEnrichment({
      current: {
        title: null,
        subtitle: null,
        description: null,
        image_url: null,
        category: "articles",
        category_confidence: 0.4,
        category_source: "heuristic",
        structured: {},
        rawMetadata: { parser: "generic" },
      },
      categorySuggestionAllowed: true,
      categorySuggestionReason: "blocked_or_sparse_fetch",
      llmResult: {
        status: "enhanced",
        enhancement: {
          category_suggestion: "restaurants",
          category_confidence: 0.95,
          title: "Selva Restaurant",
          confidence: 0.9,
          sources: ["https://www.selva-restaurant.com/en"],
        },
        providerMetadata: { provider: "gemini", model: "gemini-2.5-flash" },
      },
      now: "2026-05-16T00:00:00.000Z",
    });

    expect(result).toMatchObject({
      title: "Selva Restaurant",
      category: "restaurants",
      category_source: "llm",
      structured: {
        place_name: "Selva Restaurant",
      },
    });
    expect(result.rawMetadata.llm).toMatchObject({
      returned_fields: ["title", "place_name"],
    });
  });

  it("does not override a manual category when category suggestions are not allowed", () => {
    const result = mergeLlmEnrichment({
      current: {
        title: "Useful manual title",
        subtitle: null,
        description: "Existing description with useful metadata.",
        image_url: "https://example.com/image.jpg",
        category: "books",
        category_confidence: 1,
        category_source: "manual",
        structured: { authors: ["Jane Doe"] },
        rawMetadata: { parser: "generic" },
      },
      categorySuggestionAllowed: false,
      categorySuggestionReason: "manual_metadata_useful",
      llmResult: {
        status: "enhanced",
        enhancement: {
          category_suggestion: "restaurants",
          category_confidence: 0.78,
          structured: {
            place_name: "Selva",
          },
          confidence: 0.8,
          sources: ["model"],
        },
        providerMetadata: { provider: "gemini", model: "gemini-2.5-flash" },
      },
      now: "2026-05-16T00:00:00.000Z",
    });

    expect(result).toMatchObject({
      category: "books",
      category_confidence: 1,
      category_source: "manual",
      structured: { authors: ["Jane Doe"] },
    });
    expect(result.structured).not.toHaveProperty("place_name");
    expect(result.rawMetadata.llm).toMatchObject({
      category_suggestion: {
        category: "restaurants",
        confidence: 0.78,
        allowed: false,
        applied: false,
        reason: "manual_metadata_useful",
      },
    });
  });
});

describe("mergeLlmEnrichment junk-aware + uncategorized", () => {
  it("replaces a junk description", () => {
    const merged = mergeLlmEnrichment({
      current: {
        title: "The Dark Knight",
        subtitle: null,
        description: "Access Denied - you do not have permission to view this page today.",
        image_url: null,
        category: "movies_and_tv",
        category_confidence: 0.95,
        category_source: "domain",
        structured: {},
        rawMetadata: {},
      },
      llmResult: {
        status: "enhanced",
        enhancement: {
          confidence: 0.8,
          sources: ["page_text"],
          description: "Batman faces the Joker as Gotham descends into chaos.",
        },
        providerMetadata: { provider: "gemini" },
      },
      now: "2026-06-13T00:00:00.000Z",
    });
    expect(merged.description).toBe("Batman faces the Joker as Gotham descends into chaos.");
  });

  it("applies a category suggestion to an uncategorized item", () => {
    const merged = mergeLlmEnrichment({
      current: {
        title: "selva-restaurant",
        subtitle: null,
        description: null,
        image_url: null,
        category: null,
        category_confidence: 0.3,
        category_source: "heuristic",
        structured: {},
        rawMetadata: {},
      },
      categorySuggestionAllowed: true,
      categorySuggestionReason: "uncategorized",
      llmResult: {
        status: "enhanced",
        enhancement: {
          confidence: 0.6,
          sources: ["url"],
          category_suggestion: "restaurants",
          category_confidence: 0.75,
          title: "Selva",
          structured: { place_name: "Selva" },
        },
        providerMetadata: { provider: "gemini" },
      },
      now: "2026-06-13T00:00:00.000Z",
    });
    expect(merged.category).toBe("restaurants");
    expect(merged.category_source).toBe("llm");
    expect(merged.structured.place_name).toBe("Selva");
  });

  it("clamps recorded confidence to 0.7 when all fields are model knowledge", () => {
    const merged = mergeLlmEnrichment({
      current: {
        title: "Dune",
        subtitle: null,
        description: null,
        image_url: null,
        category: "books",
        category_confidence: 0.95,
        category_source: "domain",
        structured: {},
        rawMetadata: {},
      },
      llmResult: {
        status: "enhanced",
        enhancement: {
          confidence: 0.95,
          sources: ["model_knowledge"],
          structured: { authors: ["Frank Herbert"], published_year: 1965 },
          field_sources: { authors: "model_knowledge", published_year: "model_knowledge" },
        },
        providerMetadata: { provider: "gemini" },
      },
      now: "2026-06-13T00:00:00.000Z",
    });
    const llmMeta = merged.rawMetadata.llm as Record<string, unknown>;
    expect(llmMeta.confidence).toBe(0.7);
    expect(llmMeta.field_sources).toEqual({
      authors: "model_knowledge",
      published_year: "model_knowledge",
    });
  });
});
