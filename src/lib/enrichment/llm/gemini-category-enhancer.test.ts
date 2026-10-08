import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { generateJsonMock, groundedLookupMock } = vi.hoisted(() => ({
  generateJsonMock: vi.fn(),
  groundedLookupMock: vi.fn(),
}));

vi.mock("@/lib/ai/gateway", () => ({ generateJsonWithFallback: generateJsonMock }));

vi.mock("@/lib/enrichment/llm/grounded-search", () => ({ groundedLookup: groundedLookupMock }));

vi.mock("server-only", () => ({}));

import {
  buildGeminiResponseJsonSchema,
  enhanceCategoryWithGemini,
  normalizeGeminiPayload,
} from "@/lib/enrichment/llm/gemini-category-enhancer";
import { isEnrichmentLlmConfigured } from "@/lib/enrichment/llm/llm-config";

/** Mocks one gateway call that returns `data` from the model it was asked for. */
function resolveWith(data: unknown) {
  return (opts: { models: string[] }) => Promise.resolve({ data, model: opts.models[0] });
}

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

describe("enhanceCategoryWithGemini (AI Gateway)", () => {
  beforeEach(() => {
    generateJsonMock.mockReset();
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.stubEnv("ENRICHMENT_MODELS", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("skips when the gateway has no credentials", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    const result = await enhanceCategoryWithGemini(baseInput);
    expect(result).toEqual({ status: "skipped", reason: "missing_api_key" });
    expect(isEnrichmentLlmConfigured()).toBe(false);
    expect(generateJsonMock).not.toHaveBeenCalled();
  });

  it("returns enhanced output from the primary model", async () => {
    generateJsonMock.mockImplementation(
      resolveWith({
        confidence: 0.8,
        sources: ["json_ld"],
        structured: { year: 2008, directors: ["Christopher Nolan"] },
        field_sources: { year: "page", directors: "model_knowledge" },
      }),
    );

    const result = await enhanceCategoryWithGemini(baseInput);

    expect(result.status).toBe("enhanced");
    if (result.status === "enhanced") {
      expect(result.enhancement.structured).toEqual({
        year: 2008,
        directors: ["Christopher Nolan"],
      });
      expect(result.providerMetadata).toMatchObject({
        provider: "ai_gateway",
        model: "openai/gpt-6-luna",
      });
    }
    expect(generateJsonMock).toHaveBeenCalledTimes(1);
    const callArg = generateJsonMock.mock.calls[0][0];
    expect(callArg.models).toEqual(["openai/gpt-6-luna"]);
    expect(callArg.schema).toBeDefined();
    expect(callArg.providerOptions.openai).toEqual({ reasoningEffort: "none" });
    expect(callArg.prompt).toContain("Batman faces the Joker");
  });

  it("falls back to the second model when the first call throws", async () => {
    generateJsonMock
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockImplementationOnce(resolveWith({ confidence: 0.5, sources: ["url"] }));

    const result = await enhanceCategoryWithGemini(baseInput);

    expect(result.status).toBe("enhanced");
    expect(generateJsonMock).toHaveBeenCalledTimes(2);
    expect(generateJsonMock.mock.calls[1][0].models).toEqual(["anthropic/claude-haiku-5.5"]);
  });

  it("falls back to the second model when the first payload fails validation", async () => {
    generateJsonMock
      .mockImplementationOnce(resolveWith({ confidence: 2, sources: [] }))
      .mockImplementationOnce(resolveWith({ confidence: 0.5, sources: ["url"] }));

    const result = await enhanceCategoryWithGemini(baseInput);

    expect(result.status).toBe("enhanced");
    if (result.status === "enhanced") {
      expect(result.providerMetadata.model).toBe("anthropic/claude-haiku-5.5");
    }
  });

  it("uses the ENRICHMENT_MODELS override", async () => {
    vi.stubEnv("ENRICHMENT_MODELS", "a/one, b/two");
    generateJsonMock.mockImplementation(resolveWith({ confidence: 0.5, sources: ["url"] }));
    await enhanceCategoryWithGemini(baseInput);
    expect(generateJsonMock.mock.calls[0][0].models).toEqual(["a/one"]);
  });

  it("fails when all models fail", async () => {
    generateJsonMock.mockRejectedValue(new Error("boom"));
    const result = await enhanceCategoryWithGemini(baseInput);
    expect(result).toEqual({ status: "failed", reason: "boom" });
  });
});

describe("enhanceCategoryWithGemini grounding two-step", () => {
  beforeEach(() => {
    generateJsonMock.mockReset();
    groundedLookupMock.mockReset();
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
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
    generateJsonMock.mockImplementation(
      resolveWith({
        confidence: 0.6,
        sources: ["grounded_search"],
        structured: { place_name: "Selva", cuisine: "Portuguese" },
        field_sources: { place_name: "grounded_search", cuisine: "grounded_search" },
        category_suggestion: "restaurants",
        category_confidence: 0.7,
      }),
    );

    const result = await enhanceCategoryWithGemini(groundingInput);

    expect(groundedLookupMock).toHaveBeenCalledOnce();
    expect(result.status).toBe("enhanced");
    // grounded text reached the structuring prompt
    expect(generateJsonMock.mock.calls[0][0].prompt).toContain("tasting-menu restaurant in Lisbon");
  });

  it("does not call grounded lookup when groundingRecommended is false", async () => {
    generateJsonMock.mockImplementation(resolveWith({ confidence: 0.5, sources: ["url"] }));
    await enhanceCategoryWithGemini({ ...groundingInput, groundingRecommended: false });
    expect(groundedLookupMock).not.toHaveBeenCalled();
  });

  it("proceeds normally when grounded lookup returns null", async () => {
    groundedLookupMock.mockResolvedValue(null);
    generateJsonMock.mockImplementation(resolveWith({ confidence: 0.4, sources: ["url"] }));
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
