import { describe, expect, it } from "vitest";

import {
  getBylineDetailKeys,
  splitBylineByCreators,
  getDetailByline,
  mentions,
  prefersLightText,
} from "./item-detail-header";

describe("mentions", () => {
  it("matches whole words only, ignoring case", () => {
    expect(mentions("Christopher Nolan · 2010", "nolan")).toBe(true);
    expect(mentions("Christopher Nolan · 2010", "2010")).toBe(true);
    expect(mentions("Released 20105", "2010")).toBe(false);
    expect(mentions("Nolans", "Nolan")).toBe(false);
  });
});

describe("getDetailByline", () => {
  it("shows the year one time when the subtitle already has it", () => {
    expect(
      getDetailByline("movies_and_tv", "Christopher Nolan · 2010", {
        year: 2010,
        runtime_minutes: 148,
      }),
    ).toBe("Christopher Nolan · 2010 · 2 h 28 m");
  });

  it("keeps a year the subtitle does not state", () => {
    expect(getDetailByline("books", "Frank Herbert", { published_year: 1965 })).toBe(
      "Frank Herbert · 1965",
    );
  });

  it("returns the facts alone when there is no subtitle", () => {
    expect(getDetailByline("movies_and_tv", null, { year: 1999 })).toBe("1999");
  });

  it("returns null when there is nothing to show", () => {
    expect(getDetailByline("articles", "  ", null)).toBeNull();
  });
});

describe("getBylineDetailKeys", () => {
  it("omits a creator row that the byline already names", () => {
    expect(
      getBylineDetailKeys(
        "movies_and_tv",
        { directors: ["Christopher Nolan"], year: 2010 },
        "Christopher Nolan · 2010",
      ),
    ).toEqual(["directors"]);
  });

  it("keeps a list row when the byline names only part of it", () => {
    expect(
      getBylineDetailKeys(
        "books",
        { authors: ["Terry Pratchett", "Neil Gaiman"] },
        "Terry Pratchett · 1990",
      ),
    ).toEqual([]);
  });

  it("returns nothing without a byline", () => {
    expect(getBylineDetailKeys("books", { authors: ["X"] }, null)).toEqual([]);
  });
});

describe("prefersLightText", () => {
  it("picks light text on dark colors and dark text on light colors", () => {
    expect(prefersLightText("#1c1917")).toBe(true);
    expect(prefersLightText("#fef3c7")).toBe(false);
  });

  it("falls back to light text for a color it cannot parse", () => {
    expect(prefersLightText("rgb(0 0 0)")).toBe(true);
  });
});

describe("splitBylineByCreators", () => {
  it("marks each author the byline names, so the header can link it", () => {
    expect(
      splitBylineByCreators("books", "Alastair Reynolds · 374 pages", {
        authors: ["Alastair Reynolds"],
      }),
    ).toEqual([
      { text: "Alastair Reynolds", creator: "Alastair Reynolds" },
      { text: " · 374 pages" },
    ]);
  });

  it("marks two directors and keeps the text between them", () => {
    expect(
      splitBylineByCreators("movies_and_tv", "Joel Coen, Ethan Coen · 1996", {
        directors: ["Joel Coen", "Ethan Coen"],
      }),
    ).toEqual([
      { text: "Joel Coen", creator: "Joel Coen" },
      { text: ", " },
      { text: "Ethan Coen", creator: "Ethan Coen" },
      { text: " · 1996" },
    ]);
  });

  it("matches a name without regard to case and keeps the byline spelling", () => {
    expect(
      splitBylineByCreators("books", "by URSULA K. LE GUIN", { authors: ["Ursula K. Le Guin"] }),
    ).toEqual([{ text: "by " }, { text: "URSULA K. LE GUIN", creator: "Ursula K. Le Guin" }]);
  });

  it("does not mark a name inside a longer word", () => {
    expect(splitBylineByCreators("books", "Annabel · 2020", { authors: ["Anna"] })).toEqual([
      { text: "Annabel · 2020" },
    ]);
  });

  it("returns the byline as one plain segment for other categories or no creators", () => {
    expect(splitBylineByCreators("articles", "Jane Doe", { authors: ["Jane Doe"] })).toEqual([
      { text: "Jane Doe" },
    ]);
    expect(splitBylineByCreators("books", "Jane Doe", null)).toEqual([{ text: "Jane Doe" }]);
  });
});
