/**
 * Book resolver chain for recommendations (ADR 0018): one batched Hardcover
 * request for the whole round, then Open Library for each candidate that
 * Hardcover did not match.
 */

import "server-only";

import type { LlmCandidate } from "@/lib/recommend/recommend-types";
import { resolveBooksWithHardcover } from "@/lib/recommend/resolve/hardcover";
import { type ResolvedBook, resolveBookWithOpenLibrary } from "@/lib/recommend/resolve/open-library";

export type ResolvedBookWithSource = ResolvedBook & { source: "hardcover" | "open_library" };

/** One entry per candidate, in the same order. Null when no source matches. */
export async function resolveBooks(
  candidates: Pick<LlmCandidate, "title" | "creator" | "year">[],
): Promise<(ResolvedBookWithSource | null)[]> {
  const hardcover = await resolveBooksWithHardcover(candidates);
  return Promise.all(
    candidates.map(async (candidate, i) => {
      const fromHardcover = hardcover[i];
      if (fromHardcover) return { ...fromHardcover, source: "hardcover" as const };
      const openLibrary = await resolveBookWithOpenLibrary(candidate);
      return openLibrary ? { ...openLibrary, source: "open_library" as const } : null;
    }),
  );
}
