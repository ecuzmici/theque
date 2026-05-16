import { describe, expect, it } from "vitest";

import {
  buildGeminiCategoryPromptV2,
  VALID_SOURCE_LABELS,
} from "@/lib/enrichment/llm/prompt-builder";

const baseInput = {
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

describe("buildGeminiCategoryPromptV2", () => {
  describe("error-page guard", () => {
    it("includes an error-page guard section", () => {
      const prompt = buildGeminiCategoryPromptV2({
        ...baseInput,
        categorySuggestionAllowed: false,
      });
      expect(prompt).toContain("## Error-page guard");
      expect(prompt).toContain("404");
      expect(prompt).toContain("treat those fields as ABSENT");
    });
  });

  describe("evidence rules", () => {
    it("bans general world knowledge", () => {
      const prompt = buildGeminiCategoryPromptV2({
        ...baseInput,
        categorySuggestionAllowed: false,
      });
      expect(prompt).toContain("Do NOT use general world knowledge");
    });

    it("legitimizes URL path segments as evidence", () => {
      const prompt = buildGeminiCategoryPromptV2({
        ...baseInput,
        categorySuggestionAllowed: false,
      });
      expect(prompt).toContain("URL path segments are valid evidence");
    });
  });

  describe("category handling", () => {
    it("fixes the deterministic category when suggestion is not allowed", () => {
      const prompt = buildGeminiCategoryPromptV2({
        ...baseInput,
        categorySuggestionAllowed: false,
      });
      expect(prompt).toContain("Deterministic category: **books**");
      expect(prompt).toContain("Do NOT change the category. Do NOT return category_suggestion");
      expect(prompt).not.toContain("You MAY return category_suggestion");
    });

    it("allows a category suggestion with high-bar language", () => {
      const prompt = buildGeminiCategoryPromptV2({
        ...baseInput,
        categorySuggestionAllowed: true,
        categorySuggestionReason: "blocked_or_sparse_fetch",
      });
      expect(prompt).toContain("Category suggestion is allowed");
      expect(prompt).toContain("The bar is high");
      expect(prompt).toContain("SPECIFIC ITEM the user saved");
    });

    it("includes category meanings for all categories", () => {
      const prompt = buildGeminiCategoryPromptV2({
        ...baseInput,
        categorySuggestionAllowed: false,
      });
      expect(prompt).toContain("## Category meanings");
      expect(prompt).toContain("books: a specific book");
      expect(prompt).toContain("restaurants: a specific restaurant");
      expect(prompt).toContain("articles: news, blog post");
    });
  });

  describe("structured field schemas", () => {
    it("shows only the fixed category schema when suggestion is not allowed", () => {
      const prompt = buildGeminiCategoryPromptV2({
        ...baseInput,
        category: "books",
        categorySuggestionAllowed: false,
      });
      expect(prompt).toContain("books → authors:");
      expect(prompt).not.toContain("restaurants → cuisine:");
    });

    it("shows all category schemas when suggestion is allowed", () => {
      const prompt = buildGeminiCategoryPromptV2({
        ...baseInput,
        categorySuggestionAllowed: true,
        categorySuggestionReason: "blocked_or_sparse_fetch",
      });
      expect(prompt).toContain("books → authors:");
      expect(prompt).toContain("restaurants → cuisine:");
      expect(prompt).toContain("recipes → author:");
    });
  });

  describe("source vocabulary", () => {
    it("enumerates valid source labels in the prompt", () => {
      const prompt = buildGeminiCategoryPromptV2({
        ...baseInput,
        categorySuggestionAllowed: false,
      });
      for (const label of VALID_SOURCE_LABELS) {
        expect(prompt).toContain(`"${label}"`);
      }
      expect(prompt).toContain('Do NOT use "model"');
    });

    it("rejects supplied field names as source labels", () => {
      const prompt = buildGeminiCategoryPromptV2({
        ...baseInput,
        categorySuggestionAllowed: false,
      });
      expect(prompt).toContain('Do NOT use "description"');
      expect(prompt).toContain('Do NOT use "image_url"');
    });
  });

  describe("notes provenance", () => {
    it("requires per-field provenance in notes", () => {
      const prompt = buildGeminiCategoryPromptV2({
        ...baseInput,
        categorySuggestionAllowed: false,
      });
      expect(prompt).toContain("per-field provenance");
      expect(prompt).toContain("title from og:title");
      expect(prompt).toContain("omitted (not in metadata)");
    });

    it("keeps notes and structured fields consistent", () => {
      const prompt = buildGeminiCategoryPromptV2({
        ...baseInput,
        categorySuggestionAllowed: false,
      });
      expect(prompt).toContain("If notes say a structured field was extracted");
      expect(prompt).toContain("that key MUST appear in structured");
    });
  });

  describe("blocked/sparse page", () => {
    it("includes blocked-page guidance when fetch was sparse", () => {
      const prompt = buildGeminiCategoryPromptV2({
        ...baseInput,
        finalUrl: "https://www.selva-restaurant.com/en/",
        title: null,
        categorySuggestionAllowed: true,
        categorySuggestionReason: "blocked_or_sparse_fetch",
      });
      expect(prompt).toContain("## Blocked/sparse page");
      expect(prompt).toContain("URL structure as primary evidence");
      expect(prompt).toContain("confidence to 0.2–0.4");
    });

    it("omits blocked-page section when not applicable", () => {
      const prompt = buildGeminiCategoryPromptV2({
        ...baseInput,
        categorySuggestionAllowed: false,
      });
      expect(prompt).not.toContain("## Blocked/sparse page");
    });
  });

  describe("supplied metadata", () => {
    it("renders (none) for missing fields instead of empty strings", () => {
      const prompt = buildGeminiCategoryPromptV2({
        ...baseInput,
        title: null,
        subtitle: null,
        description: null,
        image_url: null,
      });
      expect(prompt).toContain("Title: (none)");
      expect(prompt).toContain("Subtitle: (none)");
      expect(prompt).toContain("Description: (none)");
      expect(prompt).toContain("Image URL: (none)");
    });

    it("includes the URL, OG, Twitter, JSON-LD, and parser", () => {
      const prompt = buildGeminiCategoryPromptV2({
        ...baseInput,
        categorySuggestionAllowed: false,
      });
      expect(prompt).toContain("URL: https://example.com/book");
      expect(prompt).toContain("Open Graph:");
      expect(prompt).toContain("Twitter card:");
      expect(prompt).toContain("JSON-LD:");
      expect(prompt).toContain("Parser used: generic");
    });
  });

  describe("omission rules", () => {
    it("instructs to omit rather than guess structured fields", () => {
      const prompt = buildGeminiCategoryPromptV2({
        ...baseInput,
        categorySuggestionAllowed: false,
      });
      expect(prompt).toContain("Omit ALL structured fields rather than guessing");
      expect(prompt).toContain("empty structured object is valid");
    });
  });
});
