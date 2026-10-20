import { describe, expect, it } from "vitest";

import {
  authorSurname,
  calibreYear,
  cleanBookTitle,
  displayAuthorName,
  normalizeBookTitle,
  normalizeIsbn,
  pickOpenLibraryDoc,
  planCalibreMatches,
  titlesMatch,
  type CalibreBook,
  type LibraryBook,
} from "./calibre-match";

function book(id: number, title: string, authors: string[], extra: Partial<CalibreBook> = {}): CalibreBook {
  return {
    calibre_id: id,
    title,
    authors,
    identifiers: {},
    series: null,
    series_index: null,
    year: null,
    tags: [],
    epub_path: `/books/${id}.epub`,
    ...extra,
  };
}

function item(id: string, title: string, authors: string[], extra: Partial<LibraryBook> = {}): LibraryBook {
  return { id, title, authors, hasFile: false, createdAt: "2026-01-01T00:00:00Z", ...extra };
}

describe("normalizeBookTitle", () => {
  it("drops the series suffix, the subtitle and a leading article", () => {
    expect(normalizeBookTitle("A Drop of Corruption (Shadow of the Leviathan, #2)")).toBe("drop of corruption");
    expect(normalizeBookTitle("A Drop of Corruption: An Ana and Din Mystery")).toBe("drop of corruption");
    expect(normalizeBookTitle("Calamity: The Reckoners (Book 3)")).toBe("calamity");
    expect(normalizeBookTitle("The End of Everything: (Astrophysically Speaking)")).toBe("end of everything");
  });

  it("strips accents and punctuation", () => {
    expect(normalizeBookTitle("Mr Wilman’s Motoring Adventure")).toBe("mr wilmans motoring adventure");
    expect(normalizeBookTitle("Tomorrow, and Tomorrow, and Tomorrow: A novel")).toBe(
      "tomorrow and tomorrow and tomorrow",
    );
    expect(normalizeBookTitle("Café Crème")).toBe("cafe creme");
  });

  it("treats the Calibre underscore as a subtitle separator", () => {
    expect(normalizeBookTitle("Recursion_A Novel")).toBe("recursion");
  });

  it("keeps the case in the clean title", () => {
    expect(cleanBookTitle("Cibola Burn (The Expanse)")).toBe("Cibola Burn");
    expect(cleanBookTitle("Wool Omnibus Edition [Kindle in Motion] (Silo series Book 1)")).toBe(
      "Wool Omnibus Edition",
    );
  });
});

describe("authorSurname", () => {
  it("reads normal and inverted names", () => {
    expect(authorSurname("Robert Jackson Bennett")).toBe("bennett");
    expect(authorSurname("Bennett| Robert Jackson")).toBe("bennett");
    expect(authorSurname("Le Guin, Ursula")).toBe("guin");
    expect(authorSurname("Ursula K. Le Guin")).toBe("guin");
    expect(authorSurname("Martin Luther King, Jr.")).toBe("king");
    expect(authorSurname("Simon Stålenhag")).toBe("stalenhag");
  });

  it("reorders an inverted Calibre name for display", () => {
    expect(displayAuthorName("Mandel| Emily St. John")).toBe("Emily St. John Mandel");
    expect(displayAuthorName("Pierce Brown")).toBe("Pierce Brown");
  });
});

describe("titlesMatch", () => {
  it("matches the real Drop of Corruption pair", () => {
    expect(
      titlesMatch(
        { title: "A Drop of Corruption: An Ana and Din Mystery", authors: ["Robert Jackson Bennett"] },
        { title: "A Drop of Corruption (Shadow of the Leviathan, #2)", authors: ["Robert Jackson Bennett"] },
      ),
    ).toBe(true);
  });

  it("does not match the Three-Body omnibus to the first book", () => {
    expect(
      titlesMatch(
        {
          title: "The Three-Body Problem Series: The Three-Body Problem, The Dark Forest, Death's End",
          authors: ["Cixin Liu"],
        },
        { title: "The Three-Body Problem", authors: ["Liu Cixin"] },
      ),
    ).toBe(false);
  });

  it("needs a shared surname when both sides have authors", () => {
    expect(titlesMatch({ title: "Nemesis", authors: ["Brendan Reichs"] }, { title: "Nemesis", authors: ["Isaac Asimov"] })).toBe(
      false,
    );
    expect(titlesMatch({ title: "Nemesis", authors: ["Brendan Reichs"] }, { title: "Nemesis", authors: [] })).toBe(true);
    expect(
      titlesMatch({ title: "Watchmen", authors: ["Dave Gibbons Alan Moore"] }, { title: "Watchmen", authors: ["Alan Moore", "Dave Gibbons"] }),
    ).toBe(true);
  });
});

describe("planCalibreMatches", () => {
  it("prefers the item with authors when two items match one book", () => {
    const plan = planCalibreMatches(
      [book(52, "A Drop of Corruption: An Ana and Din Mystery", ["Robert Jackson Bennett"])],
      [
        item("no-author", "A Drop of Corruption", [], { createdAt: "2025-01-01T00:00:00Z" }),
        item("with-author", "A Drop of Corruption (Shadow of the Leviathan, #2)", ["Robert Jackson Bennett"]),
      ],
    );
    expect(plan.matched.map((m) => m.item.id)).toEqual(["with-author"]);
    expect(plan.unmatched).toEqual([]);
  });

  it("skips books without an EPUB, the Calibre guide and duplicate copies", () => {
    const plan = planCalibreMatches(
      [
        book(15, "My Clippings", ["Unknown"], { epub_path: null }),
        book(1, "Quick Start Guide", ["John Schember"]),
        book(30, "Recursion", ["Blake Crouch"], { identifiers: { isbn: "1984826018" } }),
        book(14, "Recursion_A Novel", ["Blake Crouch"], { identifiers: { isbn: "9781524759780", goodreads: "42046112" } }),
        book(115, "The Three-Body Problem Series: The Three-Body Problem, The Dark Forest, Death's End", ["Cixin Liu"]),
      ],
      [item("tbp", "The Three-Body Problem", ["Cixin Liu"])],
    );
    expect(plan.skipped.map((s) => [s.calibreId, s.reason])).toEqual([
      [15, "no_epub"],
      [1, "calibre_builtin"],
      [30, "duplicate_calibre_book"],
    ]);
    expect(plan.skipped[2].duplicateOf).toBe(14);
    expect(plan.matched).toEqual([]);
    expect(plan.unmatched.map((b) => b.calibre_id).sort((a, b) => a - b)).toEqual([14, 115]);
  });

  it("skips an item that already holds a file", () => {
    const plan = planCalibreMatches(
      [book(27, "Red Rising", ["Pierce Brown"])],
      [item("rr", "Red Rising (Red Rising Saga, #1)", ["Pierce Brown"], { hasFile: true })],
    );
    expect(plan.matched).toEqual([]);
    expect(plan.skipped).toMatchObject([{ calibreId: 27, reason: "item_has_file", itemId: "rr" }]);
  });
});

describe("pickOpenLibraryDoc", () => {
  it("takes the first work whose title and author match", () => {
    const doc = pickOpenLibraryDoc(
      [
        { key: "/works/OL1W", title: "Nemesis", author_name: ["Isaac Asimov"] },
        { key: "/works/OL2W", title: "Nemesis", author_name: ["Brendan Reichs"], first_publish_year: 2017 },
      ],
      { title: "Nemesis", authors: ["Brendan Reichs"] },
    );
    expect(doc?.key).toBe("/works/OL2W");
  });

  it("returns null when no result matches", () => {
    expect(pickOpenLibraryDoc([{ key: "/works/OL1W", title: "Other" }], { title: "Nemesis", authors: [] })).toBeNull();
  });
});

describe("Calibre fields", () => {
  it("reads years and ISBNs", () => {
    expect(calibreYear("0101")).toBeNull();
    expect(calibreYear("2019")).toBe(2019);
    expect(normalizeIsbn("978-0-449-81843-5")).toBe("9780449818435");
    expect(normalizeIsbn("0449211649")).toBe("0449211649");
    expect(normalizeIsbn("B00JNQMKSC")).toBeNull();
  });
});
