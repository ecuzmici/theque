import { describe, expect, it } from "vitest";

import {
  extractHardcoverSlug,
  extractImdbTitleId,
  extractTmdbRef,
  hintsFromUrl,
} from "@/lib/enrichment/url-hints";

describe("hintsFromUrl", () => {
  it("extracts place name from maps.google.com host", () => {
    const hints = hintsFromUrl(
      "https://maps.google.com/maps/place/Test+Cafe/@1,2,3z",
    );
    expect(hints.place_name).toBe("Test Cafe");
  });

  it("extracts Google Maps place name from path", () => {
    const hints = hintsFromUrl(
      "https://www.google.com/maps/place/Caf%C3%A9+de+Flore/@48.8541604,2.3325599,17z",
    );
    expect(hints.place_name).toBe("Café de Flore");
    expect(hints.title_hint).toBe("Café de Flore");
  });

  it("extracts TripAdvisor place name from path", () => {
    const hints = hintsFromUrl(
      "https://www.tripadvisor.com/Restaurant_Review-g187147-d194001-Reviews-Cafe_de_Flore-Paris.html",
    );
    expect(hints.place_name).toBe("Cafe de Flore");
  });
});

describe("extractImdbTitleId", () => {
  it("parses tt id from imdb title url", () => {
    expect(extractImdbTitleId("https://www.imdb.com/title/tt1375666/")).toBe("tt1375666");
  });
});

describe("extractTmdbRef", () => {
  it("reads a movie id with a slug", () => {
    expect(extractTmdbRef("https://www.themoviedb.org/movie/886083-deadstream")).toEqual({
      mediaType: "movie",
      id: "886083",
    });
  });

  it("reads a TV id and a locale prefix", () => {
    expect(extractTmdbRef("https://www.themoviedb.org/tv/1399?language=en-US")).toEqual({
      mediaType: "tv",
      id: "1399",
    });
    expect(extractTmdbRef("https://themoviedb.org/fr-FR/movie/293670")).toEqual({
      mediaType: "movie",
      id: "293670",
    });
  });

  it("returns null for other hosts and paths", () => {
    expect(extractTmdbRef("https://www.themoviedb.org/person/287")).toBeNull();
    expect(extractTmdbRef("https://example.com/movie/886083")).toBeNull();
    expect(extractTmdbRef("not a url")).toBeNull();
  });
});

describe("extractHardcoverSlug", () => {
  it("reads the book slug", () => {
    expect(extractHardcoverSlug("https://hardcover.app/books/a-fire-upon-the-deep")).toBe(
      "a-fire-upon-the-deep",
    );
    expect(extractHardcoverSlug("https://hardcover.app/books/anomalies/editions")).toBe("anomalies");
  });

  it("returns null for other hosts and paths", () => {
    expect(extractHardcoverSlug("https://hardcover.app/authors/vernor-vinge")).toBeNull();
    expect(extractHardcoverSlug("https://example.com/books/anomalies")).toBeNull();
  });
});
