import "server-only";

import { resolveMovieWithTmdb } from "@/lib/recommend/resolve/tmdb";
import type { CategoryResolver, ResolverPatch } from "@/lib/enrichment/resolvers/types";

/**
 * Movies/TV resolver — wraps the recommendation TMDB resolver. Requires
 * TMDB_API_KEY (handled inside resolveMovieWithTmdb, which returns null when
 * the key is absent). Runs with `includeCredits` so TMDB is authoritative for
 * crew: movie directors / TV creators (showrunner). Genres and rating come from
 * the same lookup. The LLM is barred from supplying directors from memory (see
 * ADR 0011 / the Crew rule).
 */
export const resolveMovie: CategoryResolver = async (input) => {
  const title = input.title?.trim();
  if (!title) return null;

  const year = typeof input.structured.year === "number" ? input.structured.year : null;
  const resolved = await resolveMovieWithTmdb({ title, creator: "", year }, { includeCredits: true });
  if (!resolved) return null;

  const structured: Record<string, unknown> = {};
  if (resolved.confirmed_year !== null) structured.year = resolved.confirmed_year;
  if (resolved.canonical_url.includes("/tv/")) structured.media_type = "tv";
  else if (resolved.canonical_url.includes("/movie/")) structured.media_type = "movie";
  if (resolved.directors && resolved.directors.length > 0) structured.directors = resolved.directors;
  if (typeof resolved.runtime_minutes === "number" && resolved.runtime_minutes > 0) {
    structured.runtime_minutes = resolved.runtime_minutes;
  }
  if (resolved.genres && resolved.genres.length > 0) structured.genres = resolved.genres;
  if (typeof resolved.source_rating === "number") {
    structured.rating = resolved.source_rating;
    structured.rating_scale = 5;
  }

  const patch: ResolverPatch = { source: "tmdb", structured };
  if (resolved.cover_url) patch.image_url = resolved.cover_url;
  return patch;
};
