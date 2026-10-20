import { describe, expect, it } from "vitest";

import { epubPatchFromItem, type BookItemFields } from "@/lib/epub/from-item";

function item(overrides: Partial<BookItemFields> = {}): BookItemFields {
  return { title: null, description: null, structured: {}, ...overrides };
}

describe("epubPatchFromItem", () => {
  it("maps every field a book item can carry", () => {
    const patch = epubPatchFromItem(
      item({
        title: "Leviathan Wakes",
        description: "Humanity has colonised the solar system.",
        structured: {
          authors: ["James S. A. Corey"],
          genres: ["Science Fiction"],
          series: "The Expanse",
          series_index: 1,
          page_count: 561,
          published_year: 2011,
          isbn: "9780316129084",
        },
      }),
    );

    expect(patch).toEqual({
      title: "Leviathan Wakes",
      description: "Humanity has colonised the solar system.",
      creators: ["James S. A. Corey"],
      series: "The Expanse",
      seriesIndex: 1,
    });
  });

  it("drops a series the title repeats", () => {
    // Goodreads and Hardcover write `Title (Series, #N)`. A Kobo prints the
    // series field on its own line, so the suffix would show it two times.
    const patch = epubPatchFromItem(
      item({
        title: "The Tainted Cup (Ana and Din Mysteries, #1)",
        structured: { series: "Ana and Din Mysteries", series_index: 1 },
      }),
    );

    expect(patch).toEqual({
      title: "The Tainted Cup",
      series: "Ana and Din Mysteries",
      seriesIndex: 1,
    });
  });

  it("drops the suffix whatever the series name inside it says", () => {
    // The title names one series and the field names another. The field wins,
    // because a Kobo groups on the field.
    expect(
      epubPatchFromItem(
        item({
          title: "Mistborn: The Final Empire (Mistborn, #1)",
          structured: { series: "The Mistborn Saga", series_index: 1 },
        }),
      ).title,
    ).toBe("Mistborn: The Final Empire");

    // A fractional number appears in a novella.
    expect(
      epubPatchFromItem(
        item({ title: "Edgedancer (The Stormlight Archive, #2.5)", structured: { series: "The Stormlight Archive" } }),
      ).title,
    ).toBe("Edgedancer");
  });

  it("keeps the suffix when the item has no series", () => {
    // Without the field the suffix is the only record of the series.
    expect(epubPatchFromItem(item({ title: "The Tainted Cup (Ana and Din Mysteries, #1)" })).title).toBe(
      "The Tainted Cup (Ana and Din Mysteries, #1)",
    );
  });

  it("keeps a parenthesis that carries no number", () => {
    for (const title of [
      "Circe",
      "Piranesi (a novel)",
      "Foundryside",
      "Book #1",
      "Jade City (The Green Bone Saga)",
    ]) {
      expect(epubPatchFromItem(item({ title, structured: { series: "Any Series" } })).title).toBe(title);
    }
  });

  it("keeps a title that holds nothing but the suffix", () => {
    expect(epubPatchFromItem(item({ title: "(Hierarchy, #2)", structured: { series: "Hierarchy" } })).title).toBe(
      "(Hierarchy, #2)",
    );
  });

  it("returns an empty patch for an empty item", () => {
    expect(epubPatchFromItem(item())).toEqual({});
  });

  it("omits each field the item does not have", () => {
    expect(epubPatchFromItem(item({ title: "Piranesi" }))).toEqual({ title: "Piranesi" });
    expect(epubPatchFromItem(item({ description: "A blurb." }))).toEqual({ description: "A blurb." });
    expect(epubPatchFromItem(item({ structured: { authors: ["Susanna Clarke"] } }))).toEqual({
      creators: ["Susanna Clarke"],
    });
    expect(epubPatchFromItem(item({ structured: { series: "The Expanse" } }))).toEqual({
      series: "The Expanse",
    });
  });

  it("never emits an explicit null", () => {
    const patch = epubPatchFromItem(item({ title: null, description: null }));
    expect(Object.keys(patch)).toEqual([]);
    expect("title" in patch).toBe(false);
    expect("creators" in patch).toBe(false);
  });

  it("trims strings and drops whitespace-only values", () => {
    const patch = epubPatchFromItem(
      item({
        title: "  Piranesi  ",
        description: "   ",
        structured: { authors: ["  Susanna Clarke  ", "   ", ""], series: "\t\n" },
      }),
    );

    expect(patch).toEqual({ title: "Piranesi", creators: ["Susanna Clarke"] });
  });

  it("drops an authors array that holds no usable entry", () => {
    expect(epubPatchFromItem(item({ structured: { authors: [] } }))).toEqual({});
    expect(epubPatchFromItem(item({ structured: { authors: ["  ", 7, null] } }))).toEqual({});
  });

  it("keeps the string entries and drops the rest of a mixed authors array", () => {
    const patch = epubPatchFromItem(
      item({ structured: { authors: [42, "Neal Stephenson", null, { name: "Ghost" }] } }),
    );
    expect(patch).toEqual({ creators: ["Neal Stephenson"] });
  });

  it("caps creators at five entries and drops duplicates", () => {
    const patch = epubPatchFromItem(
      item({ structured: { authors: ["A", "B", "C", "D", "E", "F", "G"] } }),
    );
    expect(patch.creators).toEqual(["A", "B", "C", "D", "E"]);

    const deduped = epubPatchFromItem(item({ structured: { authors: ["A", " A ", "B"] } }));
    expect(deduped.creators).toEqual(["A", "B"]);
  });

  it("rejects wrong runtime types in structured", () => {
    const patch = epubPatchFromItem(
      item({
        structured: {
          authors: "Susanna Clarke",
          series: ["The Expanse"],
          series_index: {},
        },
      }),
    );
    expect(patch).toEqual({});
  });

  it("rejects null and nested objects where a string belongs", () => {
    expect(
      epubPatchFromItem(item({ structured: { authors: null, series: null, series_index: null } })),
    ).toEqual({});
    expect(
      epubPatchFromItem(item({ structured: { series: { name: "The Expanse" }, series_index: 1 } })),
    ).toEqual({});
    expect(epubPatchFromItem(item({ structured: { series: 7, authors: { 0: "A" } } }))).toEqual({});
  });

  it("converts a numeric string series index", () => {
    expect(epubPatchFromItem(item({ structured: { series: "The Expanse", series_index: "2" } }))).toEqual({
      series: "The Expanse",
      seriesIndex: 2,
    });
    expect(
      epubPatchFromItem(item({ structured: { series: "The Expanse", series_index: " 2.5 " } })),
    ).toEqual({ series: "The Expanse", seriesIndex: 2.5 });
  });

  it("rejects a string series index that is not a number", () => {
    expect(
      epubPatchFromItem(item({ structured: { series: "The Expanse", series_index: "second" } })),
    ).toEqual({ series: "The Expanse" });
    expect(epubPatchFromItem(item({ structured: { series: "The Expanse", series_index: "" } }))).toEqual({
      series: "The Expanse",
    });
  });

  it("rejects a series index of zero, a negative, NaN, or Infinity", () => {
    for (const series_index of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "0", "-1", "NaN"]) {
      expect(epubPatchFromItem(item({ structured: { series: "The Expanse", series_index } }))).toEqual({
        series: "The Expanse",
      });
    }
  });

  it("drops a series index that has no series name", () => {
    expect(epubPatchFromItem(item({ structured: { series_index: 3 } }))).toEqual({});
    expect(epubPatchFromItem(item({ structured: { series: "   ", series_index: 3 } }))).toEqual({});
  });

  it("writes genre labels, then moods, as subjects", () => {
    const patch = epubPatchFromItem(
      item({ genre_keys: ["fantasy", "mystery-crime"], mood_keys: ["cozy", "slow-burn"] }),
    );
    expect(patch.subjects).toEqual(["Fantasy", "Mystery & Crime", "Mood: Cozy", "Mood: Slow burn"]);
  });

  it("ignores unknown keys and a watch-only genre", () => {
    const patch = epubPatchFromItem(item({ genre_keys: ["comedy", "nope", "horror"], mood_keys: ["sad"] }));
    expect(patch.subjects).toEqual(["Horror"]);
  });

  it("omits subjects when the item has no known genre or mood", () => {
    expect(epubPatchFromItem(item({ genre_keys: [], mood_keys: [] }))).toEqual({});
    expect(epubPatchFromItem(item({ genre_keys: ["nope"], mood_keys: null }))).toEqual({});
  });
});
