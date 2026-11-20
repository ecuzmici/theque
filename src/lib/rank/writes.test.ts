import { describe, expect, it } from "vitest";

import { MAX_WRITES, parseRankWrites } from "./writes";

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
