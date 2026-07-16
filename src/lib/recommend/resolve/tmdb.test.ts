import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

// SSRF guard is tested separately; here it always passes.
vi.mock("@/lib/enrichment/fetch", () => ({
  assertSafeFetchUrl: vi.fn().mockResolvedValue(undefined),
}));

import {
  fetchTmdbCardExtras,
  formatWatchLength,
  resolveMovieWithTmdb,
  selectProviders,
  selectTmdbMatch,
  selectTrailerUrl,
} from "@/lib/recommend/resolve/tmdb";

const SEARCH_MOVIE = {
  results: [
    {
      id: 27205,
      media_type: "movie",
      title: "Inception",
      release_date: "2010-07-16",
      poster_path: "/poster.jpg",
      vote_average: 8.4,
      vote_count: 100,
      genre_ids: [28, 878],
    },
  ],
};

const MOVIE_DETAILS = {
  runtime: 148,
  credits: {
    crew: [
      { job: "Producer", name: "Emma Thomas" },
      { job: "Director", name: "Christopher Nolan" },
    ],
  },
};

const SEARCH_TV = {
  results: [
    {
      id: 1396,
      media_type: "tv",
      name: "Breaking Bad",
      first_air_date: "2008-01-20",
      poster_path: "/bb.jpg",
      vote_average: 8.9,
      vote_count: 200,
      genre_ids: [18],
    },
  ],
};

const TV_DETAILS = {
  episode_run_time: [47],
  created_by: [{ name: "Vince Gilligan" }],
  credits: { crew: [] },
};

const FIND_MOVIE = {
  movie_results: [
    {
      id: 27205,
      title: "Inception",
      release_date: "2010-07-16",
      poster_path: "/poster.jpg",
      vote_average: 8.4,
      vote_count: 100,
      genre_ids: [28, 878],
    },
  ],
  tv_results: [],
};

const FIND_TV = {
  movie_results: [],
  tv_results: [
    {
      id: 1396,
      name: "Breaking Bad",
      first_air_date: "2008-01-20",
      poster_path: "/bb.jpg",
      vote_average: 8.9,
      vote_count: 200,
      genre_ids: [18],
    },
  ],
};

/** Stub fetch, routing by URL substring → JSON body. Unmatched URLs 404. */
function stubFetch(routes: Array<[string, unknown]>) {
  const fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input);
    for (const [needle, body] of routes) {
      if (url.includes(needle)) return { ok: true, json: async () => body } as Response;
    }
    return { ok: false, status: 404 } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  process.env.TMDB_API_KEY = "test-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  delete process.env.TMDB_API_KEY;
});

describe("resolveMovieWithTmdb", () => {
  it("returns null without an API key", async () => {
    delete process.env.TMDB_API_KEY;
    const fetchMock = stubFetch([["/search/multi", SEARCH_MOVIE]]);
    expect(await resolveMovieWithTmdb({ title: "Inception", creator: "", year: 2010 })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does NOT fetch credits unless includeCredits is set (recommendation path)", async () => {
    const fetchMock = stubFetch([["/search/multi", SEARCH_MOVIE]]);
    const r = await resolveMovieWithTmdb({ title: "Inception", creator: "", year: 2010 });
    expect(r).not.toBeNull();
    expect(r?.directors).toBeUndefined();
    expect(r?.runtime_minutes).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fills the movie director (crew job=Director) and runtime when includeCredits", async () => {
    const fetchMock = stubFetch([
      ["/search/multi", SEARCH_MOVIE],
      ["/movie/27205", MOVIE_DETAILS],
    ]);
    const r = await resolveMovieWithTmdb(
      { title: "Inception", creator: "", year: 2010 },
      { includeCredits: true },
    );
    expect(r?.directors).toEqual(["Christopher Nolan"]);
    expect(r?.runtime_minutes).toBe(148);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps TV created_by (showrunner) into directors and episode_run_time into runtime", async () => {
    stubFetch([
      ["/search/multi", SEARCH_TV],
      ["/tv/1396", TV_DETAILS],
    ]);
    const r = await resolveMovieWithTmdb(
      { title: "Breaking Bad", creator: "", year: 2008 },
      { includeCredits: true },
    );
    expect(r?.directors).toEqual(["Vince Gilligan"]);
    expect(r?.runtime_minutes).toBe(47);
  });

  it("fails open when the credits fetch errors (movie kept, no crew)", async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/search/multi")) return { ok: true, json: async () => SEARCH_MOVIE } as Response;
      throw new Error("network");
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await resolveMovieWithTmdb(
      { title: "Inception", creator: "", year: 2010 },
      { includeCredits: true },
    );
    expect(r).not.toBeNull();
    expect(r?.external_id).toBe("27205");
    expect(r?.directors == null).toBe(true);
    expect(r?.runtime_minutes == null).toBe(true);
  });

  it("returns null when there is no movie/TV match", async () => {
    stubFetch([["/search/multi", { results: [] }]]);
    const r = await resolveMovieWithTmdb(
      { title: "Nope", creator: "", year: null },
      { includeCredits: true },
    );
    expect(r).toBeNull();
  });

  it("returns null when the only result is a wrong-title match (mismatch guard)", async () => {
    stubFetch([
      [
        "/search/multi",
        { results: [{ id: 99, media_type: "tv", name: "Living Single", first_air_date: "1993-08-22" }] },
      ],
    ]);
    const r = await resolveMovieWithTmdb(
      { title: "Living", creator: "", year: 2022 },
      { includeCredits: true },
    );
    expect(r).toBeNull();
  });

  it("resolves the exact entity by IMDb id via /find, skipping title-search", async () => {
    const fetchMock = stubFetch([
      ["/find/tt1375666", FIND_MOVIE],
      ["/movie/27205", MOVIE_DETAILS],
    ]);
    // A deliberately wrong stored title must be ignored when an id is present.
    const r = await resolveMovieWithTmdb(
      { title: "Mother!", creator: "", year: null },
      { includeCredits: true, imdbId: "tt1375666" },
    );
    expect(r?.external_id).toBe("27205");
    expect(r?.canonical_url).toContain("/movie/27205");
    expect(r?.directors).toEqual(["Christopher Nolan"]);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/find/tt1375666"))).toBe(true);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/search/multi"))).toBe(false);
  });

  it("resolves a TV result by IMDb id via /find", async () => {
    stubFetch([
      ["/find/tt0903747", FIND_TV],
      ["/tv/1396", TV_DETAILS],
    ]);
    const r = await resolveMovieWithTmdb(
      { title: "x", creator: "", year: null },
      { includeCredits: true, imdbId: "tt0903747" },
    );
    expect(r?.external_id).toBe("1396");
    expect(r?.canonical_url).toContain("/tv/1396");
    expect(r?.directors).toEqual(["Vince Gilligan"]);
  });

  it("falls back to title-search when /find returns no movie/tv result", async () => {
    const fetchMock = stubFetch([
      ["/find/tt9999999", { movie_results: [], tv_results: [] }],
      ["/search/multi", SEARCH_MOVIE],
      ["/movie/27205", MOVIE_DETAILS],
    ]);
    const r = await resolveMovieWithTmdb(
      { title: "Inception", creator: "", year: 2010 },
      { includeCredits: true, imdbId: "tt9999999" },
    );
    expect(r?.external_id).toBe("27205");
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/search/multi"))).toBe(true);
  });
});

describe("selectTmdbMatch", () => {
  const livingSingle = { id: 1, media_type: "tv" as const, name: "Living Single", first_air_date: "1993-08-22" };
  const living2022 = { id: 2, media_type: "movie" as const, title: "Living", release_date: "2022-11-04" };

  it("matches exact title + year (happy path)", () => {
    expect(selectTmdbMatch([living2022], { title: "Living", year: 2022 })?.id).toBe(2);
  });

  it("prefers the year-matching result over a same-prefix wrong title", () => {
    expect(selectTmdbMatch([livingSingle, living2022], { title: "Living", year: 2022 })?.id).toBe(2);
  });

  it("rejects a substring title ('Living Single') when no year is given", () => {
    // exact 'Living' wins; 'Living Single' must never be accepted as a match for 'Living'
    expect(selectTmdbMatch([livingSingle, living2022], { title: "Living", year: null })?.id).toBe(2);
    expect(selectTmdbMatch([livingSingle], { title: "Living", year: null })).toBeNull();
  });

  it("disambiguates same-title results by year", () => {
    const cg1990 = { id: 10, media_type: "movie" as const, title: "Common Ground", release_date: "1990-01-22" };
    const cg2023 = { id: 11, media_type: "movie" as const, title: "Common Ground", release_date: "2023-01-23" };
    expect(selectTmdbMatch([cg1990, cg2023], { title: "Common Ground", year: 2023 })?.id).toBe(11);
  });

  it("accepts a subtitle variant when the year matches (token subset)", () => {
    const ron2 = { id: 20, media_type: "movie" as const, title: "Ready or Not 2", release_date: "2025-09-01" };
    expect(
      selectTmdbMatch([ron2], { title: "Ready or Not 2: Here I Come", year: 2025 })?.id,
    ).toBe(20);
  });

  it("returns null when a year is known but no title-match is within ±1 year", () => {
    const wrongEra = { id: 30, media_type: "movie" as const, title: "Mother!", release_date: "1996-05-01" };
    expect(selectTmdbMatch([wrongEra], { title: "Mother!", year: 2017 })).toBeNull();
  });

  it("returns null when no result title-matches", () => {
    const other = { id: 40, media_type: "tv" as const, name: "For All Mankind", first_air_date: "2019-11-01" };
    expect(selectTmdbMatch([other], { title: "Star City", year: null })).toBeNull();
  });

  it("returns null for an ambiguous yearless title (multiple exact matches)", () => {
    // "Mother!" with no stored year and several same-normalized results can't be
    // disambiguated — prefer an honest blank over guessing the most-popular one.
    const motherTr = { id: 50, media_type: "movie" as const, title: "Mother", release_date: "2016-01-01" };
    const mother2017 = { id: 51, media_type: "movie" as const, title: "Mother!", release_date: "2017-09-15" };
    expect(selectTmdbMatch([motherTr, mother2017], { title: "Mother!", year: null })).toBeNull();
  });

  it("still accepts a single yearless title-match", () => {
    const pastLives = { id: 52, media_type: "movie" as const, title: "Past Lives", release_date: "2023-06-02" };
    expect(selectTmdbMatch([pastLives], { title: "Past Lives", year: null })?.id).toBe(52);
  });
});

// ----- Card extras (ADR 0015) -----

const MOVIE_DETAILS_FULL = {
  overview: "A thief who steals corporate secrets through dream-sharing technology.",
  runtime: 148,
  credits: {
    crew: [
      { job: "Producer", name: "Emma Thomas" },
      { job: "Director", name: "Christopher Nolan" },
    ],
  },
  videos: {
    results: [
      { site: "YouTube", type: "Featurette", official: true, key: "feat1" },
      { site: "YouTube", type: "Trailer", official: false, key: "fan1" },
      { site: "YouTube", type: "Trailer", official: true, key: "official1" },
    ],
  },
  "watch/providers": {
    results: {
      US: {
        link: "https://www.themoviedb.org/movie/27205/watch?locale=US",
        flatrate: [
          { provider_name: "Netflix", display_priority: 5 },
          { provider_name: "Max", display_priority: 1 },
        ],
      },
      RO: { link: "https://www.themoviedb.org/movie/27205/watch?locale=RO", flatrate: [] },
    },
  },
};

const TV_DETAILS_FULL = {
  overview: "A chemistry teacher turns to a life of crime.",
  episode_run_time: [47],
  number_of_seasons: 5,
  created_by: [{ name: "Vince Gilligan" }],
  credits: { crew: [] },
  videos: { results: [] },
  "watch/providers": { results: {} },
};

describe("selectTrailerUrl", () => {
  it("prefers the official YouTube trailer", () => {
    expect(selectTrailerUrl(MOVIE_DETAILS_FULL.videos.results)).toBe(
      "https://www.youtube.com/watch?v=official1",
    );
  });

  it("falls back to any trailer, then a teaser", () => {
    expect(
      selectTrailerUrl([
        { site: "YouTube", type: "Teaser", official: true, key: "tease1" },
        { site: "YouTube", type: "Trailer", official: false, key: "fan1" },
      ]),
    ).toBe("https://www.youtube.com/watch?v=fan1");
    expect(
      selectTrailerUrl([{ site: "YouTube", type: "Teaser", official: true, key: "tease1" }]),
    ).toBe("https://www.youtube.com/watch?v=tease1");
  });

  it("ignores non-YouTube videos and returns null when nothing qualifies", () => {
    expect(selectTrailerUrl([{ site: "Vimeo", type: "Trailer", official: true, key: "v1" }])).toBeNull();
    expect(selectTrailerUrl([])).toBeNull();
  });
});

describe("selectProviders", () => {
  const results = MOVIE_DETAILS_FULL["watch/providers"].results;

  it("orders flatrate providers by display priority and keeps the region link", () => {
    const picked = selectProviders(results, "US");
    expect(picked.names).toEqual(["Max", "Netflix"]);
    expect(picked.link).toBe("https://www.themoviedb.org/movie/27205/watch?locale=US");
  });

  it("is case-insensitive on the region code", () => {
    expect(selectProviders(results, "us").names).toEqual(["Max", "Netflix"]);
  });

  it("returns empty names for a region without flatrate entries", () => {
    const picked = selectProviders(results, "RO");
    expect(picked.names).toEqual([]);
    expect(picked.link).toContain("locale=RO");
  });

  it("returns empty for an unknown region or missing payload", () => {
    expect(selectProviders(results, "GB")).toEqual({ names: [], link: null });
    expect(selectProviders(undefined, "US")).toEqual({ names: [], link: null });
  });

  it("caps the provider list at four names", () => {
    const many = {
      US: {
        flatrate: [1, 2, 3, 4, 5, 6].map((n) => ({ provider_name: `P${n}`, display_priority: n })),
      },
    };
    expect(selectProviders(many, "US").names).toEqual(["P1", "P2", "P3", "P4"]);
  });
});

describe("formatWatchLength", () => {
  it("formats movie runtimes", () => {
    expect(formatWatchLength("movie", 148, null)).toBe("2h 28m");
    expect(formatWatchLength("movie", 120, null)).toBe("2h");
    expect(formatWatchLength("movie", 52, null)).toBe("52m");
  });

  it("formats TV season counts", () => {
    expect(formatWatchLength("tv", 47, 1)).toBe("TV · 1 season");
    expect(formatWatchLength("tv", 47, 5)).toBe("TV · 5 seasons");
  });

  it("returns null when the data is missing (caller keeps its fallback)", () => {
    expect(formatWatchLength("movie", null, null)).toBeNull();
    expect(formatWatchLength("tv", 47, null)).toBeNull();
  });
});

describe("fetchTmdbCardExtras", () => {
  it("returns null without an API key", async () => {
    delete process.env.TMDB_API_KEY;
    const fetchMock = stubFetch([["/movie/27205", MOVIE_DETAILS_FULL]]);
    expect(await fetchTmdbCardExtras("movie", "27205", "US")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps overview, director, runtime, trailer, and region providers for a movie", async () => {
    stubFetch([["/movie/27205", MOVIE_DETAILS_FULL]]);
    const extras = await fetchTmdbCardExtras("movie", "27205", "US");
    expect(extras).toEqual({
      overview: "A thief who steals corporate secrets through dream-sharing technology.",
      directors: ["Christopher Nolan"],
      runtime_minutes: 148,
      seasons: null,
      trailer_url: "https://www.youtube.com/watch?v=official1",
      providers: ["Max", "Netflix"],
      providers_link: "https://www.themoviedb.org/movie/27205/watch?locale=US",
    });
  });

  it("maps TV seasons and creator, with empty providers for an uncovered region", async () => {
    stubFetch([["/tv/1396", TV_DETAILS_FULL]]);
    const extras = await fetchTmdbCardExtras("tv", "1396", "US");
    expect(extras?.seasons).toBe(5);
    expect(extras?.directors).toEqual(["Vince Gilligan"]);
    expect(extras?.runtime_minutes).toBe(47);
    expect(extras?.providers).toEqual([]);
    expect(extras?.trailer_url).toBeNull();
  });

  it("fails open (null) on a fetch error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect(await fetchTmdbCardExtras("movie", "27205", "US")).toBeNull();
  });
});

describe("resolveMovieWithTmdb media_type", () => {
  it("keeps the media type on the resolved movie for the later extras fetch", async () => {
    stubFetch([["/search/multi", SEARCH_MOVIE]]);
    const r = await resolveMovieWithTmdb({ title: "Inception", creator: "", year: 2010 });
    expect(r?.media_type).toBe("movie");
  });
});
