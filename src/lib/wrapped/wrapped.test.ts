import { describe, expect, it } from "vitest";

import {
  computeWrapped,
  finishedYears,
  planSlides,
  resolveWrappedYear,
  type WrappedSourceItem,
} from "./wrapped";

let seq = 0;
function item(overrides: Partial<WrappedSourceItem> = {}): WrappedSourceItem {
  seq += 1;
  return {
    id: `item-${seq}`,
    title: `Item ${seq}`,
    category: "books",
    status: "done",
    rating: null,
    verdict: null,
    doneAt: "2026-03-10T12:00:00.000Z",
    color: null,
    cover: null,
    genres: [],
    moods: [],
    authors: [],
    pages: null,
    runtime: null,
    ...overrides,
  };
}

describe("finishedYears", () => {
  it("lists the years that have finished items, newest first", () => {
    const items = [
      item({ doneAt: "2024-05-01T10:00:00Z" }),
      item({ doneAt: "2026-01-02T10:00:00Z" }),
      item({ doneAt: "2026-07-02T10:00:00Z" }),
      item({ status: "want", doneAt: null }),
    ];
    expect(finishedYears(items)).toEqual([2026, 2024]);
  });

  it("puts the year boundary at UTC midnight unless you give a time zone", () => {
    const items = [item({ doneAt: "2025-12-31T23:30:00Z" })];
    expect(finishedYears(items)).toEqual([2025]);
    expect(finishedYears(items, "Europe/Paris")).toEqual([2026]);
  });
});

describe("computeWrapped", () => {
  const now = new Date("2026-11-20T09:00:00Z");

  it("counts the items finished in the year, per category, largest first", () => {
    const items = [
      item({ category: "books" }),
      item({ category: "books" }),
      item({ category: "movies_and_tv" }),
      item({ category: "books", doneAt: "2025-06-01T00:00:00Z" }),
      item({ category: "articles", status: "want", doneAt: null }),
    ];
    const wrapped = computeWrapped(items, 2026, { now });
    expect(wrapped.total).toBe(3);
    expect(wrapped.categories).toEqual([
      { category: "books", label: "Books", count: 2 },
      { category: "movies_and_tv", label: "Movies & TV", count: 1 },
    ]);
  });

  it("counts finishes without a category in an Other bucket, so the parts add up to the total", () => {
    const items = [item({ category: "books" }), item({ category: "books" }), item({ category: null })];
    const wrapped = computeWrapped(items, 2026, { now });
    expect(wrapped.total).toBe(3);
    expect(wrapped.categories).toEqual([
      { category: "books", label: "Books", count: 2 },
      { category: null, label: "Other", count: 1 },
    ]);
  });

  it("marks the current year as partial and says up to which day it counts", () => {
    expect(computeWrapped([], 2026, { now })).toMatchObject({ partial: true, throughLabel: "20 November" });
    expect(computeWrapped([], 2025, { now })).toMatchObject({ partial: false, throughLabel: null });
  });

  it("counts the days in the span: up to today for the current year, the full year before", () => {
    expect(computeWrapped([], 2026, { now }).days).toBe(324);
    expect(computeWrapped([], 2025, { now }).days).toBe(365);
    expect(computeWrapped([], 2024, { now }).days).toBe(366);
  });

  it("adds up the pages of finished books and says how many books had a page count", () => {
    const longest = item({ title: "Swan Song", pages: 880 });
    const items = [
      item({ pages: 320 }),
      longest,
      item({ pages: null }),
      item({ category: "articles", pages: 12 }),
      item({ pages: 500, doneAt: "2025-02-01T00:00:00Z" }),
    ];
    expect(computeWrapped(items, 2026, { now }).reading).toEqual({
      books: 3,
      pages: 1200,
      booksWithPages: 2,
      longest: { id: longest.id, title: "Swan Song", pages: 880, cover: null, color: null },
    });
  });

  it("adds up the runtime of finished films and shows as whole hours", () => {
    const dune = item({ category: "movies_and_tv", title: "Dune: Part Two", runtime: 166 });
    const items = [item({ category: "movies_and_tv", runtime: 104 }), dune, item({ category: "movies_and_tv" })];
    expect(computeWrapped(items, 2026, { now }).watching).toEqual({
      titles: 3,
      minutes: 270,
      hours: 5,
      titlesWithRuntime: 2,
      longest: { id: dune.id, title: "Dune: Part Two", minutes: 166, cover: null, color: null },
    });
  });

  it("has no longest book or title when no item has a length", () => {
    const wrapped = computeWrapped([item(), item({ category: "movies_and_tv" })], 2026, { now });
    expect(wrapped.reading.longest).toBeNull();
    expect(wrapped.watching.longest).toBeNull();
    expect(wrapped.watching.hours).toBe(0);
  });

  it("shows the five-star finishes as favourites, newest first, up to nine", () => {
    const fives = Array.from({ length: 11 }, (_, i) =>
      item({ rating: 5, doneAt: `2026-02-${String(i + 10).padStart(2, "0")}T00:00:00Z` }),
    );
    const items = [item({ rating: 4 }), ...fives];
    const { favourites } = computeWrapped(items, 2026, { now });
    expect(favourites?.stars).toBe(5);
    expect(favourites?.count).toBe(11);
    expect(favourites?.items.map((f) => f.id)).toEqual(fives.slice(2).reverse().map((f) => f.id));
  });

  it("falls back to four-star finishes, and has no favourites below four stars", () => {
    const four = item({ rating: 4 });
    expect(computeWrapped([four, item({ rating: 3 })], 2026, { now }).favourites).toMatchObject({
      stars: 4,
      count: 1,
      items: [{ id: four.id }],
    });
    expect(computeWrapped([item({ rating: 3 })], 2026, { now }).favourites).toBeNull();
  });

  it("quotes the verdict of the best-rated finish that has one", () => {
    const items = [
      item({ rating: 5, verdict: "  " }),
      item({ rating: 4, verdict: "Good fun." }),
      item({ title: "The Tainted Cup", rating: 5, verdict: "Perfect mix of fantasy and mystery." }),
    ];
    expect(computeWrapped(items, 2026, { now }).verdict).toMatchObject({
      title: "The Tainted Cup",
      rating: 5,
      text: "Perfect mix of fantasy and mystery.",
    });
  });

  it("prefers the longer verdict when two finishes share the top rating", () => {
    const items = [
      item({ rating: 5, verdict: "Dark." }),
      item({ rating: 5, verdict: "Great time travel, and dark in the best way." }),
    ];
    expect(computeWrapped(items, 2026, { now }).verdict?.text).toBe("Great time travel, and dark in the best way.");
  });

  it("skips verdicts below four stars and verdicts too long for a slide", () => {
    const items = [
      item({ rating: 3, verdict: "Fine." }),
      item({ rating: 5, verdict: "x".repeat(281) }),
    ];
    expect(computeWrapped(items, 2026, { now }).verdict).toBeNull();
  });

  it("counts finishes per month and picks the busiest month, earliest on a tie", () => {
    const items = [
      item({ doneAt: "2026-01-05T00:00:00Z" }),
      item({ doneAt: "2026-03-05T00:00:00Z" }),
      item({ doneAt: "2026-03-25T00:00:00Z" }),
      item({ doneAt: "2026-06-01T00:00:00Z" }),
      item({ doneAt: "2026-06-02T00:00:00Z" }),
    ];
    const { months, busiestMonth } = computeWrapped(items, 2026, { now });
    expect(months).toEqual([1, 0, 2, 0, 0, 2, 0, 0, 0, 0, 0, 0]);
    expect(busiestMonth).toEqual({ month: 2, name: "March", count: 2 });
    expect(computeWrapped([], 2026, { now }).busiestMonth).toBeNull();
  });

  it("names the author of the year when one author has two or more finished books", () => {
    const items = [
      item({ authors: ["John Scalzi"] }),
      item({ authors: ["John Scalzi", "Someone Else"] }),
      item({ authors: ["Pierce Brown"] }),
      item({ category: "movies_and_tv", authors: ["Pierce Brown"] }),
    ];
    expect(computeWrapped(items, 2026, { now }).topAuthor).toMatchObject({ name: "John Scalzi", count: 2 });
    expect(computeWrapped([item({ authors: ["A"] }), item({ authors: ["B"] })], 2026, { now }).topAuthor).toBeNull();
  });

  it("sorts the cover colours around the colour wheel and names the most common hue", () => {
    const items = [
      item({ color: "#2050c0" }),
      item({ color: "#c02020" }),
      item({ color: "#d03030" }),
      item({ color: "#808080" }),
      item({ color: null }),
    ];
    const { palette } = computeWrapped(items, 2026, { now });
    expect(palette.colors).toEqual(["#c02020", "#d03030", "#2050c0", "#808080"]);
    expect(palette.name).toBe("red");
  });

  it("names the top genre and mood only when two or more finishes share it", () => {
    const items = [
      item({ genres: ["scifi"], moods: ["tense"] }),
      item({ genres: ["scifi", "fantasy"], moods: ["cozy"] }),
    ];
    expect(computeWrapped(items, 2026, { now }).taste).toEqual({
      genre: { key: "scifi", label: "Sci-Fi", count: 2 },
      mood: null,
    });
  });
});

describe("resolveWrappedYear", () => {
  it("opens the current year when the URL has no year", () => {
    expect(resolveWrappedYear(undefined, [2025], 2026)).toBe(2026);
  });

  it("opens an earlier year only when it has finished items", () => {
    expect(resolveWrappedYear("2025", [2026, 2025], 2026)).toBe(2025);
    expect(resolveWrappedYear("2024", [2026, 2025], 2026)).toBeNull();
    expect(resolveWrappedYear("2026", [], 2026)).toBe(2026);
  });

  it("rejects a year that is not a plain number", () => {
    expect(resolveWrappedYear("20x5", [2025], 2026)).toBeNull();
    expect(resolveWrappedYear(["2025", "2024"], [2025], 2026)).toBeNull();
  });
});

describe("planSlides", () => {
  const now = new Date("2026-11-20T09:00:00Z");

  it("shows one empty slide for a year with no finishes", () => {
    expect(planSlides(computeWrapped([], 2026, { now }))).toEqual(["empty"]);
  });

  it("keeps a year with one finish short: no chart needs a second item", () => {
    const one = [item({ pages: 300, rating: 5, verdict: "Loved it.", color: "#c02020" })];
    expect(planSlides(computeWrapped(one, 2026, { now }))).toEqual([
      "intro",
      "pages",
      "favourites",
      "verdict",
      "outro",
    ]);
  });

  it("shows every slide for a full year", () => {
    const items = [
      item({ authors: ["A"], pages: 300, rating: 5, genres: ["scifi"], color: "#c02020", doneAt: "2026-01-02T00:00:00Z" }),
      item({ authors: ["A"], pages: 500, verdict: "Great.", rating: 5, genres: ["scifi"], color: "#2050c0" }),
      item({ category: "movies_and_tv", runtime: 120, color: "#20c050", doneAt: "2026-05-02T00:00:00Z" }),
    ];
    expect(planSlides(computeWrapped(items, 2026, { now }))).toEqual([
      "intro",
      "split",
      "pages",
      "hours",
      "favourites",
      "author",
      "longest",
      "months",
      "taste",
      "verdict",
      "colours",
      "outro",
    ]);
  });
});
