import { describe, expect, it } from "vitest";

import { checkAgainstItems, MAX_WRITES, parseRankWrites } from "./writes";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("parseRankWrites", () => {
  it("accepts a list of ids with a key or null", () => {
    expect(parseRankWrites([{ id: A, rankOrder: 5.5 }, { id: B, rankOrder: null }])).toEqual([
      { id: A, rankOrder: 5.5 },
      { id: B, rankOrder: null },
    ]);
  });

  it("rejects input that is not a list of writes", () => {
    expect(parseRankWrites(null)).toBeNull();
    expect(parseRankWrites({ id: A })).toBeNull();
    expect(parseRankWrites([])).toBeNull();
    expect(parseRankWrites([{ id: "not-a-uuid", rankOrder: 5.5 }])).toBeNull();
    expect(parseRankWrites([{ id: A, rankOrder: "5.5" }])).toBeNull();
    expect(parseRankWrites([{ id: A, rankOrder: Number.POSITIVE_INFINITY }])).toBeNull();
  });

  it("rejects the same id two times and lists that are too long", () => {
    expect(parseRankWrites([{ id: A, rankOrder: 5.5 }, { id: A, rankOrder: null }])).toBeNull();
    const many = Array.from({ length: MAX_WRITES + 1 }, (_, i) => ({
      id: `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111`,
      rankOrder: null,
    }));
    expect(parseRankWrites(many)).toBeNull();
  });
});

describe("checkAgainstItems", () => {
  const items = [
    { id: A, status: "done", category: "books" as const, rating_personal: 5 },
    { id: B, status: "done", category: "movies_and_tv" as const, rating_personal: 4 },
  ];

  it("passes keys inside the band of the item's rating", () => {
    expect(checkAgainstItems([{ id: A, rankOrder: 5.5 }, { id: B, rankOrder: 4.2 }], items)).toBe(true);
  });

  it("always lets a key go back to null", () => {
    expect(checkAgainstItems([{ id: A, rankOrder: null }], items)).toBe(true);
  });

  it("fails a key outside the band, or an item the user cannot see", () => {
    expect(checkAgainstItems([{ id: A, rankOrder: 4.5 }], items)).toBe(false);
    expect(checkAgainstItems([{ id: "33333333-3333-4333-8333-333333333333", rankOrder: null }], items)).toBe(false);
  });

  it("fails an item that is not a finished book or film", () => {
    const want = [{ id: A, status: "want", category: "books" as const, rating_personal: 5 }];
    const article = [{ id: A, status: "done", category: "articles" as const, rating_personal: 5 }];
    expect(checkAgainstItems([{ id: A, rankOrder: 5.5 }], want)).toBe(false);
    expect(checkAgainstItems([{ id: A, rankOrder: 5.5 }], article)).toBe(false);
  });
});
