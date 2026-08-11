import "server-only";

import type { ItemCategory } from "@/lib/database.types";
import type { CategoryResolver, ResolverInput, ResolverPatch } from "@/lib/enrichment/resolvers/types";
import { resolveBooks } from "@/lib/enrichment/resolvers/google-books";
import { resolveHardcover } from "@/lib/enrichment/resolvers/hardcover";
import { resolveMovie } from "@/lib/enrichment/resolvers/tmdb";
import { resolveVideo } from "@/lib/enrichment/resolvers/youtube-oembed";

/**
 * Resolvers per category, tried in array order. Categories without a free
 * deterministic source (restaurants, travel, recipes, articles, products) are
 * intentionally absent — covered by deterministic parsing or phase-2 grounding.
 * YouTube oEmbed is tried first under movies_and_tv so retargeted video
 * captures enrich (title/channel/thumbnail) before the TMDB title search.
 * Hardcover is tried first under books because it carries series and genres;
 * Google Books stays as the keyless fallback.
 */
export const resolversByCategory: Partial<Record<ItemCategory, CategoryResolver[]>> = {
  movies_and_tv: [resolveVideo, resolveMovie],
  books: [resolveHardcover, resolveBooks],
};

/**
 * Categories whose resolvers complement each other rather than compete.
 * Books need both: Hardcover carries series and genres, Google Books carries a
 * reliable ISBN and publication year.
 */
const MERGED_CATEGORIES: ReadonlySet<ItemCategory> = new Set<ItemCategory>(["books"]);

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

/**
 * Run every resolver and merge the hits. Earlier resolvers win each field;
 * later ones only fill gaps. `source` lists every resolver that contributed.
 */
export async function runResolversMerged(
  resolvers: CategoryResolver[],
  input: ResolverInput,
): Promise<ResolverPatch | null> {
  const patches: ResolverPatch[] = [];
  for (const resolver of resolvers) {
    try {
      const patch = await resolver(input);
      if (patch) patches.push(patch);
    } catch {
      /* fail-open: try the next resolver */
    }
  }
  if (patches.length === 0) return null;
  if (patches.length === 1) return patches[0];

  const structured: Record<string, unknown> = {};
  const merged: ResolverPatch = { source: patches.map((patch) => patch.source).join("+") };
  for (const patch of patches) {
    if (patch.title && !merged.title) merged.title = patch.title;
    if (patch.description && !merged.description) merged.description = patch.description;
    if (patch.image_url && !merged.image_url) merged.image_url = patch.image_url;
    for (const [key, value] of Object.entries(patch.structured ?? {})) {
      if (value !== undefined && value !== null && !(key in structured)) structured[key] = value;
    }
  }
  if (Object.keys(structured).length > 0) merged.structured = structured;
  return merged;
}

/** Resolve category evidence for an item, or null when no resolver applies/matches. */
export async function resolveCategoryEvidence(
  category: ItemCategory | null,
  input: ResolverInput,
): Promise<ResolverPatch | null> {
  if (!category) return null;
  const resolvers = resolversByCategory[category];
  if (!resolvers || resolvers.length === 0) return null;
  if (MERGED_CATEGORIES.has(category)) return runResolversMerged(resolvers, input);
  return runResolvers(resolvers, input);
}
