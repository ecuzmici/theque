import { describe, expect, it } from "vitest";

import { buildTasteCardSummary, type TasteCardRow } from "./taste-card-data";

function row(overrides: Partial<TasteCardRow> = {}): TasteCardRow {
  return {
    category: "books",
    status: "want",
    dominant_color: null,
    dominant_hue: null,
    rating_personal: null,
    title: null,
    ...overrides,
  };
}

describe("buildTasteCardSummary", () => {
  it("reports empty for no rows", () => {
    const s = buildTasteCardSummary([]);
    expect(s.isEmpty).toBe(true);
    expect(s.total).toBe(0);
    expect(s.completionPct).toBe(0);
    expect(s.topShelves).toEqual([]);
    expect(s.palette).toEqual([]);
    expect(s.standout).toBeNull();
  });

  it("excludes dismissed items from every metric", () => {
    const s = buildTasteCardSummary([
      row({ status: "want" }),
      row({ status: "dismissed", category: "movies_and_tv" }),
    ]);
    expect(s.total).toBe(1);
    expect(s.topShelves).toEqual([{ label: "Books", count: 1 }]);
  });

  it("computes completion percentage from done / total", () => {
    const s = buildTasteCardSummary([
      row({ status: "done" }),
      row({ status: "done" }),
      row({ status: "want" }),
      row({ status: "inbox" }),
    ]);
    expect(s.total).toBe(4);
    expect(s.done).toBe(2);
    expect(s.completionPct).toBe(50);
  });

  it("groups long-tail categories under Other and ranks shelves by count", () => {
    const s = buildTasteCardSummary([
      row({ category: "restaurants" }),
      row({ category: "products" }),
      row({ category: "travel" }),
      row({ category: "books" }),
      row({ category: "books" }),
      row({ category: "movies_and_tv" }),
    ]);
    expect(s.topShelves).toEqual([
      { label: "Other", count: 3 },
      { label: "Books", count: 2 },
      { label: "Watch", count: 1 },
    ]);
  });

  it("builds a deduped palette walked around the hue wheel", () => {
    const s = buildTasteCardSummary([
      row({ dominant_color: "#ff0000", dominant_hue: 350 }),
      row({ dominant_color: "#00ff00", dominant_hue: 120 }),
      row({ dominant_color: "#00ff00", dominant_hue: 120 }), // dup color
      row({ dominant_color: "#0000ff", dominant_hue: 240 }),
      row({ dominant_color: null, dominant_hue: null }), // colorless ignored
    ]);
    expect(s.palette).toEqual(["#00ff00", "#0000ff", "#ff0000"]);
  });

  it("picks the highest-rated finished item with a title as the standout", () => {
    const s = buildTasteCardSummary([
      row({ status: "done", rating_personal: 3, title: "Okay book" }),
      row({ status: "done", rating_personal: 5, title: "Great film", category: "movies_and_tv" }),
      row({ status: "done", rating_personal: 5, title: null }), // no title → ignored
      row({ status: "want", rating_personal: 5, title: "Not finished" }), // not done → ignored
    ]);
    expect(s.standout).toEqual({ title: "Great film", rating: 5 });
  });
});
