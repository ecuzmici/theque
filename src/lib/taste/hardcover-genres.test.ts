// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { hardcoverGenreLabels, matchGenreRows } from "./hardcover-genres";

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
