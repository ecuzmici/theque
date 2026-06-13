import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildGeminiItemRewritePrompt,
  buildGeminiItemRewriteResponseJsonSchema,
  normalizeGeminiItemRewritePayload,
} from "@/lib/enrichment/llm/gemini-item-rewriter";

const baseRewriteInput = {
  finalUrl: "https://www.amazon.nl/example-book",
  currentCategory: "articles" as const,
  title: "Amazon.nl listing",
  subtitle: null,
  description: null,
  image_url: null,
  structured: {},
  rawMetadata: {
    fetched_at: "2026-05-16T00:00:00.000Z",
    final_url: "https://www.amazon.nl/example-book",
    status_code: 200,
    open_graph: {},
    twitter: {},
    json_ld: [],
    parser: "generic",
  },
  pageText: null,
};

describe("buildGeminiItemRewritePrompt", () => {
  it("allows a full metadata rewrite proposal", () => {
    const prompt = buildGeminiItemRewritePrompt(baseRewriteInput);

    expect(prompt).toContain("You are proposing a full metadata rewrite for a single item in Theque.");
    expect(prompt).toContain("You may change category, title, description, image_url, and structured metadata.");
    expect(prompt).toContain("This is a review flow, so return your best proposal even when it overwrites existing fields.");
  });

  it("lists the supported structured fields for the current category", () => {
    const prompt = buildGeminiItemRewritePrompt({ ...baseRewriteInput, currentCategory: "books" });

    expect(prompt).toContain("Structured fields for books:");
    expect(prompt).toContain("isbn");
    expect(prompt).toContain("authors");
    expect(prompt).toContain("Always preserve existing structured values when they are still accurate");
  });
});

describe("buildGeminiItemRewriteResponseJsonSchema", () => {
  it("requires category and category confidence", () => {
    const schema = buildGeminiItemRewriteResponseJsonSchema();

    expect(schema.required).toContain("category");
    expect(schema.required).toContain("category_confidence");
    expect(schema.properties).toHaveProperty("structured");
  });

  it("describes the structured fields for the given category", () => {
    const schema = buildGeminiItemRewriteResponseJsonSchema("books");
    const structured = schema.properties.structured as {
      properties?: Record<string, unknown>;
    };

    expect(structured.properties).toHaveProperty("isbn");
    expect(structured.properties).toHaveProperty("authors");
    expect(structured.properties).not.toHaveProperty("cuisine");
  });
});

describe("normalizeGeminiItemRewritePayload", () => {
  it("validates full rewrite provider output before returning it", () => {
    const result = normalizeGeminiItemRewritePayload({
      category: "books",
      category_confidence: 0.94,
      title: "A Drop of Corruption",
      structured: {
        authors: ["Robert Jackson Bennett"],
      },
      confidence: 0.85,
      sources: ["url"],
    });

    expect(result.status).toBe("enhanced");
  });

  it("fails closed for invalid rewrite output", () => {
    const result = normalizeGeminiItemRewritePayload({
      category: "books",
      category_confidence: 0.94,
      structured: {
        place_name: "Wrong field",
      },
      confidence: 0.85,
      sources: ["url"],
    });

    expect(result.status).toBe("failed");
  });
});

describe("buildGeminiItemRewritePrompt v3 additions", () => {
  const input = {
    finalUrl: "https://www.goodreads.com/book/show/44767458-dune",
    currentCategory: "books" as const,
    title: "Dune",
    subtitle: null,
    description: null,
    image_url: null,
    structured: {},
    rawMetadata: {
      fetched_at: "2026-06-13T00:00:00.000Z",
      final_url: "https://www.goodreads.com/book/show/44767458-dune",
      status_code: 200,
      open_graph: {},
      twitter: {},
      json_ld: [],
      parser: "goodreads",
    },
    pageText: "Dune is set in the distant future amidst a feudal interstellar society.",
  };

  it("includes page text when provided", () => {
    const prompt = buildGeminiItemRewritePrompt(input);
    expect(prompt).toContain("Page text:");
    expect(prompt).toContain("feudal interstellar society");
  });

  it("omits the page text line when null", () => {
    const prompt = buildGeminiItemRewritePrompt({ ...input, pageText: null });
    expect(prompt).not.toContain("Page text:");
  });

  it("allows bounded world knowledge but bans volatile facts", () => {
    const prompt = buildGeminiItemRewritePrompt(input);
    expect(prompt).toContain("model_knowledge");
    expect(prompt).toMatch(/NEVER invent .*(prices|volatile)/i);
  });
});
