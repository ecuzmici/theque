import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { generateContentMock, groundedLookupMock } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
  groundedLookupMock: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock };
  },
}));

vi.mock("@/lib/enrichment/llm/grounded-search", () => ({ groundedLookup: groundedLookupMock }));

vi.mock("server-only", () => ({}));

import {
  buildGeminiResponseJsonSchema,
  enhanceCategoryWithGemini,
  isGeminiConfigured,
  normalizeGeminiPayload,
} from "@/lib/enrichment/llm/gemini-category-enhancer";

const baseInput = {
  finalUrl: "https://www.imdb.com/title/tt0468569/",
  category: "movies_and_tv" as const,
  categorySuggestionAllowed: false,
  title: "The Dark Knight",
  subtitle: null,
  description: null,
  image_url: null,
  structured: {},
  rawMetadata: {
    fetched_at: "2026-06-13T00:00:00.000Z",
    final_url: "https://www.imdb.com/title/tt0468569/",
    status_code: 200,
    open_graph: {},
    twitter: {},
    json_ld: [],
    parser: "imdb",
  },
  pageText: "Batman faces the Joker in Gotham.",
};

describe("enhanceCategoryWithGemini (direct SDK)", () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    vi.stubEnv("GEMINI_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("skips when GEMINI_API_KEY is missing", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const result = await enhanceCategoryWithGemini(baseInput);
    expect(result).toEqual({ status: "skipped", reason: "missing_api_key" });
    expect(isGeminiConfigured()).toBe(false);
  });

  it("returns enhanced output from the primary model", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        confidence: 0.8,
        sources: ["json_ld"],
        structured: { year: 2008, directors: ["Christopher Nolan"] },
        field_sources: { year: "page", directors: "model_knowledge" },
      }),
    });

    const result = await enhanceCategoryWithGemini(baseInput);

    expect(result.status).toBe("enhanced");
    if (result.status === "enhanced") {
      expect(result.enhancement.structured).toEqual({
        year: 2008,
        directors: ["Christopher Nolan"],
      });
      expect(result.providerMetadata.model).toBe("gemini-2.5-flash-lite");
    }
    expect(generateContentMock).toHaveBeenCalledTimes(1);
    const callArg = generateContentMock.mock.calls[0][0];
    expect(callArg.model).toBe("gemini-2.5-flash-lite");
    expect(callArg.config.responseMimeType).toBe("application/json");
    expect(callArg.config.responseJsonSchema).toBeDefined();
    expect(callArg.contents).toContain("Batman faces the Joker");
  });

  it("falls back to the second model when the first call throws", async () => {
    generateContentMock
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce({
        text: JSON.stringify({ confidence: 0.5, sources: ["url"] }),
      });

    const result = await enhanceCategoryWithGemini(baseInput);

    expect(result.status).toBe("enhanced");
    expect(generateContentMock).toHaveBeenCalledTimes(2);
    expect(generateContentMock.mock.calls[1][0].model).toBe("gemini-2.5-flash");
  });

  it("fails when all models fail", async () => {
    generateContentMock.mockRejectedValue(new Error("boom"));
    const result = await enhanceCategoryWithGemini(baseInput);
    expect(result).toEqual({ status: "failed", reason: "boom" });
  });
});

describe("enhanceCategoryWithGemini grounding two-step", () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    groundedLookupMock.mockReset();
    vi.stubEnv("GEMINI_API_KEY", "test-key");
  });
  afterEach(() => vi.unstubAllEnvs());

  const groundingInput = {
    ...baseInput,
    category: "restaurants" as const,
    categorySuggestionAllowed: true,
    categorySuggestionReason: "blocked_or_sparse_fetch",
    pageText: null,
    groundingRecommended: true,
  };

  it("runs grounded lookup first and feeds its text into the structuring call", async () => {
    groundedLookupMock.mockResolvedValue("Selva is a tasting-menu restaurant in Lisbon.");
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        confidence: 0.6,
        sources: ["grounded_search"],
        structured: { place_name: "Selva", cuisine: "Portuguese" },
        field_sources: { place_name: "grounded_search", cuisine: "grounded_search" },
        category_suggestion: "restaurants",
        category_confidence: 0.7,
      }),
    });

    const result = await enhanceCategoryWithGemini(groundingInput);

    expect(groundedLookupMock).toHaveBeenCalledOnce();
    expect(result.status).toBe("enhanced");
    // grounded text reached the structuring prompt
    expect(generateContentMock.mock.calls[0][0].contents).toContain("tasting-menu restaurant in Lisbon");
  });

  it("does not call grounded lookup when groundingRecommended is false", async () => {
    generateContentMock.mockResolvedValue({ text: JSON.stringify({ confidence: 0.5, sources: ["url"] }) });
    await enhanceCategoryWithGemini({ ...groundingInput, groundingRecommended: false });
    expect(groundedLookupMock).not.toHaveBeenCalled();
  });

  it("proceeds normally when grounded lookup returns null", async () => {
    groundedLookupMock.mockResolvedValue(null);
    generateContentMock.mockResolvedValue({ text: JSON.stringify({ confidence: 0.4, sources: ["url"] }) });
    const result = await enhanceCategoryWithGemini(groundingInput);
    expect(result.status).toBe("enhanced");
  });
});

describe("buildGeminiResponseJsonSchema", () => {
  it("requires category_suggestion when category is null", () => {
    const schema = buildGeminiResponseJsonSchema(true, null) as {
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(schema.required).toContain("category_suggestion");
    expect(schema.properties.field_sources).toBeDefined();
  });

  it("omits suggestion keys when not allowed", () => {
    const schema = buildGeminiResponseJsonSchema(false, "books") as {
      properties: Record<string, unknown>;
    };
    expect(schema.properties.category_suggestion).toBeUndefined();
  });
});

describe("normalizeGeminiPayload", () => {
  it("rejects invalid payloads with a reason", () => {
    expect(normalizeGeminiPayload("books", { confidence: 2, sources: [] })).toEqual({
      status: "failed",
      reason: "invalid_confidence",
    });
  });
});
