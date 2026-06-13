import "server-only";

import { resolveMovieWithTmdb } from "@/lib/recommend/resolve/tmdb";
import type { CategoryResolver, ResolverPatch } from "@/lib/enrichment/resolvers/types";

/**
 * Movies/TV resolver — wraps the recommendation TMDB resolver. Requires
 * TMDB_API_KEY (handled inside resolveMovieWithTmdb, which returns null when
 * the key is absent). TMDB multi-search does not return a director, so only
 * year/image/media_type are mapped.
 */
export const resolveMovie: CategoryResolver = async (input) => {
  const title = input.title?.trim();
  if (!title) return null;

  const year = typeof input.structured.year === "number" ? input.structured.year : null;
  const resolved = await resolveMovieWithTmdb({ title, creator: "", year });
  if (!resolved) return null;

  const structured: Record<string, unknown> = {};
  if (resolved.confirmed_year !== null) structured.year = resolved.confirmed_year;
  if (resolved.canonical_url.includes("/tv/")) structured.media_type = "tv";
  else if (resolved.canonical_url.includes("/movie/")) structured.media_type = "movie";

  const patch: ResolverPatch = { source: "tmdb", structured };
  if (resolved.cover_url) patch.image_url = resolved.cover_url;
  return patch;
};
