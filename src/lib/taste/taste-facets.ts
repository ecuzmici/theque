import type { TasteListEntry } from "./taste-lists";

// Chip counts for the genre and mood chip row (ADR 0020, decision 7).

export type TasteFacet = { key: string; label: string; count: number };
/** Item counts by genre key, then by mood key. An item counts once per pair. */
export type TastePairCounts = Record<string, Record<string, number>>;
export type TasteFacets = { genres: TasteFacet[]; moods: TasteFacet[]; pairs?: TastePairCounts };

type KeyRow = { genre_keys: string[] | null | undefined; mood_keys: string[] | null | undefined };

/** Count each known key once for each item. Drop keys that have a count of 0. */
export function countKeys(
  rows: (string[] | null | undefined)[],
  list: readonly TasteListEntry[],
): TasteFacet[] {
  const counts = new Map<string, number>();
  for (const keys of rows) {
    if (!Array.isArray(keys)) continue;
    for (const key of new Set(keys)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return list
    .map((entry, order) => ({ ...entry, count: counts.get(entry.key) ?? 0, order }))
    .filter((f) => f.count > 0)
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .map(({ key, label, count }) => ({ key, label, count }));
}

/** Count the items for each known genre and mood pair. */
export function countPairs(
  rows: KeyRow[],
  genres: readonly TasteListEntry[],
  moods: readonly TasteListEntry[],
): TastePairCounts {
  const genreKeys = new Set(genres.map((g) => g.key));
  const moodKeys = new Set(moods.map((m) => m.key));
  const pairs: TastePairCounts = {};
  for (const row of rows) {
    if (!Array.isArray(row.genre_keys) || !Array.isArray(row.mood_keys)) continue;
    for (const genre of new Set(row.genre_keys)) {
      if (!genreKeys.has(genre)) continue;
      for (const mood of new Set(row.mood_keys)) {
        if (!moodKeys.has(mood)) continue;
        const byMood = (pairs[genre] ??= {});
        byMood[mood] = (byMood[mood] ?? 0) + 1;
      }
    }
  }
  return pairs;
}

function recount(facets: TasteFacet[], countFor: (key: string) => number): TasteFacet[] {
  return facets
    .map((f, order) => ({ ...f, count: countFor(f.key), order }))
    .filter((f) => f.count > 0)
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .map(({ key, label, count }) => ({ key, label, count }));
}

/**
 * Narrow the chip counts to the active filter. With a genre, the mood counts
 * include only items of that genre. With a mood, the genre counts include only
 * items with that mood. Without pair counts, the function changes nothing.
 */
export function narrowFacets(
  facets: TasteFacets,
  selection: { genre: string | null; mood: string | null },
): TasteFacets {
  const { pairs } = facets;
  if (!pairs) return facets;
  const { genre, mood } = selection;
  return {
    ...facets,
    genres: mood ? recount(facets.genres, (key) => pairs[key]?.[mood] ?? 0) : facets.genres,
    moods: genre ? recount(facets.moods, (key) => pairs[genre]?.[key] ?? 0) : facets.moods,
  };
}
