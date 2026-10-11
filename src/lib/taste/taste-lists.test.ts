import { describe, expect, it } from "vitest";

import {
  BOOK_GENRES,
  MOODS,
  TASTE_CHIP_MIN_COUNT,
  WATCH_GENRES,
  genreLabel,
  genreListForCategory,
  isGenreKeyFor,
  isMoodKey,
  moodLabel,
  tasteShelfCategory,
} from "./taste-lists";

describe("taste lists", () => {
  it("holds 12 watch genres, 12 book genres and 10 moods", () => {
    expect(WATCH_GENRES).toHaveLength(12);
    expect(BOOK_GENRES).toHaveLength(12);
    expect(MOODS.map((m) => m.label)).toEqual([
      "Cozy",
      "Funny",
      "Heartfelt",
      "Dark",
      "Tense",
      "Eerie",
      "Mind-bending",
      "Slow burn",
      "Epic",
      "Thought-provoking",
    ]);
  });

  it("has unique keys in each list", () => {
    for (const list of [WATCH_GENRES, BOOK_GENRES, MOODS]) {
      expect(new Set(list.map((e) => e.key)).size).toBe(list.length);
    }
  });

  it("returns the genre list of a category and an empty list for others", () => {
    expect(genreListForCategory("books")).toBe(BOOK_GENRES);
    expect(genreListForCategory("movies_and_tv")).toBe(WATCH_GENRES);
    expect(genreListForCategory("articles")).toEqual([]);
    expect(genreListForCategory(null)).toEqual([]);
  });

  it("checks a genre key against the list of the category", () => {
    expect(isGenreKeyFor("books", "scifi")).toBe(true);
    expect(isGenreKeyFor("movies_and_tv", "scifi")).toBe(false);
    expect(isGenreKeyFor("movies_and_tv", "scifi-fantasy")).toBe(true);
    expect(isGenreKeyFor("articles", "horror")).toBe(false);
    expect(isGenreKeyFor("books", 4)).toBe(false);
  });

  it("checks mood keys", () => {
    expect(isMoodKey("eerie")).toBe(true);
    expect(isMoodKey("Eerie")).toBe(false);
    expect(isMoodKey("horror")).toBe(false);
    expect(isMoodKey(undefined)).toBe(false);
  });

  it("returns labels or null", () => {
    expect(genreLabel("books", "memoir-biography")).toBe("Memoir & Bio");
    expect(genreLabel("movies_and_tv", "memoir-biography")).toBeNull();
    expect(moodLabel("slow-burn")).toBe("Slow burn");
    expect(moodLabel("nope")).toBeNull();
  });

  it("maps shelves to categories", () => {
    expect(tasteShelfCategory("books")).toBe("books");
    expect(tasteShelfCategory("watch")).toBe("movies_and_tv");
    expect(tasteShelfCategory("all")).toBeNull();
    expect(tasteShelfCategory("read")).toBeNull();
    expect(tasteShelfCategory(null)).toBeNull();
  });

  it("sets the chip minimum count to 2", () => {
    expect(TASTE_CHIP_MIN_COUNT).toBe(2);
  });
});
