import { describe, expect, it } from "vitest";

import {
  RATING_SCALES,
  clampRating,
  fromCalibre,
  fromFive,
  fromHalfStars,
  fromQuarterStars,
  fromTen,
  isRatingScaleId,
  resolveRatingNormalizer,
  toRatingNumber,
} from "@/lib/import/rating";

describe("zero means unrated", () => {
  // The single most damaging import bug available: Goodreads, MyAnimeList,
  // Discogs and Paprika all write 0 for "never rated", and most rows in a large
  // export are unrated. Importing those as 1 star would fill the taste profile
  // with thousands of fabricated one-star verdicts.
  const scales = Object.entries(RATING_SCALES);

  for (const [name, normalize] of scales) {
    it(`maps 0 and blanks to null for the "${name}" scale`, () => {
      expect(normalize(0)).toBeNull();
      expect(normalize("0")).toBeNull();
      expect(normalize("0.0")).toBeNull();
      expect(normalize("")).toBeNull();
      expect(normalize("   ")).toBeNull();
      expect(normalize(null)).toBeNull();
      expect(normalize(undefined)).toBeNull();
      expect(normalize("not a number")).toBeNull();
      expect(normalize(-3)).toBeNull();
    });

    it(`never emits a value outside 1..5 for the "${name}" scale`, () => {
      for (const raw of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "99"]) {
        const value = normalize(raw);
        if (value === null) continue;
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(5);
        expect(Number.isInteger(value)).toBe(true);
      }
    });
  }
});

describe("fromTen", () => {
  it("pairs 1..10 down to 1..5", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => fromTen(v))).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4, 5, 5,
    ]);
  });

  it("clamps above the scale", () => {
    expect(fromTen(11)).toBe(5);
  });
});

describe("fromHalfStars", () => {
  it("rounds half-steps to whole stars", () => {
    expect(fromHalfStars("0.5")).toBe(1);
    expect(fromHalfStars("1.5")).toBe(2);
    expect(fromHalfStars("2.5")).toBe(3);
    expect(fromHalfStars("3.5")).toBe(4);
    expect(fromHalfStars("4.5")).toBe(5);
    expect(fromHalfStars("5.0")).toBe(5);
  });
});

describe("fromFive", () => {
  it("passes whole stars through", () => {
    expect([1, 2, 3, 4, 5].map((v) => fromFive(v))).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("fromCalibre", () => {
  it("halves the internal 0..10 scale", () => {
    expect([2, 4, 6, 8, 10].map((v) => fromCalibre(v))).toEqual([1, 2, 3, 4, 5]);
    expect(fromCalibre(1)).toBe(1);
  });
});

describe("fromQuarterStars", () => {
  it("rounds quarter-steps to whole stars", () => {
    expect(fromQuarterStars("3.25")).toBe(3);
    expect(fromQuarterStars("3.75")).toBe(4);
    expect(fromQuarterStars("4.5")).toBe(5);
  });
});

describe("toRatingNumber", () => {
  it("unwraps Excel escaping and decimal commas", () => {
    expect(toRatingNumber('="4"')).toBe(4);
    expect(toRatingNumber("4,5")).toBe(4.5);
    expect(toRatingNumber('"3"')).toBe(3);
  });
});

describe("scale registry", () => {
  it("resolves named scales and custom normalizers", () => {
    expect(isRatingScaleId("ten")).toBe(true);
    expect(isRatingScaleId("nope")).toBe(false);
    expect(resolveRatingNormalizer("ten")(9)).toBe(5);
    expect(resolveRatingNormalizer(() => 2)("anything")).toBe(2);
  });
});

describe("clampRating", () => {
  it("bounds and rounds, treating 0 as unrated", () => {
    expect(clampRating(0)).toBeNull();
    expect(clampRating(7)).toBe(5);
    expect(clampRating(2.4)).toBe(2);
    expect(clampRating(null)).toBeNull();
  });
});
