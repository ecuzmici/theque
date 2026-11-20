import { describe, expect, it } from "vitest";

import {
  coOccurrence,
  decadeBuckets,
  edgeLift,
  emptySky,
  libraryHref,
  meanRating,
  oftenWith,
  packGrid,
  shrunkRating,
  sortByRating,
  spanningTree,
  tagStats,
  type TasteItem,
} from "./taste-map";

let seq = 0;
function item(over: Partial<TasteItem> = {}): TasteItem {
  seq += 1;
  return {
    id: `i${seq}`,
    category: "books",
    status: "want",
    rating: null,
    year: 2000,
    genres: [],
    moods: [],
    ...over,
  };
}

describe("tagStats", () => {
  it("counts each genre and mood once per item, with the chip label", () => {
    const stats = tagStats([
      item({ genres: ["fantasy", "fantasy"], moods: ["dark"] }),
      item({ genres: ["fantasy"] }),
    ]);
    expect(stats.find((s) => s.key === "fantasy")).toMatchObject({ label: "Fantasy", kind: "genre", count: 2 });
    expect(stats.find((s) => s.key === "dark")).toMatchObject({ label: "Dark", kind: "mood", count: 1 });
  });

  it("drops keys that are not on the fixed lists", () => {
    expect(tagStats([item({ genres: ["made-up"] })])).toEqual([]);
  });

  it("averages ratings of finished items only and counts the backlog", () => {
    const [stat] = tagStats([
      item({ genres: ["horror"], status: "done", rating: 4 }),
      item({ genres: ["horror"], status: "done", rating: 2 }),
      item({ genres: ["horror"], status: "done", rating: null }),
      item({ genres: ["horror"], status: "want", rating: 5 }),
    ]);
    expect(stat).toMatchObject({ count: 4, done: 3, rated: 2, avgRating: 3, backlog: 1 });
  });

  it("sorts by count, largest first", () => {
    const stats = tagStats([item({ genres: ["scifi"] }), item({ genres: ["scifi", "literary"] })]);
    expect(stats.map((s) => s.key)).toEqual(["scifi", "literary"]);
  });
});

describe("libraryHref", () => {
  it("opens the shelf that holds most of the tag's items, with the chip set", () => {
    const [mood] = tagStats([
      item({ moods: ["dark"], category: "movies_and_tv" }),
      item({ moods: ["dark"], category: "movies_and_tv" }),
      item({ moods: ["dark"], category: "books" }),
    ]);
    expect(libraryHref(mood!)).toBe("/library?shelf=watch&mood=dark");
  });

  it("uses the shelf whose genre list holds the key", () => {
    const [genre] = tagStats([item({ genres: ["scifi-fantasy"], category: "books" })]);
    expect(libraryHref(genre!)).toBe("/library?shelf=watch&genre=scifi-fantasy");
  });
});

describe("coOccurrence", () => {
  it("links each pair of tags on one item and counts the shared items", () => {
    const edges = coOccurrence([
      item({ genres: ["horror"], moods: ["dark", "eerie"] }),
      item({ genres: ["horror"], moods: ["dark"] }),
    ]);
    expect(edges).toEqual([
      { a: "dark", b: "horror", weight: 2 },
      { a: "dark", b: "eerie", weight: 1 },
      { a: "eerie", b: "horror", weight: 1 },
    ]);
  });

  it("drops pairs below the minimum weight", () => {
    const edges = coOccurrence(
      [item({ genres: ["horror"], moods: ["dark"] }), item({ genres: ["horror"], moods: ["eerie"] })],
      { minWeight: 2 },
    );
    expect(edges).toEqual([]);
  });
});

describe("decadeBuckets", () => {
  it("puts items in decades and years before the cutoff in one Earlier bucket", () => {
    const buckets = decadeBuckets(
      [item({ year: 1890 }), item({ year: 1962 }), item({ year: 1979 }), item({ year: 2003 })],
      { earliest: 1950 },
    );
    expect(buckets.map((b) => [b.label, b.items.length])).toEqual([
      ["Earlier", 1],
      ["1950s", 0],
      ["1960s", 1],
      ["1970s", 1],
      ["1980s", 0],
      ["1990s", 0],
      ["2000s", 1],
    ]);
    expect(buckets[0]).toMatchObject({ start: null, from: 1890, to: 1949 });
  });

  it("skips items without a year", () => {
    expect(decadeBuckets([item({ year: null })])).toEqual([]);
  });

  it("starts at the first decade with an item when no item is older than the cutoff", () => {
    const buckets = decadeBuckets([item({ year: 2011 }), item({ year: 2024 })], { earliest: 1950 });
    expect(buckets.map((b) => b.label)).toEqual(["2010s", "2020s"]);
  });
});

describe("emptySky", () => {
  const many = (n: number, over: Partial<TasteItem>) => Array.from({ length: n }, () => item(over));

  it("flags a genre you save often but rarely finish", () => {
    const stats = tagStats([
      ...many(9, { genres: ["horror"] }),
      ...many(1, { genres: ["horror"], status: "done", rating: 4 }),
    ]);
    expect(emptySky(stats, 4)).toEqual([expect.objectContaining({ key: "horror", reason: "unfinished" })]);
  });

  it("flags a genre rated 0.75 star or more below your usual, with 3 or more ratings", () => {
    const stats = tagStats(many(3, { genres: ["romance"], status: "done", rating: 3 }));
    expect(emptySky(stats, 4)).toEqual([expect.objectContaining({ key: "romance", reason: "low" })]);
  });

  it("does not flag a 3★ genre when 3★ is your usual", () => {
    const stats = tagStats(many(3, { genres: ["romance"], status: "done", rating: 3 }));
    expect(emptySky(stats, 3.5)).toEqual([]);
  });

  it("needs 3 ratings before it calls a genre low", () => {
    const stats = tagStats([
      ...many(2, { genres: ["romance"], status: "done", rating: 1 }),
      ...many(2, { genres: ["romance"], status: "done", rating: null }),
    ]);
    expect(emptySky(stats, 4)).toEqual([]);
  });

  it("ignores small genres and genres you finish and like", () => {
    const stats = tagStats([
      ...many(2, { genres: ["horror"] }),
      ...many(4, { genres: ["fantasy"], status: "done", rating: 5 }),
    ]);
    expect(emptySky(stats, 4)).toEqual([]);
  });
});

describe("meanRating", () => {
  it("averages the stars of finished, rated items", () => {
    expect(
      meanRating([
        item({ status: "done", rating: 5 }),
        item({ status: "done", rating: 3 }),
        item({ status: "want", rating: 1 }),
        item({ status: "done", rating: null }),
      ]),
    ).toBe(4);
  });

  it("returns null when nothing has a rating", () => {
    expect(meanRating([item()])).toBeNull();
  });
});

describe("sortByRating", () => {
  const many = (n: number, over: Partial<TasteItem>) => Array.from({ length: n }, () => item(over));

  it("ranks a genre with many good ratings above one with two perfect ratings", () => {
    const stats = tagStats([
      ...many(2, { genres: ["nonfiction"], status: "done", rating: 5 }),
      ...many(10, { genres: ["horror"], status: "done", rating: 5 }),
      ...many(2, { genres: ["horror"], status: "done", rating: 4 }),
    ]);
    // Owner mean 3: nonfiction shrinks to (10 + 9) / 5 = 3.8, horror to (58 + 9) / 15 = 4.47.
    expect(sortByRating(stats, 3).map((s) => s.key)).toEqual(["horror", "nonfiction"]);
  });

  it("puts tags without ratings last, largest first", () => {
    const stats = tagStats([
      item({ genres: ["literary"] }),
      ...many(2, { genres: ["classics"] }),
      item({ genres: ["fantasy"], status: "done", rating: 2 }),
    ]);
    expect(sortByRating(stats, 4).map((s) => s.key)).toEqual(["fantasy", "classics", "literary"]);
  });

  it("pulls the average toward your mean with the weight of 3 ratings", () => {
    const [stat] = tagStats(many(3, { genres: ["horror"], status: "done", rating: 5 }));
    expect(shrunkRating(stat!, 3)).toBe(4);
  });
});

describe("oftenWith", () => {
  it("lists 3 tags by lift, drops pairs with 1 shared item, and breaks ties on shared items", () => {
    const items = [
      ...Array.from({ length: 4 }, () => item({ genres: ["horror"], moods: ["eerie", "tense"] })),
      ...Array.from({ length: 3 }, () => item({ genres: ["horror"], moods: ["dark"] })),
      item({ genres: ["horror"], moods: ["funny"] }),
      ...Array.from({ length: 20 }, () => item({ genres: ["fantasy"], moods: ["tense"] })),
    ];
    const result = oftenWith("horror", items);
    // Lift: eerie 3.5 (4 shared), dark 3.5 (3 shared), tense 0.58. Funny shares 1 item only.
    expect(result.map((r) => r.key)).toEqual(["eerie", "dark", "tense"]);
    expect(result[1]).toMatchObject({ label: "Dark", shared: 3 });
  });

  it("returns nothing for a tag on no item", () => {
    expect(oftenWith("horror", [item({ genres: ["fantasy"] })])).toEqual([]);
  });
});

describe("edgeLift", () => {
  it("scores a pair above 1 when the two tags meet more often than chance", () => {
    const counts = new Map([
      ["a", 10],
      ["b", 10],
    ]);
    expect(edgeLift({ a: "a", b: "b", weight: 5 }, counts, 100)).toBe(5);
  });
});

describe("packGrid", () => {
  it("places n dots inside the box without overlap", () => {
    const dots = packGrid(7, { width: 100, height: 40, maxR: 6 });
    expect(dots).toHaveLength(7);
    for (const [i, p] of dots.entries()) {
      expect(p.x - p.r).toBeGreaterThanOrEqual(0);
      expect(p.x + p.r).toBeLessThanOrEqual(100);
      expect(p.y - p.r).toBeGreaterThanOrEqual(0);
      expect(p.y + p.r).toBeLessThanOrEqual(40);
      for (const q of dots.slice(i + 1)) {
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(p.r + q.r - 1e-9);
      }
    }
  });

  it("fills left to right first, so the input order reads across", () => {
    const [first, second] = packGrid(4, { width: 100, height: 20, maxR: 5 });
    expect(second!.x).toBeGreaterThan(first!.x);
    expect(second!.y).toBe(first!.y);
  });
});

describe("spanningTree", () => {
  it("links n points with n - 1 shortest edges", () => {
    const edges = spanningTree([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 1, y: 0 },
    ]);
    expect(edges).toHaveLength(2);
    expect(edges).toContainEqual([0, 2]);
    expect(edges).toContainEqual([2, 1]);
  });

  it("returns no edges for fewer than two points", () => {
    expect(spanningTree([{ x: 0, y: 0 }])).toEqual([]);
  });
});
