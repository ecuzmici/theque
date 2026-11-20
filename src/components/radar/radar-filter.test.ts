import { describe, expect, it } from "vitest";

import type { RadarEntry } from "@/lib/radar";

import { filterRadar, radarCounts } from "./radar-filter";

function entry(title: string, kind: RadarEntry["kind"], upcoming: boolean): RadarEntry {
  return {
    key: title,
    kind,
    title,
    creator: "Someone",
    date: null,
    release: { label: upcoming ? "Announced" : "Just out", upcoming },
    image: null,
    series: null,
    url: `https://example.com/${title}`,
    source: kind === "book" ? "Hardcover" : "TMDB",
    goodreadsUrl: null,
    because: { id: "1", title: "Loved", rating: 5 },
  };
}

const ENTRIES = [entry("A", "book", true), entry("B", "book", false), entry("C", "film", true), entry("D", "film", false)];

describe("filterRadar", () => {
  it("keeps every entry for all kinds", () => {
    expect(filterRadar(ENTRIES, "all", false).map((e) => e.title)).toEqual(["A", "B", "C", "D"]);
  });

  it("keeps one kind and keeps the order", () => {
    expect(filterRadar(ENTRIES, "film", false).map((e) => e.title)).toEqual(["C", "D"]);
  });

  it("keeps only releases that are not out yet", () => {
    expect(filterRadar(ENTRIES, "book", true).map((e) => e.title)).toEqual(["A"]);
  });
});

describe("radarCounts", () => {
  it("counts each kind under the upcoming toggle", () => {
    expect(radarCounts(ENTRIES, false)).toEqual({ all: 4, book: 2, film: 2 });
    expect(radarCounts(ENTRIES, true)).toEqual({ all: 2, book: 1, film: 1 });
  });
});
