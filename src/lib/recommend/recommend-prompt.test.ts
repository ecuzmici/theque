import { describe, expect, it, vi } from "vitest";

// recommend-prompt → recommend-config → ai/gateway imports server-only.
vi.mock("server-only", () => ({}));

import {
  buildRecommendPrompt,
  RECOMMEND_RESPONSE_SCHEMA,
} from "@/lib/recommend/recommend-prompt";
import type { TasteProfile } from "@/lib/recommend/recommend-types";

const lovedProfile: TasteProfile = {
  loved: [
    {
      title: "Piranesi",
      creator: "Susanna Clarke",
      year: 2020,
      verdictNote: "beautifully strange, unlike anything",
    },
  ],
  disliked: [
    {
      title: "Wanderers",
      creator: "Chuck Wendig",
      year: 2019,
      verdictNote: "too slow, I gave up",
    },
  ],
  backlog: [
    { title: "Hyperion", creator: "Dan Simmons", year: 1989 },
    { title: "Seveneves", creator: "Neal Stephenson", year: null },
  ],
  never: ["A Drop of Corruption", "Recently Shown Pick"],
};

describe("buildRecommendPrompt", () => {
  describe("books shelf", () => {
    it("includes LOVED section with verdict note", () => {
      const prompt = buildRecommendPrompt("books", lovedProfile);
      expect(prompt).toContain("LOVED (rated 4–5★):");
      expect(prompt).toContain(
        '- "Piranesi" by Susanna Clarke (2020) — "beautifully strange, unlike anything"',
      );
    });

    it("includes DISLIKED section with verdict note", () => {
      const prompt = buildRecommendPrompt("books", lovedProfile);
      expect(prompt).toContain("DISLIKED (rated 1–2★)");
      expect(prompt).toContain('- "Wanderers" by Chuck Wendig (2019) — "too slow, I gave up"');
    });

    it("includes BACKLOG section without verdict notes", () => {
      const prompt = buildRecommendPrompt("books", lovedProfile);
      expect(prompt).toContain("BACKLOG (saved, not yet consumed");
      expect(prompt).toContain('- "Hyperion" by Dan Simmons (1989)');
      expect(prompt).not.toContain("Seveneves" + ' — "');
    });

    it("includes NEVER section", () => {
      const prompt = buildRecommendPrompt("books", lovedProfile);
      expect(prompt).toContain("NEVER suggest these titles:");
      expect(prompt).toContain('- "A Drop of Corruption"');
      expect(prompt).toContain('- "Recently Shown Pick"');
    });

    it("instructs to output author as creator", () => {
      const prompt = buildRecommendPrompt("books", lovedProfile);
      expect(prompt).toContain("author");
      expect(prompt).toContain("creator");
    });

    it("explicitly forbids URLs", () => {
      const prompt = buildRecommendPrompt("books", lovedProfile);
      expect(prompt).toContain("Do NOT output URLs");
    });
  });

  describe("watch shelf", () => {
    it("includes the shelf label 'movies and TV shows'", () => {
      const prompt = buildRecommendPrompt("watch", {
        loved: [{ title: "Inception", creator: "Christopher Nolan", year: 2010 }],
        disliked: [],
        backlog: [],
        never: [],
      });
      expect(prompt).toContain("movies and TV shows");
    });

    it("instructs to output director as creator", () => {
      const prompt = buildRecommendPrompt("watch", {
        loved: [{ title: "Inception", creator: "Christopher Nolan", year: 2010 }],
        disliked: [],
        backlog: [],
        never: [],
      });
      expect(prompt).toContain("director");
    });
  });

  describe("all-backlog fallback", () => {
    it("omits LOVED/DISLIKED sections when there are zero verdicts", () => {
      const profile: TasteProfile = {
        loved: [],
        disliked: [],
        backlog: [
          { title: "Book A", creator: "Author A", year: 2020 },
          { title: "Book B", creator: "Author B", year: 2021 },
        ],
        never: ["Book A", "Book B"],
      };
      const prompt = buildRecommendPrompt("books", profile);
      expect(prompt).not.toContain("LOVED (rated 4–5★):");
      expect(prompt).not.toContain("DISLIKED (rated 1–2★)");
      expect(prompt).toContain("BACKLOG");
    });
  });

  describe("verdict note pass-through", () => {
    it("includes verdictNote verbatim (truncation is taste-profile's responsibility)", () => {
      const note = "beautifully strange";
      const prompt = buildRecommendPrompt("books", {
        loved: [{ title: "Piranesi", creator: "Susanna Clarke", year: 2020, verdictNote: note }],
        disliked: [],
        backlog: [],
        never: [],
      });
      expect(prompt).toContain(`— "${note}"`);
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
