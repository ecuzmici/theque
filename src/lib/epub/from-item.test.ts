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
});
