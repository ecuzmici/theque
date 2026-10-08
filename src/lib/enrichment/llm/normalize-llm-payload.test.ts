import { describe, expect, it } from "vitest";

import { normalizeLlmPayload } from "@/lib/enrichment/llm/normalize-llm-payload";

describe("normalizeLlmPayload", () => {
  it("removes placeholder strings and zeros that a model sends for unknown fields", () => {
    expect(
      normalizeLlmPayload({
        category: "books",
        title: "Dune",
        subtitle: "",
        image_url: "",
        structured: {
          authors: ["Frank Herbert"],
          isbn: "",
          published_year: 1965,
          average_rating: 0,
          ratings_count: 0,
          genres: [],
        },
        confidence: 0.8,
        sources: ["url"],
        notes: "",
      }),
    ).toEqual({
      category: "books",
      title: "Dune",
      structured: { authors: ["Frank Herbert"], published_year: 1965 },
      confidence: 0.8,
      sources: ["url"],
    });
  });

  it("keeps a top-level confidence of 0 so validation can judge it", () => {
    expect(normalizeLlmPayload({ confidence: 0, sources: ["url"] })).toEqual({
      confidence: 0,
      sources: ["url"],
    });
  });

  it("removes structured when every field is a placeholder", () => {
    expect(normalizeLlmPayload({ structured: { isbn: "", page_count: 0 }, sources: ["url"] })).toEqual({
      sources: ["url"],
    });
  });

  it("labels unknown field sources as model_knowledge", () => {
    expect(
      normalizeLlmPayload({
        field_sources: { place_name: "page", cuisine: "url", address: "memory", rating: "" },
      }),
    ).toEqual({
      field_sources: { place_name: "page", cuisine: "model_knowledge", address: "model_knowledge" },
    });
  });

  it("returns non-object payloads unchanged", () => {
    expect(normalizeLlmPayload(null)).toBeNull();
    expect(normalizeLlmPayload("text")).toBe("text");
  });
});
