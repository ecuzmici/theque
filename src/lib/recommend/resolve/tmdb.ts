/**
 * TMDB resolver for movie/TV recommendations (F2).
 *
 * Requires TMDB_API_KEY env var. Gated via isWatchRecommendEnabled().
 * Fetches through the B4 SSRF guard (assertSafeFetchUrl).
 */

import "server-only";

import { assertSafeFetchUrl } from "@/lib/enrichment/fetch";
import type { LlmCandidate } from "@/lib/recommend/recommend-types";

export type ResolvedMovie = {
  canonical_url: string;
  cover_url: string | null;
  confirmed_year: number | null;
  /** TMDB movie or TV id as a string. */
  external_id: string;
  /** Always null for movies/TV — TMDB multi-search doesn't return a director.
   * The director is fetched separately via `includeCredits` (see `directors`);
   * this field is kept for a uniform shape with ResolvedBook. */
  verified_author: string | null;
  source_rating?: number | null;
  rating_count?: string | null;
  length?: string | null;
  genres?: string[];
  /** Crew: movie directors (crew job=Director) or TV creators (created_by).
   * Only populated when `includeCredits` is set and the extra fetch succeeds. */
  directors?: string[] | null;
  /** Movie runtime or TV per-episode runtime. Only populated with `includeCredits`. */
  runtime_minutes?: number | null;
  /** Whether the match is a movie or a TV series — needed to fetch details later. */
  media_type: "movie" | "tv";
};

type TmdbCrewMember = { job?: string; name?: string };
type TmdbVideo = { site?: string; type?: string; official?: boolean; key?: string };
type TmdbProviderEntry = { provider_name?: string; display_priority?: number };
type TmdbProvidersRegion = { link?: string; flatrate?: TmdbProviderEntry[] };
type TmdbDetails = {
  overview?: string;
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  created_by?: Array<{ name?: string }>;
  credits?: { crew?: TmdbCrewMember[] };
  videos?: { results?: TmdbVideo[] };
  "watch/providers"?: { results?: Record<string, TmdbProvidersRegion> };
};

/** Card-facing extras for one resolved movie/TV title (ADR 0015). */
export type TmdbCardExtras = {
  overview: string | null;
  directors: string[];
  runtime_minutes: number | null;
  /** TV only; null for movies. */
  seasons: number | null;
  trailer_url: string | null;
  /** Flatrate (subscription) provider names for the requested region. */
  providers: string[];
  /** TMDB watch page for the region — carries the JustWatch attribution. */
  providers_link: string | null;
};

type TmdbResult = {
  id: number;
  media_type: "movie" | "tv" | "person";
  title?: string;         // movie
  name?: string;          // tv
  release_date?: string;  // movie: YYYY-MM-DD
  first_air_date?: string; // tv: YYYY-MM-DD
  poster_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  genre_ids?: number[];
};

const TMDB_GENRE_NAMES: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Sci-Fi", 10770: "TV Movie",
  53: "Thriller", 10752: "War", 37: "Western",
  10759: "Action & Adventure", 10762: "Kids", 10763: "News",
  10764: "Reality", 10765: "Sci-Fi & Fantasy", 10766: "Soap",
  10767: "Talk", 10768: "War & Politics",
};

type TmdbSearchResponse = {
  results: TmdbResult[];
};

const TMDB_SEARCH_BASE = "https://api.themoviedb.org/3/search/multi";
const TMDB_FIND_BASE = "https://api.themoviedb.org/3/find";
const TMDB_DETAILS_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const TIMEOUT_MS = 8000;

/** Max provider names shown on a card. */
const MAX_PROVIDERS = 4;

/**
 * Fetch the details payload for a resolved title in one request:
 * `append_to_response=credits,videos,watch/providers` (ADR 0015). Fails open
 * (returns null) on any error so a details hiccup never sinks an
 * otherwise-good resolution.
 */
async function fetchTmdbDetails(
  apiKey: string,
  mediaType: "movie" | "tv",
  id: number | string,
): Promise<TmdbDetails | null> {
  const params = new URLSearchParams({
    api_key: apiKey,
    append_to_response: "credits,videos,watch/providers",
  });
  const url = new URL(
    `${TMDB_DETAILS_BASE}/${mediaType}/${encodeURIComponent(String(id))}?${params.toString()}`,
  );

  try {
    await assertSafeFetchUrl(url);
  } catch {
    return null;
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as TmdbDetails;
  } catch {
    return null;
  }
}

/** Movies → crew job=Director; TV → created_by (showrunner). */
function parseDirectors(body: TmdbDetails, mediaType: "movie" | "tv"): string[] {
  return mediaType === "tv"
    ? (body.created_by ?? [])
        .map((c) => c?.name)
        .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
    : (body.credits?.crew ?? [])
        .filter((c) => c?.job === "Director")
        .map((c) => c?.name)
        .filter((n): n is string => typeof n === "string" && n.trim().length > 0);
}

function parseRuntimeMinutes(body: TmdbDetails, mediaType: "movie" | "tv"): number | null {
  const raw =
    mediaType === "tv"
      ? (Array.isArray(body.episode_run_time) ? body.episode_run_time[0] ?? null : null)
      : (typeof body.runtime === "number" ? body.runtime : null);
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : null;
}

/**
 * Pick the best YouTube trailer from a videos list: official trailer, then
 * any trailer, then a teaser. Null when nothing qualifies.
 */
export function selectTrailerUrl(videos: TmdbVideo[]): string | null {
  const youtube = videos.filter(
    (v) => v?.site === "YouTube" && typeof v.key === "string" && v.key.length > 0,
  );
  const pick =
    youtube.find((v) => v.type === "Trailer" && v.official === true) ??
    youtube.find((v) => v.type === "Trailer") ??
    youtube.find((v) => v.type === "Teaser") ??
    null;
  return pick ? `https://www.youtube.com/watch?v=${pick.key}` : null;
}

/**
 * Pick flatrate (subscription) provider names for a region from the
 * JustWatch-sourced `watch/providers` payload, ordered by display priority.
 */
export function selectProviders(
  results: Record<string, TmdbProvidersRegion> | undefined,
  region: string,
): { names: string[]; link: string | null } {
  const entry = results?.[region.toUpperCase()];
  if (!entry) return { names: [], link: null };
  const names = (entry.flatrate ?? [])
    .slice()
    .sort((a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999))
    .map((p) => p.provider_name)
    .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
    .slice(0, MAX_PROVIDERS);
  return {
    names,
    link: typeof entry.link === "string" && entry.link ? entry.link : null,
  };
}

/**
 * Human-readable length for a watch card: "1h 58m" for movies,
 * "TV · 2 seasons" for series. Null when the data is missing, so callers
 * keep their existing fallback ("Film" / "TV series").
 */
export function formatWatchLength(
  mediaType: "movie" | "tv",
  runtimeMinutes: number | null,
  seasons: number | null,
): string | null {
  if (mediaType === "movie" && runtimeMinutes) {
    const hours = Math.floor(runtimeMinutes / 60);
    const minutes = runtimeMinutes % 60;
    if (hours === 0) return `${minutes}m`;
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }
  if (mediaType === "tv" && seasons) {
    return seasons === 1 ? "TV · 1 season" : `TV · ${seasons} seasons`;
  }
  return null;
}

/**
 * Card extras for the recommendation deck (ADR 0015): official overview,
 * crew, runtime/seasons, trailer, and streaming providers for one region —
 * all from the single details request. Fails open (returns null) when
 * TMDB_API_KEY is absent or the fetch fails.
 */
export async function fetchTmdbCardExtras(
  mediaType: "movie" | "tv",
  id: number | string,
  region: string,
): Promise<TmdbCardExtras | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;

  const body = await fetchTmdbDetails(apiKey, mediaType, id);
  if (!body) return null;

  const providers = selectProviders(body["watch/providers"]?.results, region);
  const overview = typeof body.overview === "string" && body.overview.trim() ? body.overview.trim() : null;
  const seasons =
    mediaType === "tv" &&
    typeof body.number_of_seasons === "number" &&
    Number.isInteger(body.number_of_seasons) &&
    body.number_of_seasons > 0
      ? body.number_of_seasons
      : null;

  return {
    overview,
    directors: parseDirectors(body, mediaType),
    runtime_minutes: parseRuntimeMinutes(body, mediaType),
    seasons,
    trailer_url: selectTrailerUrl(body.videos?.results ?? []),
    providers: providers.names,
    providers_link: providers.link,
  };
}

type TmdbMatch = TmdbResult & { media_type: "movie" | "tv" };

/** Normalize a title for comparison: lowercase, de-accent, alphanumeric-only,
 *  collapse spaces, drop a single leading article. */
function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining marks before the alphanumeric pass
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "")
    .replace(/\s+/g, " ")
    .trim();
}

function resultYear(result: TmdbResult): number | null {
  const date = result.release_date ?? result.first_air_date ?? null;
  if (!date) return null;
  const year = Number.parseInt(date.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function yearWithinOne(result: TmdbResult, candidateYear: number): boolean {
  const ry = resultYear(result);
  return ry !== null && Math.abs(ry - candidateYear) <= 1;
}

/** Whether a result is a confident title match. Exact normalized equality always
 *  qualifies; a token-subset (subtitle variance) qualifies only with a matching
 *  year, so e.g. "Living" never silently matches "Living Single". */
function titleMatches(candidateTitle: string, candidateYear: number | null, result: TmdbResult): boolean {
  const query = normalizeTitle(candidateTitle);
  const target = normalizeTitle(result.title ?? result.name ?? "");
  if (!query || !target) return false;
  if (query === target) return true;
  if (candidateYear !== null && yearWithinOne(result, candidateYear)) {
    const queryTokens = query.split(" ");
    const targetTokens = target.split(" ");
    const [shorter, longer] =
      queryTokens.length <= targetTokens.length ? [queryTokens, targetTokens] : [targetTokens, queryTokens];
    const longerSet = new Set(longer);
    if (shorter.every((token) => longerSet.has(token))) return true;
  }
  return false;
}

/**
 * Choose the best movie/TV result for a candidate, or null when none is a
 * confident match. TMDB multi-search ignores the `year` param and returns the
 * most-popular title first, so an unverified `results[0]` silently picks the
 * wrong entity for generic titles. We require a title match and, when a year is
 * known, agreement within ±1 year — preferring an honest blank over a confident
 * mismatch (ADR 0011).
 */
export function selectTmdbMatch(
  results: TmdbMatch[],
  candidate: { title: string; year: number | null },
): TmdbMatch | null {
  const matches = results.filter((r) => titleMatches(candidate.title, candidate.year, r));
  if (matches.length === 0) return null;
  if (candidate.year !== null) {
    return matches.find((r) => yearWithinOne(r, candidate.year as number)) ?? null;
  }
  // Year unknown: only accept an unambiguous single title-match. Several
  // same-normalized results (e.g. "Mother") can't be disambiguated without a
  // year, so prefer an honest blank over the most-popular guess (ADR 0011).
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Resolve a TMDB movie/TV by a canonical IMDb id. An exact id removes all
 * title ambiguity, so it is preferred over title-search when available. Movie
 * results win over TV. Fails open (returns null) on any error.
 */
async function findTmdbByImdbId(apiKey: string, imdbId: string): Promise<TmdbMatch | null> {
  const params = new URLSearchParams({ api_key: apiKey, external_source: "imdb_id" });
  const url = new URL(`${TMDB_FIND_BASE}/${encodeURIComponent(imdbId)}?${params.toString()}`);

  try {
    await assertSafeFetchUrl(url);
  } catch {
    return null;
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      movie_results?: Array<Omit<TmdbResult, "media_type">>;
      tv_results?: Array<Omit<TmdbResult, "media_type">>;
    };
    const movie = body.movie_results?.[0];
    if (movie) return { ...movie, media_type: "movie" };
    const tv = body.tv_results?.[0];
    if (tv) return { ...tv, media_type: "tv" };
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve a TMDB movie/TV by title (the fuzzy fallback). /search/multi ignores a
 * `year` param, so disambiguation happens client-side in selectTmdbMatch.
 */
async function searchTmdbByTitle(
  apiKey: string,
  candidate: Pick<LlmCandidate, "title" | "year">,
): Promise<TmdbMatch | null> {
  const params = new URLSearchParams({
    api_key: apiKey,
    query: candidate.title,
    include_adult: "false",
  });
  const url = new URL(`${TMDB_SEARCH_BASE}?${params.toString()}`);

  try {
    await assertSafeFetchUrl(url);
  } catch {
    return null;
  }

  let raw: TmdbSearchResponse;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    raw = (await res.json()) as TmdbSearchResponse;
  } catch {
    return null;
  }

  const results = (raw.results ?? []).filter(
    (r): r is TmdbMatch => r.media_type === "movie" || r.media_type === "tv",
  );
  if (results.length === 0) return null;

  return selectTmdbMatch(results, { title: candidate.title, year: candidate.year ?? null });
}

/**
 * Resolve a movie/TV candidate against TMDB. A canonical IMDb id (when supplied)
 * resolves to the exact entity and is preferred over fuzzy title-search.
 *
 * Returns null when:
 * - TMDB_API_KEY is absent
 * - No confident match found (id miss + title-search miss)
 * - Network/API error
 */
export async function resolveMovieWithTmdb(
  candidate: Pick<LlmCandidate, "title" | "creator" | "year">,
  { includeCredits = false, imdbId = null }: { includeCredits?: boolean; imdbId?: string | null } = {},
): Promise<ResolvedMovie | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;

  // Prefer the canonical id; fall back to title-search when there is no id or
  // /find has no movie/TV result for it.
  let best: TmdbMatch | null = imdbId ? await findTmdbByImdbId(apiKey, imdbId) : null;
  if (!best) best = await searchTmdbByTitle(apiKey, candidate);
  if (!best) return null;

  const yearStr = best.release_date ?? best.first_air_date ?? null;
  const confirmedYear = yearStr ? Number.parseInt(yearStr.slice(0, 4), 10) : null;

  const voteAverage = best.vote_average;
  const sourceRating =
    voteAverage !== undefined ? Math.round((voteAverage / 2) * 10) / 10 : null;

  const genres = (best.genre_ids ?? [])
    .map((id) => TMDB_GENRE_NAMES[id])
    .filter((g): g is string => Boolean(g))
    .slice(0, 3);

  const resolved: ResolvedMovie = {
    canonical_url: `https://www.themoviedb.org/${best.media_type}/${best.id}`,
    cover_url: best.poster_path ? `${TMDB_IMAGE_BASE}${best.poster_path}` : null,
    confirmed_year: Number.isFinite(confirmedYear) ? (confirmedYear as number) : null,
    external_id: String(best.id),
    verified_author: null,
    source_rating: sourceRating,
    rating_count:
      best.vote_count !== undefined ? String(best.vote_count) : null,
    length: best.media_type === "tv" ? "TV series" : "Film",
    genres: genres.length > 0 ? genres : undefined,
    media_type: best.media_type,
  };

  // Crew (directors) is never in multi-search; fetch it on demand for enrichment.
  // The recommendation path omits includeCredits and pays no extra round-trip —
  // card extras are fetched later, for final cards only (ADR 0015).
  if (includeCredits) {
    const body = await fetchTmdbDetails(apiKey, best.media_type, best.id);
    if (body) {
      const directors = parseDirectors(body, best.media_type);
      if (directors.length > 0) resolved.directors = directors;
      const runtime = parseRuntimeMinutes(body, best.media_type);
      if (runtime !== null) resolved.runtime_minutes = runtime;
    }
  }

  return resolved;
}
