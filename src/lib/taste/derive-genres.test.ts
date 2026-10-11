import { describe, expect, it } from "vitest";

import { deriveGenreKeys } from "./derive-genres";

describe("deriveGenreKeys: movies_and_tv", () => {
  const cases: [string, string][] = [
    ["Horror", "horror"],
    ["Thriller", "thriller"],
    ["Mystery", "mystery"],
    ["Crime", "crime"],
    ["Sci-Fi", "scifi-fantasy"],
    ["Science Fiction", "scifi-fantasy"],
    ["Fantasy", "scifi-fantasy"],
    ["Sci-Fi & Fantasy", "scifi-fantasy"],
    ["Comedy", "comedy"],
    ["Action", "action-adventure"],
    ["Adventure", "action-adventure"],
    ["Action & Adventure", "action-adventure"],
    ["War", "war-history"],
    ["History", "war-history"],
    ["War & Politics", "war-history"],
    ["Romance", "romance"],
    ["Documentary", "documentary"],
    ["Animation", "animation"],
    ["Family", "family"],
    ["Kids", "family"],
  ];

  it.each(cases)("maps %s to %s", (label, key) => {
    expect(deriveGenreKeys("movies_and_tv", [label])).toEqual([key]);
  });

  it("maps Drama and the unmapped labels to nothing", () => {
    expect(
      deriveGenreKeys("movies_and_tv", [
        "Drama",
        "Reality",
        "TV Movie",
        "Music",
        "Western",
        "Soap",
        "Talk",
        "News",
      ]),
    ).toEqual([]);
  });

  it("keeps the other keys when Drama is present", () => {
    expect(deriveGenreKeys("movies_and_tv", ["Drama", "Crime", "Thriller"])).toEqual([
      "thriller",
      "crime",
    ]);
  });

  it("merges labels of one key into one result", () => {
    expect(deriveGenreKeys("movies_and_tv", ["Action", "Adventure", "Fantasy", "Sci-Fi"])).toEqual([
      "scifi-fantasy",
      "action-adventure",
    ]);
  });
});

describe("deriveGenreKeys: books", () => {
  const cases: [string, string[]][] = [
    ["Fantasy", ["fantasy"]],
    ["Urban Fantasy", ["fantasy"]],
    ["Magic", ["fantasy"]],
    ["dragons", ["fantasy"]],
    ["Science Fiction", ["scifi"]],
    ["Sci-fi", ["scifi"]],
    ["Space", ["scifi"]],
    ["Aliens", ["scifi"]],
    ["Dystopian", ["scifi"]],
    ["Dystopia", ["scifi"]],
    ["Post-Apocalyptic", ["scifi"]],
    ["Time Travel", ["scifi"]],
    ["Mystery", ["mystery-crime"]],
    ["Crime", ["mystery-crime"]],
    ["Murder", ["mystery-crime"]],
    ["Thriller", ["thriller"]],
    ["Thrillers", ["thriller"]],
    ["Conspiracies", ["thriller"]],
    ["Horror", ["horror"]],
    ["Literary Fiction", ["literary"]],
    ["Literature", ["literary"]],
    ["World Literature", ["literary"]],
    ["Contemporary", ["literary"]],
    ["Magical Realism", ["literary"]],
    ["Historical Fiction", ["historical"]],
    ["Romance", ["romance"]],
    ["Classics", ["classics"]],
    ["Young Adult", ["young-adult"]],
    ["Nonfiction", ["nonfiction"]],
    ["History", ["nonfiction"]],
    ["Science", ["nonfiction"]],
    ["Essays", ["nonfiction"]],
    ["Philosophy", ["nonfiction"]],
    ["Religion", ["nonfiction"]],
    ["social science", ["nonfiction"]],
    ["Medical", ["nonfiction"]],
    ["Memoir", ["memoir-biography"]],
    ["Biography", ["memoir-biography"]],
    ["Biography & Autobiography", ["memoir-biography"]],
    ["Science Fiction & Fantasy", ["fantasy", "scifi"]],
  ];

  it.each(cases)("maps %s to %j", (label, keys) => {
    expect(deriveGenreKeys("books", [label])).toEqual(keys);
  });

  it("maps the unmapped labels to nothing", () => {
    expect(
      deriveGenreKeys("books", [
        "Fiction",
        "Novels",
        "adult",
        "Electronic books",
        "LGBTQ",
        "Queer",
        "Adventure",
        "War",
        "Humor",
      ]),
    ).toEqual([]);
  });

  it("splits a label on ' / ' and matches each part", () => {
    expect(deriveGenreKeys("books", ["Fiction / Fantasy / Epic"])).toEqual(["fantasy"]);
    expect(deriveGenreKeys("books", ["Fiction / Science Fiction / Dystopian"])).toEqual(["scifi"]);
    expect(deriveGenreKeys("books", ["Fiction / Mystery / Thriller"])).toEqual([
      "mystery-crime",
      "thriller",
    ]);
  });

  it("ignores case and surrounding spaces", () => {
    expect(deriveGenreKeys("books", ["  DYSTOPIAN "])).toEqual(["scifi"]);
    expect(deriveGenreKeys("books", ["fiction /  fantasy "])).toEqual(["fantasy"]);
  });

  it("removes duplicates and follows the list order", () => {
    expect(deriveGenreKeys("books", ["Dystopia", "Dystopian", "Space", "Fantasy"])).toEqual([
      "fantasy",
      "scifi",
    ]);
  });

  it("does not match Object.prototype names", () => {
    expect(deriveGenreKeys("books", ["constructor", "__proto__", "toString"])).toEqual([]);
  });
});

describe("deriveGenreKeys: other input", () => {
  it("returns no keys for other categories", () => {
    expect(deriveGenreKeys("articles", ["Horror"])).toEqual([]);
    expect(deriveGenreKeys("recipes", ["Romance"])).toEqual([]);
    expect(deriveGenreKeys(null, ["Horror"])).toEqual([]);
    expect(deriveGenreKeys(undefined, ["Horror"])).toEqual([]);
  });

  it("returns no keys for input that is not an array", () => {
    expect(deriveGenreKeys("books", "Fantasy")).toEqual([]);
    expect(deriveGenreKeys("books", null)).toEqual([]);
    expect(deriveGenreKeys("books", undefined)).toEqual([]);
    expect(deriveGenreKeys("books", { 0: "Fantasy" })).toEqual([]);
  });

  it("skips entries that are not strings", () => {
    expect(deriveGenreKeys("books", [1, null, {}, "Fantasy"])).toEqual(["fantasy"]);
  });
});
