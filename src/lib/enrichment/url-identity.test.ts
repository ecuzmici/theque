import { describe, expect, it } from "vitest";

import { hasCanonicalIdInUrl } from "@/lib/enrichment/url-identity";

describe("hasCanonicalIdInUrl", () => {
  it("is true for IMDb title IDs", () => {
    expect(hasCanonicalIdInUrl("https://www.imdb.com/title/tt0468569/")).toBe(true);
  });
  it("is true for Goodreads book pages", () => {
    expect(hasCanonicalIdInUrl("https://www.goodreads.com/book/show/119322.The_Lord_of_the_Rings")).toBe(true);
  });
  it("is true for Open Library work keys", () => {
    expect(hasCanonicalIdInUrl("https://openlibrary.org/works/OL27448W")).toBe(true);
  });
  it("is true for TMDB numeric ids", () => {
    expect(hasCanonicalIdInUrl("https://www.themoviedb.org/movie/155")).toBe(true);
    expect(hasCanonicalIdInUrl("https://www.themoviedb.org/tv/1396")).toBe(true);
  });
  it("is false for a bare restaurant or venue URL", () => {
    expect(hasCanonicalIdInUrl("https://www.google.com/maps/place/Selva")).toBe(false);
    expect(hasCanonicalIdInUrl("https://selva-lisboa.com/")).toBe(false);
  });
  it("is false for malformed input", () => {
    expect(hasCanonicalIdInUrl("not a url")).toBe(false);
  });
});
