import { describe, expect, it } from "vitest";

import {
  coOccurrence,
  decadeBuckets,
  edgeLift,
  emptySky,
  layoutGraph,
  libraryHref,
  packGrid,
  spanningTree,
  strongestEdges,
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
    expect(emptySky(stats)).toEqual([expect.objectContaining({ key: "horror", reason: "unfinished" })]);
  });

  it("flags a genre you finish but rate low", () => {
    const stats = tagStats(many(3, { genres: ["romance"], status: "done", rating: 2 }));
    expect(emptySky(stats)).toEqual([expect.objectContaining({ key: "romance", reason: "low" })]);
  });

  it("ignores small genres and genres you finish and like", () => {
    const stats = tagStats([
      ...many(2, { genres: ["horror"] }),
      ...many(4, { genres: ["fantasy"], status: "done", rating: 5 }),
    ]);
    expect(emptySky(stats)).toEqual([]);
  });
});

describe("layoutGraph", () => {
  const nodes = ["a", "b", "c", "d", "e", "f"].map((key) => ({ key, r: 10 }));
  const edges = [
    { a: "a", b: "b", weight: 5 },
    { a: "c", b: "d", weight: 5 },
  ];

  it("returns the same positions on each run", () => {
    expect(layoutGraph(nodes, edges, { width: 400, height: 300 })).toEqual(
      layoutGraph(nodes, edges, { width: 400, height: 300 }),
    );
  });

  it("keeps each node and its radius inside the box", () => {
    const placed = layoutGraph(nodes, edges, { width: 400, height: 300 });
    for (const node of placed) {
      expect(node.x - node.r).toBeGreaterThanOrEqual(0);
      expect(node.x + node.r).toBeLessThanOrEqual(400);
      expect(node.y - node.r).toBeGreaterThanOrEqual(0);
      expect(node.y + node.r).toBeLessThanOrEqual(300);
    }
  });

  it("pulls linked nodes closer than unlinked nodes", () => {
    const placed = new Map(layoutGraph(nodes, edges, { width: 400, height: 300 }).map((n) => [n.key, n]));
    const dist = (p: string, q: string) =>
      Math.hypot(placed.get(p)!.x - placed.get(q)!.x, placed.get(p)!.y - placed.get(q)!.y);
    expect(dist("a", "b")).toBeLessThan(dist("a", "e"));
    expect(dist("c", "d")).toBeLessThan(dist("c", "f"));
  });
});

describe("strongestEdges", () => {
  it("keeps the heaviest edges of each kept node and drops edges to other nodes", () => {
    const edges = [
      { a: "a", b: "b", weight: 9 },
      { a: "a", b: "c", weight: 5 },
      { a: "a", b: "d", weight: 1 },
      { a: "c", b: "x", weight: 8 },
    ];
    expect(strongestEdges(edges, ["a", "b", "c", "d"], 2)).toEqual([
      { a: "a", b: "b", weight: 9 },
      { a: "a", b: "c", weight: 5 },
      { a: "a", b: "d", weight: 1 },
    ]);
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

  it("lets strongestEdges rank by a custom score", () => {
    const edges = [
      { a: "a", b: "b", weight: 9 },
      { a: "a", b: "c", weight: 2 },
    ];
    const score = (e: { b: string }) => (e.b === "c" ? 10 : 1);
    expect(strongestEdges(edges, ["a", "b", "c"], 1, score)).toEqual(edges);
    expect(strongestEdges(edges, ["a"], 1, score)).toEqual([]);
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
