/**
 * Assemble a verdict-driven taste profile from library items and outcome rows.
 */

import type { ItemCategory, Json } from "@/lib/database.types";
import { normalizeTitle } from "@/lib/recommend/dedup";
import {
  RECOMMEND_DISLIKED_MAX,
  RECOMMEND_LOVED_MAX,
  RECOMMEND_MAX_INPUT_ITEMS,
  RECOMMEND_VERDICT_NOTE_MAX,
} from "@/lib/recommend/recommend-config";
import type { RecommendShelfId, TasteProfile, TasteProfileItem } from "@/lib/recommend/recommend-types";

export type LibraryItemRow = {
  title: string | null;
  status: string;
  rating_personal: number | null;
  verdict: string | null;
  structured: Json;
  category: ItemCategory | null;
};

export type OutcomeRow = {
  title_norm: string;
  outcome: string;
  shown_at: string;
};

function hasStructuredData(structured: Json): boolean {
  if (!structured || typeof structured !== "object" || Array.isArray(structured)) return false;
  return Object.keys(structured as Record<string, unknown>).length > 0;
}

function truncateVerdictNote(note: string): string {
  if (note.length <= RECOMMEND_VERDICT_NOTE_MAX) return note;
  return `${note.slice(0, RECOMMEND_VERDICT_NOTE_MAX - 1)}…`;
}

function extractCreatorAndYear(
  category: ItemCategory | null,
  structured: Record<string, unknown>,
): { creator: string | null; year: number | null } {
  if (category === "books") {
    const authors = structured.authors as string[] | undefined;
    const py = structured.published_year as number | undefined;
    return {
      creator: authors?.[0] ?? null,
      year: typeof py === "number" && Number.isFinite(py) ? py : null,
    };
  }
  if (category === "movies_and_tv" || category === "videos") {
    const directors = structured.directors as string[] | undefined;
    const year = structured.year as number | undefined;
    return {
      creator: directors?.[0] ?? null,
      year: typeof year === "number" && Number.isFinite(year) ? year : null,
    };
  }
  return { creator: null, year: null };
}

function toProfileItem(row: LibraryItemRow): TasteProfileItem | null {
  if (!row.title?.trim()) return null;
  const structured = row.structured as Record<string, unknown>;
  const { creator, year } = extractCreatorAndYear(row.category, structured);
  const item: TasteProfileItem = {
    title: row.title.trim(),
    creator,
    year,
  };
  if (row.verdict?.trim()) {
    item.verdictNote = truncateVerdictNote(row.verdict.trim());
  }
  return item;
}

/** Map a recommend shelf to the outcome-log category key. */
export function outcomeCategoryForShelf(shelfId: RecommendShelfId): "books" | "movies_and_tv" {
  return shelfId === "books" ? "books" : "movies_and_tv";
}

/** Return category filter(s) for a given shelf. */
export function categoriesForShelf(shelfId: RecommendShelfId): ItemCategory[] {
  if (shelfId === "books") return ["books"];
  return ["movies_and_tv", "videos"];
}

/**
 * Build a taste profile from library items and suppressed outcome titles.
 *
 * LOVED: done + rating 4–5, highest first, up to RECOMMEND_LOVED_MAX.
 * DISLIKED: done + rating 1–2, up to RECOMMEND_DISLIKED_MAX.
 * BACKLOG: want + no rating, fills remaining budget up to RECOMMEND_MAX_INPUT_ITEMS.
 * NEVER: outcome titles + items dropped for empty structured.
 */
export function buildTasteProfile(
  items: LibraryItemRow[],
  suppressedTitles: string[],
): TasteProfile {
  const neverSet = new Set<string>();

  for (const title of suppressedTitles) {
    if (title.trim()) neverSet.add(title.trim());
  }

  const lovedCandidates: Array<{ rating: number; item: TasteProfileItem }> = [];
  const dislikedCandidates: TasteProfileItem[] = [];
  const backlogCandidates: TasteProfileItem[] = [];

  for (const row of items) {
    if (!row.title?.trim()) continue;

    const structuredOk = hasStructuredData(row.structured);
    if (!structuredOk) {
      neverSet.add(row.title.trim());
      continue;
    }

    const profileItem = toProfileItem(row);
    if (!profileItem) continue;

    const rating = row.rating_personal;
    if (row.status === "done" && rating !== null && rating >= 4) {
      lovedCandidates.push({ rating, item: profileItem });
    } else if (row.status === "done" && rating !== null && rating <= 2) {
      dislikedCandidates.push(profileItem);
    } else if (row.status === "want" && rating === null) {
      backlogCandidates.push(profileItem);
    }
  }

  lovedCandidates.sort((a, b) => b.rating - a.rating);
  const loved = lovedCandidates.slice(0, RECOMMEND_LOVED_MAX).map((c) => c.item);
  const disliked = dislikedCandidates.slice(0, RECOMMEND_DISLIKED_MAX);

  const usedBudget = loved.length + disliked.length;
  const backlogBudget = Math.max(0, RECOMMEND_MAX_INPUT_ITEMS - usedBudget);
  const backlog = backlogCandidates.slice(0, backlogBudget);

  return {
    loved,
    disliked,
    backlog,
    never: [...neverSet],
  };
}

/** Filter cards whose normalized title appears in the NEVER list. */
export function filterNeverTitles<T extends { title: string }>(
  cards: T[],
  neverTitles: string[],
): T[] {
  const neverNormalized = new Set(
    neverTitles.filter((t) => t.length > 0).map(normalizeTitle),
  );
  return cards.filter((card) => !neverNormalized.has(normalizeTitle(card.title)));
}
