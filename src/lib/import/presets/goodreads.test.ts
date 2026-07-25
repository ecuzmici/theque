import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { csvImporterFromPreset, detectCsvPreset } from "@/lib/import/csv-engine";
import { CSV_PRESETS, goodreadsPreset } from "@/lib/import/presets";
import type { ImportInput } from "@/lib/import/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fixture(name: string): ImportInput {
  return {
    text: readFileSync(path.join(__dirname, "..", "fixtures", name), "utf8"),
    filename: name,
  };
}

const importer = csvImporterFromPreset(goodreadsPreset);

describe("goodreads preset", () => {
  it("is chosen over the generic presets for a library export", () => {
    expect(detectCsvPreset(fixture("goodreads-current.csv"), CSV_PRESETS)?.id).toBe("goodreads");
    expect(detectCsvPreset(fixture("goodreads-2021.csv"), CSV_PRESETS)?.id).toBe("goodreads");
  });

  it("builds the book URL from Book Id and maps the read shelf to done", async () => {
    const result = await importer.parse(fixture("goodreads-current.csv"));
    expect(result.rows).toHaveLength(3);

    expect(result.rows[0]).toMatchObject({
      url: "https://www.goodreads.com/book/show/1234",
      title: "Anathem",
      subtitle: "Neal Stephenson",
      category: "books",
      status: "done",
      rating_personal: 5,
      // YYYY/MM/DD with slashes, read as UTC.
      done_at: "2023-07-14T00:00:00.000Z",
      created_at_hint: "2022-01-03T00:00:00.000Z",
      labels: ["sci-fi", "favorites"],
    });
    expect(result.rows[0].source_ref).toMatchObject({
      importer: "goodreads",
      external_id: "1234",
      raw_rating: "5",
    });
  });

  it("flattens the HTML in My Review", async () => {
    const result = await importer.parse(fixture("goodreads-current.csv"));
    expect(result.rows[0].verdict).toBe("Loved it, eventually.\nSlow start.");
  });

  it("treats My Rating 0 as unrated and never reads Average Rating", async () => {
    const result = await importer.parse(fixture("goodreads-current.csv"));
    // Average Rating for this row is 4.24 — a community mean, not a verdict.
    expect(result.rows[1].rating_personal).toBeNull();
    expect(result.rows[1].source_ref.raw_rating).toBe("0");
  });

  it("keeps to-read and currently-reading on the want shelf", async () => {
    const result = await importer.parse(fixture("goodreads-current.csv"));
    expect(result.rows[1].status).toBe("want");
    expect(result.rows[2].status).toBe("want");
  });

  it("leaves Date Read empty rather than inventing one", async () => {
    const result = await importer.parse(fixture("goodreads-current.csv"));
    expect(result.rows[1].done_at).toBeNull();
    expect(result.rows[2].done_at).toBeNull();
  });

  it("drops exclusive shelves from labels and falls back to Private Notes", async () => {
    const result = await importer.parse(fixture("goodreads-current.csv"));
    // Bookshelves for this row is just "to-read", which is already the status.
    expect(result.rows[1].labels).toEqual([]);
    expect(result.rows[2].labels).toEqual(["fantasy", "re-read"]);
    expect(result.rows[2].verdict).toBe("Rereading before the film.");
  });

  it("reads the 31-column pre-2022 export, where Owned Copies is not last", async () => {
    // The era that proves name-based mapping matters: seven extra purchase
    // columns sit between Read Count and the end of the row.
    const result = await importer.parse(fixture("goodreads-2021.csv"));
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      url: "https://www.goodreads.com/book/show/4321",
      title: "Dune",
      subtitle: "Frank Herbert",
      status: "done",
      rating_personal: 3,
      verdict: "Worth the reputation.",
      done_at: "2019-11-30T00:00:00.000Z",
      labels: ["sci-fi", "classics"],
    });
  });
});
