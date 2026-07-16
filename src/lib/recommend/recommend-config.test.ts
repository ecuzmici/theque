import { describe, expect, it, vi } from "vitest";

// recommend-config transitively imports the gateway helper (server-only).
vi.mock("server-only", () => ({}));

describe("recommend-config", () => {
  describe("isRecommendEnabled", () => {
    it("returns false when the AI Gateway is not configured", async () => {
      const originalKey = process.env.AI_GATEWAY_API_KEY;
      const originalOidc = process.env.VERCEL_OIDC_TOKEN;
      delete process.env.AI_GATEWAY_API_KEY;
      delete process.env.VERCEL_OIDC_TOKEN;
      const { isRecommendEnabled } = await import("@/lib/recommend/recommend-config");
      expect(isRecommendEnabled()).toBe(false);
      if (originalKey !== undefined) process.env.AI_GATEWAY_API_KEY = originalKey;
      if (originalOidc !== undefined) process.env.VERCEL_OIDC_TOKEN = originalOidc;
    });

    it("returns true when AI_GATEWAY_API_KEY is set", async () => {
      process.env.AI_GATEWAY_API_KEY = "test-key";
      const { isRecommendEnabled } = await import("@/lib/recommend/recommend-config");
      expect(isRecommendEnabled()).toBe(true);
      delete process.env.AI_GATEWAY_API_KEY;
    });
  });

  describe("isWatchRecommendEnabled", () => {
    it("returns false when only the gateway is configured (no TMDB key)", async () => {
      process.env.AI_GATEWAY_API_KEY = "test-key";
      delete process.env.TMDB_API_KEY;
      const { isWatchRecommendEnabled } = await import("@/lib/recommend/recommend-config");
      expect(isWatchRecommendEnabled()).toBe(false);
      delete process.env.AI_GATEWAY_API_KEY;
    });

    it("returns true when both the gateway and TMDB_API_KEY are set", async () => {
      process.env.AI_GATEWAY_API_KEY = "test-key";
      process.env.TMDB_API_KEY = "test-tmdb-key";
      const { isWatchRecommendEnabled } = await import("@/lib/recommend/recommend-config");
      expect(isWatchRecommendEnabled()).toBe(true);
      delete process.env.AI_GATEWAY_API_KEY;
      delete process.env.TMDB_API_KEY;
    });
  });

  describe("isShelfRecommendEnabled", () => {
    it("books shelf enabled iff the gateway is configured", async () => {
      const { isShelfRecommendEnabled } = await import("@/lib/recommend/recommend-config");
      process.env.AI_GATEWAY_API_KEY = "test-key";
      expect(isShelfRecommendEnabled("books")).toBe(true);
      delete process.env.AI_GATEWAY_API_KEY;
      delete process.env.VERCEL_OIDC_TOKEN;
      expect(isShelfRecommendEnabled("books")).toBe(false);
    });

    it("watch shelf enabled iff gateway + TMDB key set", async () => {
      const { isShelfRecommendEnabled } = await import("@/lib/recommend/recommend-config");
      process.env.AI_GATEWAY_API_KEY = "test-key";
      delete process.env.TMDB_API_KEY;
      expect(isShelfRecommendEnabled("watch")).toBe(false);
      process.env.TMDB_API_KEY = "test-tmdb";
      expect(isShelfRecommendEnabled("watch")).toBe(true);
      delete process.env.AI_GATEWAY_API_KEY;
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

describe("pickWatchRegion", () => {
  it("uses a valid geo header country code, uppercased", async () => {
    const { pickWatchRegion } = await import("@/lib/recommend/recommend-config");
    expect(pickWatchRegion("ro")).toBe("RO");
    expect(pickWatchRegion("GB")).toBe("GB");
  });

  it("falls back to the env default for missing or malformed values", async () => {
    const { pickWatchRegion, RECOMMEND_WATCH_REGION } = await import(
      "@/lib/recommend/recommend-config"
    );
    expect(pickWatchRegion(null)).toBe(RECOMMEND_WATCH_REGION);
    expect(pickWatchRegion(undefined)).toBe(RECOMMEND_WATCH_REGION);
    expect(pickWatchRegion("")).toBe(RECOMMEND_WATCH_REGION);
    expect(pickWatchRegion("USA")).toBe(RECOMMEND_WATCH_REGION);
    expect(pickWatchRegion("1x")).toBe(RECOMMEND_WATCH_REGION);
  });
});
