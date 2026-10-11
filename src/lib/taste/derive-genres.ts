import type { ItemCategory } from "@/lib/database.types";

import {
  genreListForCategory,
  type BookGenreKey,
  type GenreKey,
  type WatchGenreKey,
} from "./taste-lists";

// Alias tables from ADR 0020, decision 1. Keys are lowercase.
// A label that maps to no key (for example "drama") has no row.

const WATCH_ALIASES: Record<string, WatchGenreKey | WatchGenreKey[]> = {
  horror: "horror",
  thriller: "thriller",
  mystery: "mystery",
  crime: "crime",
  "sci-fi": "scifi-fantasy",
  "science fiction": "scifi-fantasy",
  fantasy: "scifi-fantasy",
  "sci-fi & fantasy": "scifi-fantasy",
  comedy: "comedy",
  action: "action-adventure",
  adventure: "action-adventure",
  "action & adventure": "action-adventure",
  war: "war-history",
  history: "war-history",
  "war & politics": "war-history",
  romance: "romance",
  documentary: "documentary",
  animation: "animation",
  family: "family",
  kids: "family",
};

const BOOK_ALIASES: Record<string, BookGenreKey | BookGenreKey[]> = {
  fantasy: "fantasy",
  "urban fantasy": "fantasy",
  magic: "fantasy",
  dragons: "fantasy",
  "science fiction": "scifi",
  "sci-fi": "scifi",
  space: "scifi",
  aliens: "scifi",
  dystopian: "scifi",
  dystopia: "scifi",
  "post-apocalyptic": "scifi",
  "time travel": "scifi",
  "science fiction & fantasy": ["scifi", "fantasy"],
  mystery: "mystery-crime",
  crime: "mystery-crime",
  murder: "mystery-crime",
  thriller: "thriller",
  thrillers: "thriller",
  conspiracies: "thriller",
  horror: "horror",
  "literary fiction": "literary",
  literature: "literary",
  "world literature": "literary",
  contemporary: "literary",
  "magical realism": "literary",
  "historical fiction": "historical",
  romance: "romance",
  classics: "classics",
  "young adult": "young-adult",
  nonfiction: "nonfiction",
  history: "nonfiction",
  science: "nonfiction",
  essays: "nonfiction",
  philosophy: "nonfiction",
  religion: "nonfiction",
  "social science": "nonfiction",
  medical: "nonfiction",
  memoir: "memoir-biography",
  biography: "memoir-biography",
  "biography & autobiography": "memoir-biography",
};

function normalize(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Map raw genre labels (for example `structured.genres`) to genre keys.
 * The match ignores case and surrounding spaces. A label with " / " is split
 * and each part is matched. The result has no duplicates and follows the
 * order of the category list. Only books and movies_and_tv return keys.
 */
export function deriveGenreKeys(
  category: ItemCategory | null | undefined,
  rawGenres: unknown,
): GenreKey[] {
  const aliases =
    category === "books" ? BOOK_ALIASES : category === "movies_and_tv" ? WATCH_ALIASES : null;
  if (!aliases || !Array.isArray(rawGenres)) return [];

  const found = new Set<string>();
  for (const raw of rawGenres) {
    if (typeof raw !== "string") continue;
    for (const part of raw.split(" / ")) {
      const name = normalize(part);
      if (!Object.hasOwn(aliases, name)) continue;
      const target = aliases[name];
      for (const key of Array.isArray(target) ? target : [target]) found.add(key);
    }
  }

  return genreListForCategory(category)
    .map((g) => g.key)
    .filter((key) => found.has(key));
}
