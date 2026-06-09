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
  /** Always null for movies/TV — TMDB multi-search doesn't return a director,
   * so the displayed creator falls back to the LLM candidate. Present for a
   * uniform shape with ResolvedBook. */
  verified_author: string | null;
};

type TmdbResult = {
  id: number;
  media_type: "movie" | "tv" | "person";
  title?: string;         // movie
  name?: string;          // tv
  release_date?: string;  // movie: YYYY-MM-DD
  first_air_date?: string; // tv: YYYY-MM-DD
  poster_path?: string | null;
};

type TmdbSearchResponse = {
  results: TmdbResult[];
};

const TMDB_SEARCH_BASE = "https://api.themoviedb.org/3/search/multi";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const TIMEOUT_MS = 8000;

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
): Promise<ResolvedMovie | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({
    api_key: apiKey,
    query: candidate.title,
    include_adult: "false",
  });
  if (candidate.year) {
    params.set("year", String(candidate.year));
  }

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

  const best = results[0];
  const yearStr = best.release_date ?? best.first_air_date ?? null;
  const confirmedYear = yearStr ? Number.parseInt(yearStr.slice(0, 4), 10) : null;

  return {
    canonical_url: `https://www.themoviedb.org/${best.media_type}/${best.id}`,
    cover_url: best.poster_path ? `${TMDB_IMAGE_BASE}${best.poster_path}` : null,
    confirmed_year: Number.isFinite(confirmedYear) ? (confirmedYear as number) : null,
    verified_author: null,
  };
}
