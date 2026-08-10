import { describe, expect, it } from "vitest";

import { buildKoboFilename } from "@/lib/epub/filename";

const CAP = 120;

function withSeriesIndex(seriesIndex: number | null): string {
  return buildKoboFilename({
    title: "Leviathan Wakes",
    authors: ["James S. A. Corey"],
    series: "The Expanse",
    seriesIndex,
  });
}

describe("buildKoboFilename", () => {
  it("builds the full author, title and series shape", () => {
    expect(
      buildKoboFilename({
        title: "Leviathan Wakes",
        authors: ["James S. A. Corey", "Daniel Abraham"],
        series: "The Expanse",
        seriesIndex: 2,
      }),
    ).toBe("James S. A. Corey - Leviathan Wakes (The Expanse 02).epub");
  });

  it("drops the author prefix when no author is known", () => {
    expect(buildKoboFilename({ title: "Piranesi" })).toBe("Piranesi.epub");
    expect(buildKoboFilename({ title: "Piranesi", authors: [] })).toBe("Piranesi.epub");
    expect(buildKoboFilename({ title: "Piranesi", authors: null })).toBe("Piranesi.epub");
  });

  it("skips blank author entries and uses the first real one", () => {
    expect(buildKoboFilename({ title: "Piranesi", authors: ["", "   ", "Susanna Clarke"] })).toBe(
      "Susanna Clarke - Piranesi.epub",
    );
  });

  it("drops the series suffix when no series is known", () => {
    expect(buildKoboFilename({ title: "Piranesi", authors: ["Susanna Clarke"] })).toBe(
      "Susanna Clarke - Piranesi.epub",
    );
    expect(
      buildKoboFilename({ title: "Piranesi", authors: ["Susanna Clarke"], seriesIndex: 3 }),
    ).toBe("Susanna Clarke - Piranesi.epub");
  });

  it("keeps the series name when the index is missing", () => {
    expect(withSeriesIndex(null)).toBe("James S. A. Corey - Leviathan Wakes (The Expanse).epub");
  });

  it.each([
    [1, "01"],
    [2, "02"],
    [9, "09"],
    [10, "10"],
    [99, "99"],
    [100, "100"],
    [1000, "1000"],
  ])("pads index %s to %s so a flat list sorts", (index, padded) => {
    expect(withSeriesIndex(index)).toBe(
      `James S. A. Corey - Leviathan Wakes (The Expanse ${padded}).epub`,
    );
  });

  it("keeps a fractional index and pads its whole part", () => {
    expect(withSeriesIndex(1.5)).toBe(
      "James S. A. Corey - Leviathan Wakes (The Expanse 01.5).epub",
    );
    expect(withSeriesIndex(12.25)).toBe(
      "James S. A. Corey - Leviathan Wakes (The Expanse 12.25).epub",
    );
  });

  it.each([0, -3, Number.NaN, Number.POSITIVE_INFINITY, 1e21])(
    "ignores the unusable index %s",
    (index) => {
      expect(withSeriesIndex(index)).toBe(
        "James S. A. Corey - Leviathan Wakes (The Expanse).epub",
      );
    },
  );

  it("removes characters that FAT32 and exFAT reject", () => {
    expect(buildKoboFilename({ title: 'Report: 1/2 * "Final"?' })).toBe("Report 12 Final.epub");
    expect(buildKoboFilename({ title: "A<B>C|D\\E" })).toBe("ABCDE.epub");
  });

  it("removes control characters but keeps the words apart", () => {
    expect(buildKoboFilename({ title: "Bad\u0000Name\u001fHere\u007f" })).toBe("BadNameHere.epub");
    expect(buildKoboFilename({ title: "Line\nBreak\tTitle" })).toBe("Line Break Title.epub");
  });

  it("strips diacritics", () => {
    expect(buildKoboFilename({ title: "Naive Cafe", authors: ["Émile Zola"] })).toBe(
      "Emile Zola - Naive Cafe.epub",
    );
    expect(buildKoboFilename({ title: "Å Ǎ ñ ü ç" })).toBe("A A n u c.epub");
  });

  it.each([
    ["Søren", "Soren"],
    ["Ø", "O"],
    ["đ", "d"],
    ["Đorđe", "Dorde"],
    ["Łódź", "Lodz"],
    ["ł", "l"],
    ["Æther", "AEther"],
    ["æon", "aeon"],
    ["Œuvre", "OEuvre"],
    ["œuvre", "oeuvre"],
    ["Straße", "Strasse"],
    ["þing", "thing"],
    ["Þórr", "Thorr"],
    ["Ðangi ð", "Dangi d"],
  ])("maps %s to %s, because NFKD leaves it alone", (title, expected) => {
    expect(buildKoboFilename({ title })).toBe(`${expected}.epub`);
  });

  it("replaces any other non-ASCII character with one placeholder", () => {
    expect(buildKoboFilename({ title: "Hello 👍 World" })).toBe("Hello _ World.epub");
    expect(buildKoboFilename({ title: "👨‍👩‍👧 Family" })).toBe("_ Family.epub");
    expect(buildKoboFilename({ title: "مرحبا بالعالم", authors: ["كاتب"] })).toBe("_ - _ _.epub");
  });

  it("collapses runs of whitespace and trims the edges", () => {
    expect(buildKoboFilename({ title: "  The   Long \t Walk \n " })).toBe("The Long Walk.epub");
    expect(buildKoboFilename({ title: "Gap", authors: ["  Stephen   King  "] })).toBe(
      "Stephen King - Gap.epub",
    );
  });

  it("strips leading and trailing dots, which break Windows and USB stacks", () => {
    expect(buildKoboFilename({ title: "...Ellipsis Book..." })).toBe("Ellipsis Book.epub");
    expect(buildKoboFilename({ title: "…Hidden…" })).toBe("Hidden.epub");
    expect(buildKoboFilename({ title: ". Dot ." })).toBe("Dot.epub");
  });

  it("caps the name at 120 characters and keeps the series suffix", () => {
    const title =
      "Alpha Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliet Kilo Lima Mike November " +
      "Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey Xray Yankee Zulu";
    const name = buildKoboFilename({
      title,
      authors: ["Ann Author"],
      series: "Mega Series",
      seriesIndex: 3,
    });

    expect(name.length).toBeLessThanOrEqual(CAP);
    expect(name).toBe(
      "Ann Author - Alpha Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliet Kilo Lima " +
        "Mike (Mega Series 03).epub",
    );
  });

  it("cuts on a word boundary and leaves no dangling separator", () => {
    const name = buildKoboFilename({ title: `${"Word ".repeat(40)}End` });

    expect(name.length).toBeLessThanOrEqual(CAP);
    expect(name).toMatch(/Word\.epub$/);
  });

  it("cuts the whole name when the author alone fills the cap", () => {
    const name = buildKoboFilename({ title: "Short Title", authors: ["A".repeat(200)] });

    expect(name.length).toBe(CAP);
    expect(name.endsWith(".epub")).toBe(true);
  });

  it("falls back to Untitled when the title is only illegal characters", () => {
    expect(buildKoboFilename({ title: '<>|*?"' })).toBe("Untitled.epub");
    expect(buildKoboFilename({ title: '<>|*?"', authors: ["Zola"] })).toBe("Zola - Untitled.epub");
  });

  it("falls back to Untitled when every input is absent", () => {
    expect(buildKoboFilename({ title: null })).toBe("Untitled.epub");
    expect(buildKoboFilename({ title: "" })).toBe("Untitled.epub");
    expect(buildKoboFilename({ title: "   " })).toBe("Untitled.epub");
    expect(buildKoboFilename({ title: null, authors: null, series: null, seriesIndex: null })).toBe(
      "Untitled.epub",
    );
  });

  it("returns the same name for the same input", () => {
    const input = { title: "Ærø Days", authors: ["Émile Zola"], series: "Nord", seriesIndex: 4 };

    expect(buildKoboFilename(input)).toBe(buildKoboFilename(input));
  });

  it.each([
    "\ud800",
    "\udfff lone tail",
    "‏‮ reversed",
    "....",
    "   ",
    "\u0000\u0001\u0002",
    "x".repeat(100_000),
    "🙂".repeat(500),
  ])("never throws and always ends in .epub for input %#", (title) => {
    const name = buildKoboFilename({ title, authors: [title], series: title, seriesIndex: 1.5 });

    expect(name.endsWith(".epub")).toBe(true);
    expect(name.length).toBeLessThanOrEqual(CAP);
    expect(name.length).toBeGreaterThan(".epub".length);
  });
});
