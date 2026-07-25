import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { csvImporterFromPreset, detectCsvPreset } from "@/lib/import/csv-engine";
import { CSV_PRESETS, storygraphPreset } from "@/lib/import/presets";
import { isIsbnLike, lastDateReadFrom } from "@/lib/import/presets/storygraph";
import type { ImportInput } from "@/lib/import/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fixture(name: string): ImportInput {
  return {
    text: readFileSync(path.join(__dirname, "..", "fixtures", name), "utf8"),
    filename: name,
  };
}

const importer = csvImporterFromPreset(storygraphPreset);

describe("isIsbnLike", () => {
  it("accepts ISBN-10 and ISBN-13 and rejects an ASIN", () => {
    expect(isIsbnLike("9780765312181")).toBe(true);
    expect(isIsbnLike("0345339681")).toBe(true);
    expect(isIsbnLike("0-345-33968-1")).toBe(true);
    expect(isIsbnLike("080442957X")).toBe(true);
    expect(isIsbnLike("B08XYZ1234")).toBe(false);
    expect(isIsbnLike("12345")).toBe(false);
  });
});

describe("lastDateReadFrom", () => {
  it("takes the latest date out of a list of ranges", () => {
    expect(lastDateReadFrom("2024/01/01-2024/01/07, 2024/02/20-2024/03/02")).toBe(
      "2024-03-02T00:00:00.000Z",
    );
    expect(lastDateReadFrom("2023/07/01")).toBe("2023-07-01T00:00:00.000Z");
    expect(lastDateReadFrom(null)).toBeNull();
  });
});

describe("storygraph preset", () => {
  it("is picked over the books preset for a StoryGraph export", () => {
    expect(detectCsvPreset(fixture("storygraph.csv"), CSV_PRESETS)?.id).toBe("storygraph");
  });

  it("builds an Open Library URL and rounds the quarter-star rating", async () => {
    const result = await importer.parse(fixture("storygraph.csv"));
    expect(result.rows[0]).toMatchObject({
      url: "https://openlibrary.org/isbn/9780765312181",
      title: "Anathem",
      subtitle: "Neal Stephenson",
      category: "books",
      status: "done",
      rating_personal: 4,
      verdict: "Dense but worth it.",
      labels: ["sci-fi", "long"],
      created_at_hint: "2022-01-03T00:00:00.000Z",
    });
    expect(result.rows[0].source_ref.raw_rating).toBe("4.25");
    expect(result.rows[1].rating_personal).toBe(5);
  });

  it("prefers Last Date Read, falling back to the end of Dates Read", async () => {
    const result = await importer.parse(fixture("storygraph.csv"));
    expect(result.rows[0].done_at).toBe("2024-03-02T00:00:00.000Z");
    // No Last Date Read: the last date inside the range cell is used instead.
    expect(result.rows[1].done_at).toBe("2023-07-04T00:00:00.000Z");
  });

  it("treats an empty Star Rating as unrated rather than zero", async () => {
    const result = await importer.parse(fixture("storygraph.csv"));
    const hobbit = result.rows.find((row) => row.title === "The Hobbit");
    expect(hobbit?.rating_personal).toBeNull();
    expect(hobbit?.source_ref.raw_rating).toBeNull();
  });

  it("maps did-not-finish to dismissed and to-read to want", async () => {
    const result = await importer.parse(fixture("storygraph.csv"));
    expect(result.rows.find((row) => row.title === "The Hobbit")?.status).toBe("dismissed");
    expect(result.rows.find((row) => row.title === "Birnam Wood")?.status).toBe("want");
  });

  it("skips an ASIN row with the real reason instead of a dead openlibrary URL", async () => {
    const result = await importer.parse(fixture("storygraph.csv"));
    expect(result.rows.some((row) => row.url.includes("B08XYZ1234"))).toBe(false);
    expect(result.skipped.map((skip) => skip.reason)).toEqual([
      "identifier_not_an_isbn",
      "missing_isbn",
    ]);
    expect(result.skipped[0].raw).toContain("Project Hail Mary");
  });
});
