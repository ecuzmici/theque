import { describe, expect, it, vi } from "vitest";

// recommend-prompt → recommend-config → ai/gateway imports server-only.
vi.mock("server-only", () => ({}));

import {
  buildRecommendPrompt,
  RECOMMEND_RESPONSE_SCHEMA,
} from "@/lib/recommend/recommend-prompt";
import type { RecommendInputItem } from "@/lib/recommend/recommend-types";

const sampleBooks: RecommendInputItem[] = [
  { title: "Piranesi", creator: "Susanna Clarke", year: 2020 },
  { title: "The Name of the Wind", creator: "Patrick Rothfuss", year: 2007 },
  { title: "Jonathan Strange & Mr Norrell", creator: "Susanna Clarke", year: 2004 },
];

describe("buildRecommendPrompt", () => {
  describe("books shelf", () => {
    it("includes the shelf label 'books'", () => {
      const prompt = buildRecommendPrompt("books", sampleBooks);
      expect(prompt).toContain("books");
    });

    it("formats items correctly", () => {
      const prompt = buildRecommendPrompt("books", sampleBooks);
      expect(prompt).toContain('"Piranesi" by Susanna Clarke (2020)');
      expect(prompt).toContain('"The Name of the Wind" by Patrick Rothfuss (2007)');
    });

    it("instructs to output author as creator", () => {
      const prompt = buildRecommendPrompt("books", sampleBooks);
      expect(prompt).toContain("author");
      expect(prompt).toContain("creator");
    });

    it("explicitly forbids URLs", () => {
      const prompt = buildRecommendPrompt("books", sampleBooks);
      expect(prompt).toContain("Do NOT output URLs");
    });

    it("asks for identity only", () => {
      const prompt = buildRecommendPrompt("books", sampleBooks);
      expect(prompt).toContain("identity only");
    });
  });

  describe("watch shelf", () => {
    it("includes the shelf label 'movies and TV shows'", () => {
      const prompt = buildRecommendPrompt("watch", [
        { title: "Inception", creator: "Christopher Nolan", year: 2010 },
        { title: "The Godfather", creator: "Francis Ford Coppola", year: 1972 },
        { title: "Parasite", creator: "Bong Joon-ho", year: 2019 },
      ]);
      expect(prompt).toContain("movies and TV shows");
    });

    it("instructs to output director as creator", () => {
      const prompt = buildRecommendPrompt("watch", [
        { title: "Inception", creator: "Christopher Nolan", year: 2010 },
        { title: "The Godfather", creator: "Francis Ford Coppola", year: 1972 },
        { title: "Parasite", creator: "Bong Joon-ho", year: 2019 },
      ]);
      expect(prompt).toContain("director");
    });
  });

  describe("item handling", () => {
    it("handles missing creator gracefully", () => {
      const items: RecommendInputItem[] = [
        { title: "Unknown Author Book", creator: null, year: 2020 },
        { title: "Another Book", creator: "Some Author", year: 2021 },
        { title: "Third Book", creator: null, year: 2019 },
      ];
      const prompt = buildRecommendPrompt("books", items);
      expect(prompt).toContain('"Unknown Author Book"');
      // Should not include "by null"
      expect(prompt).not.toContain("by null");
    });

    it("handles missing year gracefully", () => {
      const items: RecommendInputItem[] = [
        { title: "No Year Book", creator: "Some Author", year: null },
        { title: "Another Book", creator: "Author Two", year: 2021 },
        { title: "Third Book", creator: "Author Three", year: null },
      ];
      const prompt = buildRecommendPrompt("books", items);
      expect(prompt).toContain('"No Year Book" by Some Author');
      // Should not include "(null)"
      expect(prompt).not.toContain("(null)");
    });

    it("caps items at RECOMMEND_MAX_INPUT_ITEMS", () => {
      const manyItems: RecommendInputItem[] = Array.from({ length: 25 }, (_, i) => ({
        title: `Book ${i}`,
        creator: `Author ${i}`,
        year: 2000 + i,
      }));
      const prompt = buildRecommendPrompt("books", manyItems);
      // Should not contain Book 20 (index 20, which is item 21)
      expect(prompt).not.toContain('"Book 20"');
    });
  });

  describe("response schema", () => {
    it("schema requires candidates array", () => {
      expect(RECOMMEND_RESPONSE_SCHEMA.required).toContain("candidates");
    });

    it("schema properties do NOT include url or link fields", () => {
      const itemProps =
        (RECOMMEND_RESPONSE_SCHEMA.properties.candidates.items as { properties: Record<string, unknown> }).properties;
      expect(itemProps).not.toHaveProperty("url");
      expect(itemProps).not.toHaveProperty("suggested_url");
      expect(itemProps).not.toHaveProperty("link");
    });

    it("schema requires title, creator, description, reason", () => {
      const itemRequired =
        (RECOMMEND_RESPONSE_SCHEMA.properties.candidates.items as { required: string[] }).required;
      expect(itemRequired).toContain("title");
      expect(itemRequired).toContain("creator");
      expect(itemRequired).toContain("description");
      expect(itemRequired).toContain("reason");
    });
  });
});
