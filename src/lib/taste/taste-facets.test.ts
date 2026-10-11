import { describe, expect, it } from "vitest";

import { countPairs, narrowFacets, type TasteFacets } from "./taste-facets";
import { BOOK_GENRES, MOODS } from "./taste-lists";

const facets: TasteFacets = {
  genres: [
    { key: "fantasy", label: "Fantasy", count: 5 },
    { key: "horror", label: "Horror", count: 3 },
  ],
  moods: [
    { key: "tense", label: "Tense", count: 6 },
    { key: "eerie", label: "Eerie", count: 3 },
    { key: "cozy", label: "Cozy", count: 2 },
  ],
  pairs: {
    fantasy: { tense: 2, cozy: 2 },
    horror: { tense: 3, eerie: 3 },
  },
};

describe("countPairs", () => {
  it("counts each known pair once for each item", () => {
    const pairs = countPairs(
      [
        { genre_keys: ["horror", "horror", "nonsense"], mood_keys: ["eerie", "spicy"] },
        { genre_keys: ["horror"], mood_keys: ["eerie", "dark"] },
        { genre_keys: null, mood_keys: ["eerie"] },
      ],
      BOOK_GENRES,
      MOODS,
    );
    expect(pairs).toEqual({ horror: { eerie: 2, dark: 1 } });
  });
});

describe("narrowFacets", () => {
  it("changes nothing without a filter", () => {
    expect(narrowFacets(facets, { genre: null, mood: null })).toEqual(facets);
  });

  it("counts moods inside the active genre and drops the moods with no item", () => {
    const out = narrowFacets(facets, { genre: "horror", mood: null });
    expect(out.moods).toEqual([
      { key: "tense", label: "Tense", count: 3 },
      { key: "eerie", label: "Eerie", count: 3 },
    ]);
    expect(out.genres).toEqual(facets.genres);
  });

  it("counts genres inside the active mood", () => {
    const out = narrowFacets(facets, { genre: null, mood: "cozy" });
    expect(out.genres).toEqual([{ key: "fantasy", label: "Fantasy", count: 2 }]);
  });

  it("changes nothing without pair counts", () => {
    const old = { genres: facets.genres, moods: facets.moods };
    expect(narrowFacets(old, { genre: "horror", mood: "eerie" })).toEqual(old);
  });
});
