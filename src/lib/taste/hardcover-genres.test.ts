// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { hardcoverGenreLabels, lookupTitles, matchGenreRows } from "./hardcover-genres";

const hcRow = (title: string, author: string, genres: string[], extra = {}) => ({
  id: 1,
  slug: title.toLowerCase().replace(/\s+/g, "-"),
  title,
  cached_contributors: [{ author: { name: author }, contribution: null }],
  cached_tags: { Genre: genres.map((tag) => ({ tag })) },
  ...extra,
});

describe("hardcoverGenreLabels", () => {
  it("returns up to 5 unique labels in order", () => {
    const row = hcRow("X", "Y", ["Fantasy", "Fantasy", "Fiction", "Magic", "Adventure", "Mystery", "Horror"]);
    expect(hardcoverGenreLabels(row)).toEqual(["Fantasy", "Fiction", "Magic", "Adventure", "Mystery"]);
  });

  it("drops a tag below a quarter of the top vote count", () => {
    const row = {
      cached_tags: {
        Genre: [
          { tag: "Fantasy", count: 21 },
          { tag: "Science Fiction", count: 4 },
          { tag: "Adventure", count: 6 },
        ],
      },
    };
    expect(hardcoverGenreLabels(row)).toEqual(["Fantasy", "Adventure"]);
  });

  it("returns no label when the top tag has fewer than 5 votes", () => {
    const row = { cached_tags: { Genre: [{ tag: "Science Fiction", count: 4 }, { tag: "Fantasy", count: 2 }] } };
    expect(hardcoverGenreLabels(row)).toEqual([]);
  });

  it("keeps tags that have no count", () => {
    expect(hardcoverGenreLabels({ cached_tags: { Genre: [{ tag: "Horror" }] } })).toEqual(["Horror"]);
  });

  it("returns an empty list without tags", () => {
    expect(hardcoverGenreLabels({ cached_tags: null })).toEqual([]);
  });
});

describe("matchGenreRows", () => {
  const rows = [hcRow("Piranesi", "Susanna Clarke", ["Fantasy", "Fiction"]), hcRow("Dune", "Frank Herbert", [])];

  it("matches by title and author", () => {
    const out = matchGenreRows(rows, [{ id: "a", title: "Piranesi", authors: ["Susanna Clarke"] }]);
    expect(out.genres.get("a")).toEqual(["Fantasy", "Fiction"]);
  });

  it("rejects a title match with a different author", () => {
    const out = matchGenreRows(rows, [{ id: "a", title: "Piranesi", authors: ["Someone Else"] }]);
    expect(out.genres.size).toBe(0);
    expect(out.misses.get("a")).toBe("no author match");
  });

  it("records a miss for no title match and for a match without genres", () => {
    const out = matchGenreRows(rows, [
      { id: "a", title: "Unknown", authors: [] },
      { id: "b", title: "Dune", authors: ["Frank Herbert"] },
    ]);
    expect(out.misses.get("a")).toBe("no title match");
    expect(out.misses.get("b")).toBe("match has no genres");
  });
});

describe("lookupTitles", () => {
  it("adds the title without a series suffix", () => {
    expect(lookupTitles({ title: "Revelation Space (The Inhibitor Sequence, #1)", authors: [] })).toEqual([
      "Revelation Space (The Inhibitor Sequence, #1)",
      "Revelation Space",
    ]);
    expect(lookupTitles({ title: "A Trade of Blood (Book #3)", authors: [] })[1]).toBe("A Trade of Blood");
  });

  it("keeps a parenthesis that is not a series suffix", () => {
    expect(lookupTitles({ title: "Hope (Revised)", authors: [] })).toEqual(["Hope (Revised)"]);
  });

  it("adds the title without a subtitle only when the book has an author", () => {
    const title = "Into Thin Air: A Personal Account of the Mt. Everest Disaster";
    expect(lookupTitles({ title, authors: ["Jon Krakauer"] })).toEqual([title, "Into Thin Air"]);
    expect(lookupTitles({ title, authors: [] })).toEqual([title]);
  });
});

describe("matchGenreRows with title variants", () => {
  const rows = [hcRow("Revelation Space", "Alastair Reynolds", ["Science fiction"])];

  it("matches a series-suffixed title", () => {
    const out = matchGenreRows(rows, [
      { id: "a", title: "Revelation Space (The Inhibitor Sequence, #1)", authors: ["Alastair Reynolds"] },
    ]);
    expect(out.genres.get("a")).toEqual(["Science fiction"]);
  });

  it("prefers the exact title over a variant", () => {
    const both = [...rows, hcRow("Revelation Space (The Inhibitor Sequence, #1)", "Alastair Reynolds", ["Space opera"])];
    const out = matchGenreRows(both, [
      { id: "a", title: "Revelation Space (The Inhibitor Sequence, #1)", authors: ["Alastair Reynolds"] },
    ]);
    expect(out.genres.get("a")).toEqual(["Space opera"]);
  });
});
