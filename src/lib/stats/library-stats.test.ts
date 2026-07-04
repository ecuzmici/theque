import { describe, expect, it } from "vitest";

import {
  computeCategoryCounts,
  computeHueHistogram,
  computeMonthlyActivity,
  computeRatingDistribution,
  computeTopDomains,
  computeVerdictCount,
  normalizeDomain,
  samplePalette,
  sampleEvenly,
  type StatsItemRow,
} from "@/lib/stats/library-stats";

function row(overrides: Partial<StatsItemRow> = {}): StatsItemRow {
  return {
    category: "books",
    status: "want",
    domain: "example.com",
    dominant_color: null,
    dominant_hue: null,
    rating_personal: null,
    verdict: null,
    created_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("computeCategoryCounts", () => {
  it("counts per category, sorted by count desc then name", () => {
    const result = computeCategoryCounts([
      row({ category: "books" }),
      row({ category: "books" }),
      row({ category: "articles" }),
      row({ category: "movies_and_tv" }),
      row({ category: null }),
    ]);
    expect(result).toEqual([
      { category: "books", count: 2 },
      { category: "articles", count: 1 },
      { category: "movies_and_tv", count: 1 },
      { category: "uncategorized", count: 1 },
    ]);
  });

  it("returns an empty array for no rows", () => {
    expect(computeCategoryCounts([])).toEqual([]);
  });
});

describe("computeRatingDistribution", () => {
  it("only counts rated done items and flags loved (>=4)", () => {
    const result = computeRatingDistribution([
      row({ status: "done", rating_personal: 5 }),
      row({ status: "done", rating_personal: 4 }),
      row({ status: "done", rating_personal: 2 }),
      row({ status: "done", rating_personal: null }), // done, unrated → ignored
      row({ status: "want", rating_personal: 5 }), // not done → ignored
    ]);
    expect(result.ratedDoneCount).toBe(3);
    expect(result.lovedCount).toBe(2);
    expect(result.ratings).toEqual([
      { star: 5, count: 1 },
      { star: 4, count: 1 },
      { star: 3, count: 0 },
      { star: 2, count: 1 },
      { star: 1, count: 0 },
    ]);
  });

  it("ignores out-of-range ratings", () => {
    const result = computeRatingDistribution([
      row({ status: "done", rating_personal: 0 }),
      row({ status: "done", rating_personal: 9 }),
    ]);
    expect(result.ratedDoneCount).toBe(0);
  });
});

describe("computeHueHistogram", () => {
  it("buckets hues into the requested number of bins", () => {
    const buckets = computeHueHistogram(
      [
        row({ dominant_hue: 0 }),
        row({ dominant_hue: 10 }), // same first bucket (0–30)
        row({ dominant_hue: 200 }),
        row({ dominant_hue: null }),
      ],
      12,
    );
    expect(buckets).toHaveLength(12);
    expect(buckets[0].count).toBe(2);
    expect(buckets[0].startHue).toBe(0);
    // 200° lands in bucket index 6 (180–210).
    expect(buckets[6].count).toBe(1);
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(3);
  });

  it("wraps hue 360 back to the first bucket (same point on the wheel as 0)", () => {
    const buckets = computeHueHistogram([row({ dominant_hue: 360 })], 12);
    expect(buckets[0].count).toBe(1);
  });

  it("keeps a near-360 hue in the final bucket", () => {
    const buckets = computeHueHistogram([row({ dominant_hue: 359.9 })], 12);
    expect(buckets[11].count).toBe(1);
  });
});

describe("normalizeDomain / computeTopDomains", () => {
  it("strips www and lower-cases", () => {
    expect(normalizeDomain("WWW.Example.com")).toBe("example.com");
  });

  it("ranks domains by frequency and caps the list", () => {
    const rows = [
      row({ domain: "www.goodreads.com" }),
      row({ domain: "goodreads.com" }),
      row({ domain: "imdb.com" }),
      row({ domain: null }),
    ];
    const top = computeTopDomains(rows, 5);
    expect(top[0]).toEqual({ domain: "goodreads.com", count: 2 });
    expect(top).toHaveLength(2);
  });
});

describe("computeMonthlyActivity", () => {
  it("returns a fixed window oldest→newest with zero-filled gaps", () => {
    const now = new Date("2026-06-15T00:00:00.000Z");
    const result = computeMonthlyActivity(
      [
        row({ created_at: "2026-06-02T00:00:00.000Z" }),
        row({ created_at: "2026-06-20T00:00:00.000Z" }),
        row({ created_at: "2026-04-10T00:00:00.000Z" }),
      ],
      6,
      now,
    );
    expect(result).toHaveLength(6);
    expect(result[result.length - 1]).toMatchObject({ month: "2026-06", count: 2 });
    expect(result[3]).toMatchObject({ month: "2026-04", count: 1 });
    expect(result[4]).toMatchObject({ month: "2026-05", count: 0 });
  });
});

describe("computeVerdictCount", () => {
  it("counts only done items with a non-empty verdict", () => {
    expect(
      computeVerdictCount([
        row({ status: "done", verdict: "loved it" }),
        row({ status: "done", verdict: "   " }),
        row({ status: "done", verdict: null }),
        row({ status: "want", verdict: "should not count" }),
      ]),
    ).toBe(1);
  });
});

describe("samplePalette / sampleEvenly", () => {
  it("keeps only non-null colors and caps the count", () => {
    const rows = Array.from({ length: 200 }, (_, i) =>
      row({ dominant_color: i % 2 === 0 ? `#${i.toString(16).padStart(6, "0")}` : null }),
    );
    const palette = samplePalette(rows, 16);
    expect(palette.length).toBeLessThanOrEqual(16);
    expect(palette.every((c) => c.startsWith("#"))).toBe(true);
  });

  it("returns the input unchanged when under the cap", () => {
    expect(sampleEvenly([1, 2, 3], 10)).toEqual([1, 2, 3]);
    expect(sampleEvenly([], 10)).toEqual([]);
    expect(sampleEvenly([1, 2, 3], 0)).toEqual([]);
  });
});
