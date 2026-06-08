/**
 * Dedup helpers for AI recommendations (Workstream F).
 *
 * After resolving candidates, we filter out any title that matches
 * something the user already has in their library. This is server-side
 * enforcement — not a prompt instruction.
 */

import type { ResolvedRecommendation } from "@/lib/recommend/recommend-types";

/**
 * Normalize a title for dedup comparison:
 * - lowercase
 * - strip diacritics (NFD → remove combining chars)
 * - strip punctuation and extra whitespace
 * - strip common leading articles (the, a, an)
 */
export function normalizeTitle(title: string): string {
  const stripped = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^\w\s]/g, " ") // punctuation → space
    .replace(/\s+/g, " ")
    .trim();

  // Strip leading articles
  return stripped.replace(/^(the|a|an)\s+/, "");
}

/**
 * Filter resolved recommendation cards against the user's existing library titles.
 *
 * @param cards         - Resolved recommendations from the resolver layer.
 * @param existingTitles - Titles from the user's library for this category (raw DB values).
 * @returns Cards that are not duplicates.
 */
export function dedupRecommendations(
  cards: ResolvedRecommendation[],
  existingTitles: (string | null)[],
): ResolvedRecommendation[] {
  const existingNormalized = new Set(
    existingTitles
      .filter((t): t is string => typeof t === "string" && t.length > 0)
      .map(normalizeTitle),
  );

  return cards.filter((card) => {
    const normalized = normalizeTitle(card.title);
    return !existingNormalized.has(normalized);
  });
}
