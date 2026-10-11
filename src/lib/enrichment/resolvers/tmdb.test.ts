import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { resolveMovieWithTmdb } = vi.hoisted(() => ({
  resolveMovieWithTmdb: vi.fn(),
}));
vi.mock("@/lib/recommend/resolve/tmdb", () => ({ resolveMovieWithTmdb }));

import { resolveMovie } from "@/lib/enrichment/resolvers/tmdb";

afterEach(() => resolveMovieWithTmdb.mockReset());

describe("resolveMovie", () => {
  it("resolves a themoviedb.org URL by its id when the page gave no title", async () => {
    resolveMovieWithTmdb.mockResolvedValue({
      canonical_url: "https://www.themoviedb.org/movie/886083",
      title: "Deadstream",
      cover_url: "https://image.tmdb.org/t/p/w500/deadstream.jpg",
      confirmed_year: 2022,
      verified_author: null,
    });

    const patch = await resolveMovie({
      canonicalUrl: "https://www.themoviedb.org/movie/886083-deadstream",
      title: null,
      structured: {},
    });

    expect(resolveMovieWithTmdb).toHaveBeenCalledWith(
      { title: "", creator: "", year: null },
      { includeCredits: true, imdbId: null, tmdbRef: { mediaType: "movie", id: "886083" } },
    );
    expect(patch).toMatchObject({
      source: "tmdb",
      title: "Deadstream",
      image_url: "https://image.tmdb.org/t/p/w500/deadstream.jpg",
      structured: { year: 2022, media_type: "movie" },
    });
  });

  it("returns null when title is missing", async () => {
    expect(await resolveMovie({ canonicalUrl: "https://x", title: null, structured: {} })).toBeNull();
    expect(resolveMovieWithTmdb).not.toHaveBeenCalled();
  });

  it("maps a TMDB hit to a patch with image, year, and media_type", async () => {
    resolveMovieWithTmdb.mockResolvedValue({
      canonical_url: "https://www.themoviedb.org/movie/155",
      cover_url: "https://image.tmdb.org/t/p/w500/poster.jpg",
      confirmed_year: 2008,
      verified_author: null,
    });

    const patch = await resolveMovie({
      canonicalUrl: "https://www.imdb.com/title/tt0468569/",
      title: "The Dark Knight",
      structured: { year: 2008 },
    });

    expect(patch).toEqual({
      source: "tmdb",
      image_url: "https://image.tmdb.org/t/p/w500/poster.jpg",
      structured: { year: 2008, media_type: "movie" },
    });
    expect(resolveMovieWithTmdb).toHaveBeenCalledWith(
      { title: "The Dark Knight", creator: "", year: 2008 },
      { includeCredits: true, imdbId: "tt0468569", tmdbRef: null },
    );
  });

  it("passes imdbId null when the canonical URL has no IMDb id", async () => {
    resolveMovieWithTmdb.mockResolvedValue(null);
    await resolveMovie({
      canonicalUrl: "https://letterboxd.com/film/inception/",
      title: "Inception",
      structured: { year: 2010 },
    });
    expect(resolveMovieWithTmdb).toHaveBeenCalledWith(
      { title: "Inception", creator: "", year: 2010 },
      { includeCredits: true, imdbId: null, tmdbRef: null },
    );
  });

  it("maps directors, runtime, genres, and rating into the patch when present", async () => {
    resolveMovieWithTmdb.mockResolvedValue({
      canonical_url: "https://www.themoviedb.org/movie/27205",
      cover_url: null,
      confirmed_year: 2010,
      verified_author: null,
      directors: ["Christopher Nolan"],
      runtime_minutes: 148,
      genres: ["Action", "Sci-Fi"],
      source_rating: 4.2,
    });

    const patch = await resolveMovie({
      canonicalUrl: "https://www.imdb.com/title/tt1375666/",
      title: "Inception",
      structured: { year: 2010 },
    });

    expect(patch?.structured).toEqual({
      year: 2010,
      media_type: "movie",
      directors: ["Christopher Nolan"],
      runtime_minutes: 148,
      genres: ["Action", "Sci-Fi"],
      rating: 4.2,
      rating_scale: 5,
    });
  });

  it("returns null when TMDB has no match", async () => {
    resolveMovieWithTmdb.mockResolvedValue(null);
    expect(
      await resolveMovie({ canonicalUrl: "https://x", title: "Nope", structured: {} }),
    ).toBeNull();
  });

  it("infers tv media_type from the themoviedb URL", async () => {
    resolveMovieWithTmdb.mockResolvedValue({
      canonical_url: "https://www.themoviedb.org/tv/1396",
      cover_url: null,
      confirmed_year: 2008,
      verified_author: null,
    });
    const patch = await resolveMovie({ canonicalUrl: "https://x", title: "Breaking Bad", structured: {} });
    expect(patch?.structured?.media_type).toBe("tv");
    expect(patch?.image_url).toBeUndefined();
  });
});
