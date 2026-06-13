import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { resolveMovieWithTmdb } = vi.hoisted(() => ({
  resolveMovieWithTmdb: vi.fn(),
}));
vi.mock("@/lib/recommend/resolve/tmdb", () => ({ resolveMovieWithTmdb }));

import { resolveMovie } from "@/lib/enrichment/resolvers/tmdb";

afterEach(() => resolveMovieWithTmdb.mockReset());

describe("resolveMovie", () => {
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
    expect(resolveMovieWithTmdb).toHaveBeenCalledWith({
      title: "The Dark Knight",
      creator: "",
      year: 2008,
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
