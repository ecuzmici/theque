import type { ItemCategory } from "@/lib/database.types";
import type { ShelfId } from "@/lib/shelves";

// Fixed genre and mood lists (ADR 0020). Users cannot add or rename entries.

export const WATCH_GENRES = [
  { key: "horror", label: "Horror" },
  { key: "thriller", label: "Thriller" },
  { key: "mystery", label: "Mystery" },
  { key: "crime", label: "Crime" },
  { key: "scifi-fantasy", label: "Sci-Fi & Fantasy" },
  { key: "comedy", label: "Comedy" },
  { key: "action-adventure", label: "Action & Adventure" },
  { key: "war-history", label: "War & History" },
  { key: "romance", label: "Romance" },
  { key: "documentary", label: "Documentary" },
  { key: "animation", label: "Animation" },
  { key: "family", label: "Family" },
] as const;

export const BOOK_GENRES = [
  { key: "fantasy", label: "Fantasy" },
  { key: "scifi", label: "Sci-Fi" },
  { key: "mystery-crime", label: "Mystery & Crime" },
  { key: "thriller", label: "Thriller" },
  { key: "horror", label: "Horror" },
  { key: "literary", label: "Literary" },
  { key: "historical", label: "Historical" },
  { key: "romance", label: "Romance" },
  { key: "classics", label: "Classics" },
  { key: "young-adult", label: "Young Adult" },
  { key: "nonfiction", label: "Nonfiction" },
  { key: "memoir-biography", label: "Memoir & Bio" },
] as const;

export const MOODS = [
  { key: "cozy", label: "Cozy" },
  { key: "funny", label: "Funny" },
  { key: "heartfelt", label: "Heartfelt" },
  { key: "dark", label: "Dark" },
  { key: "tense", label: "Tense" },
  { key: "eerie", label: "Eerie" },
  { key: "mind-bending", label: "Mind-bending" },
  { key: "slow-burn", label: "Slow burn" },
  { key: "epic", label: "Epic" },
  { key: "thought-provoking", label: "Thought-provoking" },
] as const;

export type WatchGenreKey = (typeof WATCH_GENRES)[number]["key"];
export type BookGenreKey = (typeof BOOK_GENRES)[number]["key"];
export type GenreKey = WatchGenreKey | BookGenreKey;
export type MoodKey = (typeof MOODS)[number]["key"];

export type TasteListEntry<K extends string = string> = {
  readonly key: K;
  readonly label: string;
};

/** A genre chip shows only when at least this many shelf items carry its key. */
export const TASTE_CHIP_MIN_COUNT = 2;

/** The genre list for a category. Other categories have an empty list. */
export function genreListForCategory(
  category: ItemCategory | null | undefined,
): readonly TasteListEntry<GenreKey>[] {
  if (category === "books") return BOOK_GENRES;
  if (category === "movies_and_tv") return WATCH_GENRES;
  return [];
}

export function isGenreKeyFor(
  category: ItemCategory | null | undefined,
  key: unknown,
): key is GenreKey {
  return typeof key === "string" && genreListForCategory(category).some((g) => g.key === key);
}

export function isMoodKey(key: unknown): key is MoodKey {
  return typeof key === "string" && MOODS.some((m) => m.key === key);
}

/** The label of a genre key, or null when the category list does not hold the key. */
export function genreLabel(category: ItemCategory | null | undefined, key: string): string | null {
  return genreListForCategory(category).find((g) => g.key === key)?.label ?? null;
}

/** The label of a mood key, or null when the key is unknown. */
export function moodLabel(key: string): string | null {
  return MOODS.find((m) => m.key === key)?.label ?? null;
}

/** The category of a shelf that has taste chips. Other shelves return null. */
export function tasteShelfCategory(
  shelfId: ShelfId | string | null | undefined,
): ItemCategory | null {
  if (shelfId === "books") return "books";
  if (shelfId === "watch") return "movies_and_tv";
  return null;
}
