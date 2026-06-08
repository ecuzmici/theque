import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("recommend-config", () => {
  describe("isRecommendEnabled", () => {
    it("returns false when GEMINI_API_KEY is absent", async () => {
      const original = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      // Dynamic import to get fresh module state
      const { isRecommendEnabled } = await import("@/lib/recommend/recommend-config");
      expect(isRecommendEnabled()).toBe(false);
      if (original !== undefined) process.env.GEMINI_API_KEY = original;
    });

    it("returns true when GEMINI_API_KEY is set", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      const { isRecommendEnabled } = await import("@/lib/recommend/recommend-config");
      expect(isRecommendEnabled()).toBe(true);
      delete process.env.GEMINI_API_KEY;
    });
  });

  describe("isWatchRecommendEnabled", () => {
    it("returns false when only GEMINI_API_KEY is set (no TMDB key)", async () => {
      process.env.GEMINI_API_KEY = "test-gemini-key";
      delete process.env.TMDB_API_KEY;
      const { isWatchRecommendEnabled } = await import("@/lib/recommend/recommend-config");
      expect(isWatchRecommendEnabled()).toBe(false);
      delete process.env.GEMINI_API_KEY;
    });

    it("returns true when both GEMINI_API_KEY and TMDB_API_KEY are set", async () => {
      process.env.GEMINI_API_KEY = "test-gemini-key";
      process.env.TMDB_API_KEY = "test-tmdb-key";
      const { isWatchRecommendEnabled } = await import("@/lib/recommend/recommend-config");
      expect(isWatchRecommendEnabled()).toBe(true);
      delete process.env.GEMINI_API_KEY;
      delete process.env.TMDB_API_KEY;
    });
  });

  describe("isShelfRecommendEnabled", () => {
    it("books shelf enabled iff GEMINI_API_KEY set", async () => {
      const { isShelfRecommendEnabled } = await import("@/lib/recommend/recommend-config");
      process.env.GEMINI_API_KEY = "test-key";
      expect(isShelfRecommendEnabled("books")).toBe(true);
      delete process.env.GEMINI_API_KEY;
      expect(isShelfRecommendEnabled("books")).toBe(false);
    });

    it("watch shelf enabled iff both keys set", async () => {
      const { isShelfRecommendEnabled } = await import("@/lib/recommend/recommend-config");
      process.env.GEMINI_API_KEY = "test-key";
      expect(isShelfRecommendEnabled("watch")).toBe(false);
      process.env.TMDB_API_KEY = "test-tmdb";
      expect(isShelfRecommendEnabled("watch")).toBe(true);
      delete process.env.GEMINI_API_KEY;
      delete process.env.TMDB_API_KEY;
    });
  });

  describe("defaults", () => {
    it("RECOMMEND_MIN_ITEMS defaults to 3", async () => {
      delete process.env.RECOMMEND_MIN_ITEMS;
      const { RECOMMEND_MIN_ITEMS } = await import("@/lib/recommend/recommend-config");
      expect(RECOMMEND_MIN_ITEMS).toBe(3);
    });

    it("RECOMMEND_COUNT defaults to 5", async () => {
      delete process.env.RECOMMEND_COUNT;
      const { RECOMMEND_COUNT } = await import("@/lib/recommend/recommend-config");
      expect(RECOMMEND_COUNT).toBe(5);
    });
  });
});
