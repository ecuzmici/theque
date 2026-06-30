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
};

type TmdbCrewMember = { job?: string; name?: string };
type TmdbDetails = {
  runtime?: number;
  episode_run_time?: number[];
  created_by?: Array<{ name?: string }>;
  credits?: { crew?: TmdbCrewMember[] };
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
const TMDB_DETAILS_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const TIMEOUT_MS = 8000;

/**
 * Fetch crew + runtime for a resolved title. Movies → crew job=Director;
 * TV → created_by (showrunner). Fails open (returns null) on any error so a
 * credits hiccup never sinks an otherwise-good resolution.
 */
async function fetchTmdbCredits(
  apiKey: string,
  mediaType: "movie" | "tv",
  id: number,
): Promise<{ directors: string[]; runtime_minutes: number | null } | null> {
  const params = new URLSearchParams({ api_key: apiKey, append_to_response: "credits" });
  const url = new URL(`${TMDB_DETAILS_BASE}/${mediaType}/${id}?${params.toString()}`);

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
    const body = (await res.json()) as TmdbDetails;

    const directors =
      mediaType === "tv"
        ? (body.created_by ?? [])
            .map((c) => c?.name)
            .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
        : (body.credits?.crew ?? [])
            .filter((c) => c?.job === "Director")
            .map((c) => c?.name)
            .filter((n): n is string => typeof n === "string" && n.trim().length > 0);

    const runtime_minutes =
      mediaType === "tv"
        ? (Array.isArray(body.episode_run_time) ? body.episode_run_time[0] ?? null : null)
        : (typeof body.runtime === "number" ? body.runtime : null);

    return { directors, runtime_minutes };
  } catch {
    return null;
  }
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
  return matches[0];
}

/**
 * Resolve a movie/TV candidate against TMDB.
 *
 * Returns null when:
 * - TMDB_API_KEY is absent
 * - No matching result found
 * - Network/API error
 */
export async function resolveMovieWithTmdb(
  candidate: Pick<LlmCandidate, "title" | "creator" | "year">,
  { includeCredits = false }: { includeCredits?: boolean } = {},
): Promise<ResolvedMovie | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;

  // Note: /search/multi ignores a `year` param, so we disambiguate by year
  // client-side in selectTmdbMatch instead of sending it here.
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
    (r): r is TmdbResult & { media_type: "movie" | "tv" } =>
      r.media_type === "movie" || r.media_type === "tv",
  );

  if (results.length === 0) return null;

  const best = selectTmdbMatch(results, { title: candidate.title, year: candidate.year ?? null });
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
  };

  // Crew (directors) is never in multi-search; fetch it on demand for enrichment.
  // The recommendation path omits includeCredits and pays no extra round-trip.
  if (includeCredits) {
    const credits = await fetchTmdbCredits(apiKey, best.media_type, best.id);
    if (credits) {
      if (credits.directors.length > 0) resolved.directors = credits.directors;
      if (
        typeof credits.runtime_minutes === "number" &&
        Number.isInteger(credits.runtime_minutes) &&
        credits.runtime_minutes > 0
      ) {
        resolved.runtime_minutes = credits.runtime_minutes;
      }
    }
  }

  return resolved;
}
