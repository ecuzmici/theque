import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildGeminiCategoryPrompt,
  buildGeminiResponseJsonSchema,
  normalizeGeminiPayload,
} from "@/lib/enrichment/llm/gemini-category-enhancer";

const basePromptInput = {
  finalUrl: "https://example.com/book",
  category: "books" as const,
  title: "Example Book",
  subtitle: null,
  description: null,
  image_url: null,
  structured: {},
  rawMetadata: {
    fetched_at: "2026-05-16T00:00:00.000Z",
    final_url: "https://example.com/book",
    status_code: 200,
    open_graph: {},
    twitter: {},
    json_ld: [],
    parser: "generic",
  },
};

describe("buildGeminiCategoryPrompt", () => {
  it("fixes the deterministic category in the prompt", () => {
    const prompt = buildGeminiCategoryPrompt({
      ...basePromptInput,
      categorySuggestionAllowed: false,
      categorySuggestionReason: "deterministic_data_sufficient",
    });

    expect(prompt).toContain("The deterministic category is fixed: books");
    expect(prompt).toContain("Do not change or return a different category");
  });

  it("allows a category suggestion when eligibility permits it", () => {
    const prompt = buildGeminiCategoryPrompt({
      ...basePromptInput,
      categorySuggestionAllowed: true,
      categorySuggestionReason: "blocked_or_sparse_fetch",
    });

    expect(prompt).toContain("Category suggestion is allowed because: blocked_or_sparse_fetch");
    expect(prompt).toContain("Return category_suggestion and category_confidence only if evidence supports a better category.");
  });

  it("asks for best-effort display fields from URL evidence on blocked or sparse pages", () => {
    const prompt = buildGeminiCategoryPrompt({
      ...basePromptInput,
      finalUrl: "https://www.selva-restaurant.com/en/",
      title: null,
      categorySuggestionAllowed: true,
      categorySuggestionReason: "blocked_or_sparse_fetch",
    });

    expect(prompt).toContain("For blocked or sparse pages, still return useful display metadata when it is evident from the URL");
    expect(prompt).toContain("restaurant URLs can use a clear venue name as title and structured.place_name");
  });
});

describe("buildGeminiResponseJsonSchema", () => {
  it("includes category suggestion fields only when allowed", () => {
    const disallowed = buildGeminiResponseJsonSchema(false);
    const allowed = buildGeminiResponseJsonSchema(true);

    expect(disallowed.properties).not.toHaveProperty("category_suggestion");
    expect(allowed.properties).toHaveProperty("category_suggestion");
    expect(allowed.properties).toHaveProperty("category_confidence");
  });
});

describe("normalizeGeminiPayload", () => {
  it("validates provider output before returning it", () => {
    const result = normalizeGeminiPayload("books", {
      structured: { authors: ["Jane Doe"] },
      confidence: 0.8,
      sources: ["open_graph"],
    });

    expect(result.status).toBe("enhanced");
  });

  it("fails closed for invalid provider output", () => {
    const result = normalizeGeminiPayload("books", {
      structured: { directors: ["Wrong"] },
      confidence: 0.8,
      sources: ["model"],
    });

    expect(result.status).toBe("failed");
  });
});
