import "server-only";

import type { ItemCategory } from "@/lib/database.types";
import type { CategoryResolver, ResolverInput, ResolverPatch } from "@/lib/enrichment/resolvers/types";
import { resolveBooks } from "@/lib/enrichment/resolvers/google-books";
import { resolveApp } from "@/lib/enrichment/resolvers/github";
import { resolveMusic } from "@/lib/enrichment/resolvers/itunes";
import { resolveMovie } from "@/lib/enrichment/resolvers/tmdb";
import { resolveVideo } from "@/lib/enrichment/resolvers/youtube-oembed";

/**
 * Resolvers per category, tried in array order. Categories without a free
 * deterministic source (restaurants, travel, recipes, articles, products) are
 * intentionally absent — covered by deterministic parsing or phase-2 grounding.
 */
export const resolversByCategory: Partial<Record<ItemCategory, CategoryResolver[]>> = {
  movies_and_tv: [resolveMovie],
  books: [resolveBooks],
  music: [resolveMusic],
  videos: [resolveVideo],
  apps: [resolveApp],
};

/** Run resolvers in order; return the first non-null patch. Defensive against throws. */
export async function runResolvers(
  resolvers: CategoryResolver[],
  input: ResolverInput,
): Promise<ResolverPatch | null> {
  for (const resolver of resolvers) {
    try {
      const patch = await resolver(input);
      if (patch) return patch;
    } catch {
      /* fail-open: try the next resolver */
    }
  }
  return null;
}

/** Resolve category evidence for an item, or null when no resolver applies/matches. */
export async function resolveCategoryEvidence(
  category: ItemCategory | null,
  input: ResolverInput,
): Promise<ResolverPatch | null> {
  if (!category) return null;
  const resolvers = resolversByCategory[category];
  if (!resolvers || resolvers.length === 0) return null;
  return runResolvers(resolvers, input);
}
