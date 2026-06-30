import { describe, expect, it } from "vitest";

import { computeWrapped, PALETTE_SWATCHES, type WrappedItemRow } from "./wrapped-stats";

const NOW = new Date("2026-06-15T12:00:00Z");

function row(overrides: Partial<WrappedItemRow> = {}): WrappedItemRow {
  return {
    created_at: "2026-03-01T00:00:00Z",
    done_at: null,
    category: "articles",
    domain: "example.com",
    dominant_hue: null,
    dominant_color: null,
    rating_personal: null,
    verdict: null,
    title: "Something",
    status: "want",
    ...overrides,
  };
}

function manyThisYear(n: number, overrides: Partial<WrappedItemRow> = {}): WrappedItemRow[] {
  return Array.from({ length: n }, () => row(overrides));
}

describe("computeWrapped", () => {
  it("flags an empty library without throwing", () => {
    const data = computeWrapped([], NOW);
    expect(data.isEmpty).toBe(true);
    expect(data.totalSaved).toBe(0);
    expect(data.busiestMonth).toBeNull();
    expect(data.standoutPick).toBeNull();
    expect(data.paletteColors).toEqual([]);
  });

  it("frames the current year once it is substantial enough", () => {
    const data = computeWrapped(manyThisYear(6), NOW);
    expect(data.period).toEqual({ kind: "year", label: "2026" });
    expect(data.totalSaved).toBe(6);
    expect(data.isEmpty).toBe(false);
  });

  it("falls back to all-time for a sparse current year", () => {
    const rows = [
      ...manyThisYear(3),
      row({ created_at: "2025-02-01T00:00:00Z" }),
      row({ created_at: "2024-09-01T00:00:00Z" }),
    ];
    const data = computeWrapped(rows, NOW);
    expect(data.period.kind).toBe("all-time");
    // all-time counts every row, not just the current year
    expect(data.totalSaved).toBe(5);
  });

  it("finds the busiest month with a bare month label in a year window", () => {
    const rows = [
      ...manyThisYear(3, { created_at: "2026-03-10T00:00:00Z" }),
      ...manyThisYear(2, { created_at: "2026-01-05T00:00:00Z" }),
      row({ created_at: "2026-07-01T00:00:00Z" }),
    ];
    const data = computeWrapped(rows, NOW);
    expect(data.busiestMonth).toEqual({ label: "March", count: 3 });
  });

  it("labels the busiest month with its year in an all-time window", () => {
    const rows = [
      row({ created_at: "2025-11-01T00:00:00Z" }),
      row({ created_at: "2025-11-15T00:00:00Z" }),
      row({ created_at: "2024-04-01T00:00:00Z" }),
    ];
    const data = computeWrapped(rows, NOW);
    expect(data.period.kind).toBe("all-time");
    expect(data.busiestMonth).toEqual({ label: "November 2025", count: 2 });
  });

  it("ranks top categories by count and caps the list at five", () => {
    const rows = [
      ...manyThisYear(3, { category: "books" }),
      ...manyThisYear(2, { category: "movies_and_tv" }),
      row({ category: "articles" }),
      row({ category: "recipes" }),
      row({ category: "travel" }),
      row({ category: "products" }),
      row({ category: "restaurants" }),
      row({ category: null }),
    ];
    const data = computeWrapped(rows, NOW);
    expect(data.topCategories.length).toBe(5);
    expect(data.topCategories[0]).toEqual({ category: "books", label: "Books", count: 3 });
    expect(data.topCategories[1].category).toBe("movies_and_tv");
  });

  it("walks the palette around the hue wheel and ignores colorless items", () => {
    const rows = [
      ...manyThisYear(2),
      row({ dominant_color: "#ff0000", dominant_hue: 0 }),
      row({ dominant_color: "#00ff00", dominant_hue: 120 }),
      row({ dominant_color: "#0000ff", dominant_hue: 240 }),
    ];
    const data = computeWrapped(rows, NOW);
    expect(data.colorCount).toBe(3);
    expect(data.paletteColors).toEqual(["#ff0000", "#00ff00", "#0000ff"]);
  });

  it("never returns more swatches than the band holds", () => {
    const rows = Array.from({ length: 100 }, (_, i) =>
      row({ dominant_color: `#${i.toString(16).padStart(6, "0")}`, dominant_hue: i }),
    );
    const data = computeWrapped(rows, NOW);
    expect(data.paletteColors.length).toBe(PALETTE_SWATCHES);
  });

  it("counts finished items in the window", () => {
    const rows = [
      ...manyThisYear(4),
      row({ done_at: "2026-05-01T00:00:00Z" }),
      row({ done_at: "2026-05-02T00:00:00Z" }),
    ];
    const data = computeWrapped(rows, NOW);
    expect(data.finishedCount).toBe(2);
  });

  it("picks the highest-rated item as the standout", () => {
    const rows = [
      ...manyThisYear(4),
      row({ title: "Mid", rating_personal: 3, done_at: "2026-05-01T00:00:00Z" }),
      row({ title: "Best", rating_personal: 5, done_at: "2026-05-02T00:00:00Z", category: "books" }),
      row({ title: "Good", rating_personal: 4, done_at: "2026-05-03T00:00:00Z" }),
    ];
    const data = computeWrapped(rows, NOW);
    expect(data.standoutPick?.title).toBe("Best");
    expect(data.standoutPick?.category).toBe("books");
  });

  it("breaks rating ties by most recently finished", () => {
    const rows = [
      ...manyThisYear(4),
      row({ title: "Older", rating_personal: 5, done_at: "2026-04-01T00:00:00Z" }),
      row({ title: "Newer", rating_personal: 5, done_at: "2026-05-20T00:00:00Z" }),
    ];
    const data = computeWrapped(rows, NOW);
    expect(data.standoutPick?.title).toBe("Newer");
  });

  it("falls back to the most recently finished item when nothing is rated", () => {
    const rows = [
      ...manyThisYear(4),
      row({ title: "First done", done_at: "2026-02-01T00:00:00Z" }),
      row({ title: "Last done", done_at: "2026-06-01T00:00:00Z" }),
    ];
    const data = computeWrapped(rows, NOW);
    expect(data.standoutPick?.title).toBe("Last done");
  });

  it("has no standout when nothing is rated or finished", () => {
    const data = computeWrapped(manyThisYear(6), NOW);
    expect(data.standoutPick).toBeNull();
  });

  it("finds the most-saved source", () => {
    const rows = [
      ...manyThisYear(3, { domain: "goodreads.com" }),
      ...manyThisYear(2, { domain: "imdb.com" }),
      row({ domain: "" }),
      row({ domain: null }),
    ];
    const data = computeWrapped(rows, NOW);
    expect(data.topDomain).toEqual({ domain: "goodreads.com", count: 3 });
  });

  it("passes the truncation flag through", () => {
    expect(computeWrapped(manyThisYear(6), NOW, true).truncated).toBe(true);
    expect(computeWrapped(manyThisYear(6), NOW).truncated).toBe(false);
  });
});
