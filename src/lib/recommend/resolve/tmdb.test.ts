import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

// SSRF guard is tested separately; here it always passes.
vi.mock("@/lib/enrichment/fetch", () => ({
  assertSafeFetchUrl: vi.fn().mockResolvedValue(undefined),
}));

import { resolveMovieWithTmdb } from "@/lib/recommend/resolve/tmdb";

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
});
