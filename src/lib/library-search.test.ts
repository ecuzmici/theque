import { describe, expect, it } from "vitest";

import {
  filterSearchHits,
  libraryHref,
  searchRedirectHref,
  searchScopeForShelf,
  shelfFixesStatus,
} from "./library-search";

describe("searchScopeForShelf", () => {
  it("searches every live status on All", () => {
    expect(searchScopeForShelf("all", null)).toEqual({
      categories: [],
      statuses: ["inbox", "want", "done"],
    });
  });

  it("limits a category shelf to its category", () => {
    expect(searchScopeForShelf("books", null).categories).toEqual(["books"]);
    expect(searchScopeForShelf("watch", null).categories).toEqual(["movies_and_tv"]);
  });

  it("uses every category of the grouped Other shelf", () => {
    expect(searchScopeForShelf("other", null).categories).toEqual([
      "restaurants",
      "products",
      "travel",
      "recipes",
    ]);
  });

  it("leaves inbox out of Articles", () => {
    expect(searchScopeForShelf("read", null).statuses).toEqual(["want", "done"]);
  });

  it("narrows to the status chip", () => {
    expect(searchScopeForShelf("books", "done")).toEqual({
      categories: ["books"],
      statuses: ["done"],
    });
  });

  it("returns no status when the chip conflicts with the shelf", () => {
    expect(searchScopeForShelf("read", "inbox").statuses).toEqual([]);
  });

  it("keeps the shelf status on Inbox and ignores the chip", () => {
    expect(searchScopeForShelf("inbox", "done")).toEqual({ categories: [], statuses: ["inbox"] });
  });
});

describe("shelfFixesStatus", () => {
  it("is true only for shelves with one status", () => {
    expect(shelfFixesStatus("inbox")).toBe(true);
    expect(shelfFixesStatus("forgotten")).toBe(true);
    expect(shelfFixesStatus("all")).toBe(false);
    expect(shelfFixesStatus("books")).toBe(false);
  });
});

describe("filterSearchHits", () => {
  const hits = [
    { id: "1", status: "want" as const, category: "books" as const },
    { id: "2", status: "done" as const, category: "books" as const },
    { id: "3", status: "dismissed" as const, category: "books" as const },
    { id: "4", status: "want" as const, category: "articles" as const },
  ];

  it("drops hits that do not belong on the shelf", () => {
    expect(filterSearchHits(hits, "books", null).map((h) => h.id)).toEqual(["1", "2"]);
  });

  it("applies the status chip", () => {
    expect(filterSearchHits(hits, "all", "done").map((h) => h.id)).toEqual(["2"]);
  });
});

describe("libraryHref", () => {
  it("drops the defaults", () => {
    expect(libraryHref("all", "")).toBe("/library");
    expect(libraryHref("all", "   ")).toBe("/library");
  });

  it("keeps the shelf and the trimmed query", () => {
    expect(libraryHref("books", " le guin ")).toBe("/library?shelf=books&q=le+guin");
    expect(libraryHref("watch", "")).toBe("/library?shelf=watch");
  });
});

describe("searchRedirectHref", () => {
  it("maps the old search query to the library", () => {
    expect(searchRedirectHref("dune")).toBe("/library?q=dune");
    expect(searchRedirectHref(undefined)).toBe("/library");
    expect(searchRedirectHref(["x", "y"])).toBe("/library?q=x");
  });
});
