import { describe, expect, it } from "vitest";

import { contendersFor, topTen, type RankableItem } from "./top-ten";

function item(id: string, over: Partial<RankableItem> = {}): RankableItem {
  return {
    id,
    category: "books",
    status: "done",
    rating: 5,
    rankOrder: null,
    doneAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("top ten", () => {
  it("orders by rating, then by head-to-head place, then by most recent finish", () => {
    const items = [
      item("four", { rating: 4, rankOrder: 4.5 }),
      item("unplaced-old", { doneAt: "2025-01-01T00:00:00Z" }),
      item("second", { rankOrder: 5.75 }),
      item("first", { rankOrder: 5.25 }),
      item("unplaced-new", { doneAt: "2026-06-01T00:00:00Z" }),
    ];

    expect(topTen(items, "books").map((i) => i.id)).toEqual([
      "first",
      "second",
      "unplaced-new",
      "unplaced-old",
      "four",
    ]);
  });

  it("ignores a key from an old rating", () => {
    const items = [item("stale", { rating: 4, rankOrder: 5.1 }), item("placed", { rating: 4, rankOrder: 4.9 })];

    expect(topTen(items, "books").map((i) => i.id)).toEqual(["placed", "stale"]);
  });

  it("keeps only rated, finished items of the category, at most ten", () => {
    const items = [
      ...Array.from({ length: 12 }, (_, i) => item(`b${i}`)),
      item("film", { category: "movies_and_tv" }),
      item("want", { status: "want" }),
      item("unrated", { rating: null }),
    ];

    const top = topTen(items, "books");
    expect(top).toHaveLength(10);
    expect(top.every((i) => i.id.startsWith("b"))).toBe(true);
  });

  it("lets only 4 and 5 star finished items take part in matches", () => {
    const items = [
      item("five"),
      item("four", { rating: 4 }),
      item("three", { rating: 3 }),
      item("want", { status: "want" }),
    ];

    expect(contendersFor(items, "books")).toEqual([
      { id: "five", rating: 5, rankOrder: null },
      { id: "four", rating: 4, rankOrder: null },
    ]);
  });
});
