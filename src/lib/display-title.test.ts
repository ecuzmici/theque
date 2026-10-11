import { describe, expect, it } from "vitest";

import { cleanDisplayTitle } from "./display-title";

describe("cleanDisplayTitle", () => {
  describe("IMDb page titles", () => {
    it.each([
      ["Twin Peaks (TV Series 1990–1991) ⭐ 8.7 | Crime, Drama", "Twin Peaks"],
      ["Tremors (1990) - IMDb", "Tremors"],
      ["Tremors (1990) ⭐ 7.1 | Comedy, Horror, Sci-Fi", "Tremors"],
      ["Tremors (1990)", "Tremors"],
      ["Dune: Part Two - IMDb", "Dune: Part Two"],
      ["The Office (TV Series 2005–2013) - IMDb", "The Office"],
      ["Chernobyl (TV Mini Series 2019) - IMDb", "Chernobyl"],
      ["Chernobyl (TV Mini-Series 2019)", "Chernobyl"],
      ["Black Mirror (TV Series 2011– ) - IMDb", "Black Mirror"],
      ["Black Mirror (TV Series 2011–)", "Black Mirror"],
      ["Bandersnatch (TV Movie 2018) ⭐ 7.1", "Bandersnatch"],
      ["Paperman (Short 2012) - IMDb", "Paperman"],
      ["Elden Ring (Video Game 2022) | IMDb", "Elden Ring"],
      ["Crash (I) (2004) - IMDb", "Crash"],
      ["Twin Peaks (TV Series 1990–1991) | Crime, Drama, Mystery", "Twin Peaks"],
      ["Arrival (2016) – IMDb", "Arrival"],
      ["Arrival (2016) - IMDbPro", "Arrival"],
      ["Se7en (1995) ⭐️ 8.6 | Crime, Drama, Mystery", "Se7en"],
      ["Mad Max: Fury Road (2015) ⭐ 8.1 | Action, Adventure, Sci-Fi", "Mad Max: Fury Road"],
    ])("cleans %j", (raw, expected) => {
      expect(cleanDisplayTitle(raw)).toBe(expected);
    });
  });

  describe("other leaked site text", () => {
    it.each([
      ["Dune (Dune, #1)", "Dune"],
      ["Small Gods (Discworld, #13)", "Small Gods"],
      ["The Colour of Magic (Discworld, #1.5) | Goodreads", "The Colour of Magic"],
      ["GitHub - vercel/next.js: The React Framework", "vercel/next.js"],
      ["GitHub - ecuzmici/theque", "ecuzmici/theque"],
    ])("cleans %j", (raw, expected) => {
      expect(cleanDisplayTitle(raw)).toBe(expected);
    });
  });

  describe("legitimate titles", () => {
    it.each([
      "The Left Hand of Darkness",
      "1984",
      "2001: A Space Odyssey",
      "Blade Runner 2049",
      "Fear and Loathing (in Las Vegas)",
      "Moby-Dick; or, The Whale",
      "Rust vs Go | A practical comparison",
      "Design | Process | Craft",
      "How I built this (and what I learned)",
      "The Year 1984 (A Retrospective)",
      "Python 3.12 (What's New)",
      "Tracks (2013 remaster notes)",
      "Season 2 (episodes 1-4)",
      "M*A*S*H",
      "Everything Everywhere All at Once",
      "IMDb's best films of all time",
    ])("keeps %j", (title) => {
      expect(cleanDisplayTitle(title)).toBe(title);
    });

    it("keeps a pipe list when no IMDb year comes before it", () => {
      expect(cleanDisplayTitle("Notes | Crime, Drama")).toBe("Notes | Crime, Drama");
    });

    it("keeps a year that is not at the end", () => {
      expect(cleanDisplayTitle("Tremors (1990) Revisited")).toBe("Tremors (1990) Revisited");
    });
  });

  describe("whitespace and edge cases", () => {
    it("trims and collapses whitespace", () => {
      expect(cleanDisplayTitle("  Tremors   (1990)  -  IMDb ")).toBe("Tremors");
      expect(cleanDisplayTitle("  The   Hobbit ")).toBe("The Hobbit");
    });

    it("returns an empty string for an empty title", () => {
      expect(cleanDisplayTitle("")).toBe("");
      expect(cleanDisplayTitle("   ")).toBe("");
    });

    it("keeps the original when cleaning would leave nothing", () => {
      expect(cleanDisplayTitle("(1990)")).toBe("(1990)");
      expect(cleanDisplayTitle("IMDb")).toBe("IMDb");
    });
  });
});
