import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  csvImporterFromMapping,
  csvImporterFromPreset,
  detectCsvPreset,
  normalizeHeader,
  parseCsvWithMapping,
  readCsvHeaders,
  readCsvTable,
  type CsvColumnMapping,
} from "@/lib/import/csv-engine";
import { CSV_PRESETS, pocketCsvPreset, urlListPreset } from "@/lib/import/presets";
import type { ImportInput } from "@/lib/import/types";
import { MAX_NOTE_LENGTH } from "@/lib/input-limits";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
  return readFileSync(path.join(__dirname, "fixtures", name), "utf8");
}

function input(text: string, filename?: string): ImportInput {
  return { text, filename: filename ?? null };
}

const BOM = "\uFEFF";

describe("readCsvTable", () => {
  it("keeps quoted commas, embedded quotes and literal newlines intact", () => {
    // The reason this engine uses a real RFC-4180 parser: every one of these
    // appears in a normal Goodreads or Letterboxd review column, and splitting
    // on commas would corrupt all three silently.
    const text = [
      "url,title,review",
      '"https://example.com/a","Eats, Shoots & Leaves","She said ""fine"", then left"',
      '"https://example.com/b","Multiline","first line\nsecond line"',
    ].join("\n");

    const table = readCsvTable(text);
    expect(table.headers).toEqual(["url", "title", "review"]);
    expect(table.records).toHaveLength(2);
    expect(table.records[0][1]).toBe("Eats, Shoots & Leaves");
    expect(table.records[0][2]).toBe('She said "fine", then left');
    expect(table.records[1][2]).toBe("first line\nsecond line");
  });

  it("handles a UTF-8 BOM and CRLF line endings", () => {
    const text = `${BOM}url,title\r\nhttps://example.com/a,Alpha\r\nhttps://example.com/b,Beta\r\n`;
    const table = readCsvTable(text);
    expect(table.headers).toEqual(["url", "title"]);
    expect(table.records).toHaveLength(2);
    expect(table.records[1][1]).toBe("Beta");
  });

  it("keeps the first of duplicate headers and warns", () => {
    // `header: true` parsers silently last-wins here, which loses data.
    const text = ["url,title,title", "https://example.com/a,First,Second"].join("\n");
    const table = readCsvTable(text);
    expect(table.warnings.some((w) => w.includes("Duplicate column"))).toBe(true);

    const result = parseCsvWithMapping(input(text), { url: "url", title: "title" });
    expect(result.rows[0].title).toBe("First");
  });

  it("skips blank records without shifting reported line numbers", () => {
    const text = ["url", "https://example.com/a", "", "https://example.com/b"].join("\n");
    const table = readCsvTable(text);
    expect(table.records).toHaveLength(2);
    expect(table.recordNumbers).toEqual([2, 4]);
  });

  it("auto-detects a semicolon delimiter", () => {
    const table = readCsvTable("url;title\nhttps://example.com/a;Alpha");
    expect(table.headers).toEqual(["url", "title"]);
    expect(table.records[0][1]).toBe("Alpha");
  });

  it("caps the number of rows read and says so", () => {
    const text = ["url", ...Array.from({ length: 10 }, (_, i) => `https://example.com/${i}`)].join("\n");
    const table = readCsvTable(text, { maxRows: 3 });
    expect(table.records).toHaveLength(3);
    expect(table.warnings.some((w) => w.includes("Only the first 3 rows"))).toBe(true);
  });
});

describe("normalizeHeader", () => {
  it("folds case, underscores and hyphens so presets can name columns naturally", () => {
    expect(normalizeHeader("Time_Added")).toBe("time added");
    expect(normalizeHeader("  Exclusive-Shelf ")).toBe("exclusive shelf");
    expect(normalizeHeader(`${BOM}Book Id`)).toBe("book id");
    expect(normalizeHeader(null)).toBe("");
  });
});

describe("readCsvHeaders", () => {
  it("exposes column names for a mapping UI", () => {
    expect(readCsvHeaders("Book Id,Title,My Rating\n1,X,3")).toEqual([
      "Book Id",
      "Title",
      "My Rating",
    ]);
  });
});

describe("parseCsvWithMapping", () => {
  it("records a reason for every rejected row instead of dropping it", () => {
    // A silent drop rate is the fastest way to destroy trust in an importer.
    const text = [
      "url,title",
      "https://example.com/ok,Fine",
      ",No URL at all",
      "javascript:void(0),Bookmarklet",
      "definitely not a url,Junk",
    ].join("\n");

    const result = parseCsvWithMapping(input(text), { url: "url", title: "title" });
    expect(result.rows).toHaveLength(1);
    expect(result.skipped).toEqual([
      { line: 3, reason: "missing_url", raw: ", No URL at all" },
      { line: 4, reason: "unsupported_scheme", raw: "javascript:void(0)" },
      { line: 5, reason: "invalid_url", raw: "definitely not a url" },
    ]);
  });

  it("does not throw on a row missing a URL", () => {
    expect(() =>
      parseCsvWithMapping(input("url\n\n"), { url: "url" }),
    ).not.toThrow();
  });

  it("unwraps Excel escaping in mapped cells", () => {
    const text = ['url,isbn', '"https://example.com/a","=""9780375826689"""'].join("\n");
    const result = parseCsvWithMapping(input(text), {
      url: "url",
      external_id: "isbn",
    });
    expect(result.rows[0].source_ref.external_id).toBe("9780375826689");
  });

  it("keeps the URL raw rather than normalizing it", () => {
    // Canonicalization belongs to the ingest layer; normalizing here would
    // destroy the evidence needed to explain a dropped or deduped row.
    const raw = "https://Example.com/A/?utm_source=news&b=1#frag";
    const result = parseCsvWithMapping(input(`url\n${raw}`), { url: "url" });
    expect(result.rows[0].url).toBe(raw);
  });

  it("normalizes ratings through the named scale and keeps the original", () => {
    const text = ["url,score", "https://example.com/a,9", "https://example.com/b,0"].join("\n");
    const result = parseCsvWithMapping(input(text), {
      url: "url",
      rating: { columns: ["score"], scale: "ten" },
    });
    expect(result.rows[0].rating_personal).toBe(5);
    expect(result.rows[0].source_ref.raw_rating).toBe("9");
    // 0 means unrated, not one star.
    expect(result.rows[1].rating_personal).toBeNull();
    expect(result.rows[1].source_ref.raw_rating).toBe("0");
  });

  it("truncates a verdict at MAX_NOTE_LENGTH", () => {
    const long = "z".repeat(MAX_NOTE_LENGTH + 400);
    const result = parseCsvWithMapping(input(`url,review\nhttps://example.com/a,${long}`), {
      url: "url",
      verdict: "review",
    });
    expect(result.rows[0].verdict).toHaveLength(MAX_NOTE_LENGTH);
  });

  it("supports derived values, defaults and label splitting", () => {
    const text = [
      "book id,shelf,tags,rating",
      "12345,read,\"sci-fi; classics\",4",
      "67890,to-read,,0",
    ].join("\n");

    const mapping: CsvColumnMapping = {
      // A derived URL built from an id column — no URL column in the file.
      url: {
        columns: ["book id"],
        derive: (value) => (value ? `https://www.goodreads.com/book/show/${value}` : null),
      },
      status: {
        columns: ["shelf"],
        derive: (value) => (value === "read" ? "done" : "want"),
      },
      labels: { columns: ["tags"] },
      rating: { columns: ["rating"], scale: "five" },
    };

    const result = parseCsvWithMapping(input(text), mapping, {
      importer: "example",
      defaults: { category: "books" },
    });

    expect(result.rows[0]).toMatchObject({
      url: "https://www.goodreads.com/book/show/12345",
      category: "books",
      status: "done",
      rating_personal: 4,
      labels: ["sci-fi", "classics"],
    });
    expect(result.rows[1]).toMatchObject({ status: "want", rating_personal: null });
    expect(result.rows[0].source_ref).toMatchObject({ importer: "example", line: 2 });
  });

  it("ignores unrecognised category and status values with a warning", () => {
    const text = "url,category,status\nhttps://example.com/a,music,archived";
    const result = parseCsvWithMapping(input(text), {
      url: "url",
      category: "category",
      status: "status",
    });
    expect(result.rows[0].category).toBeNull();
    expect(result.rows[0].status).toBe("want");
    expect(result.warnings).toHaveLength(2);
  });

  it("falls back to conventional URL columns when the mapping names none", () => {
    const result = parseCsvWithMapping(input("Link,Title\nhttps://example.com/a,Alpha"), {
      title: "title",
    });
    expect(result.rows[0].url).toBe("https://example.com/a");
  });
});

describe("user-supplied column mapping", () => {
  it("imports an arbitrary CSV without any preset", () => {
    // The path that makes any CSV importable: a user points at the columns.
    const text = [
      "Ссылка,Название,Оценка",
      "https://example.com/a,Альфа,8",
      "https://example.com/b,Бета,2",
    ].join("\n");

    const importer = csvImporterFromMapping({
      url: "Ссылка",
      title: "Название",
      rating: { columns: ["Оценка"], scale: "ten" },
    });

    expect(importer.detect(input(text))).toBe(false);
    return importer.parse(input(text, "export.csv")).then((result) => {
      expect(result.rows.map((r) => r.title)).toEqual(["Альфа", "Бета"]);
      expect(result.rows.map((r) => r.rating_personal)).toEqual([4, 1]);
      expect(result.rows[0].source_ref.file).toBe("export.csv");
    });
  });
});

describe("url-list preset", () => {
  it("reads a headered URL list", async () => {
    const importer = csvImporterFromPreset(urlListPreset);
    const text = ["url,title,note", "https://example.com/a,Alpha,Nice one"].join("\n");
    expect(importer.detect(input(text))).toBe(true);

    const result = await importer.parse(input(text));
    expect(result.rows[0]).toMatchObject({
      url: "https://example.com/a",
      title: "Alpha",
      verdict: "Nice one",
      status: "want",
      category: null,
    });
  });

  it("reads a headerless list of bare URLs", async () => {
    // "auto" header mode: a header row never contains a URL.
    const text = ["https://example.com/a", "https://example.com/b"].join("\n");
    const importer = csvImporterFromPreset(urlListPreset);
    expect(importer.detect(input(text))).toBe(true);

    const result = await importer.parse(input(text, "links.txt"));
    expect(result.rows.map((r) => r.url)).toEqual([
      "https://example.com/a",
      "https://example.com/b",
    ]);
    expect(result.skipped).toEqual([]);
  });
});

describe("pocket-csv preset", () => {
  it("maps status archive→done and splits pipe-delimited tags", async () => {
    const importer = csvImporterFromPreset(pocketCsvPreset);
    const text = loadFixture("pocket-part.csv");
    expect(importer.detect(input(text))).toBe(true);

    const result = await importer.parse(input(text, "part_000000.csv"));
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toMatchObject({
      url: "https://example.com/hello",
      title: "Hello, world",
      category: "articles",
      status: "want",
      // Pipe-delimited here, unlike the comma-delimited HTML export.
      labels: ["tech", "ai"],
      created_at_hint: "2020-09-13T12:26:40.000Z",
    });
    // "archive", not "archived".
    expect(result.rows[1].status).toBe("done");
    expect(result.rows[2].labels).toEqual([]);
  });
});

describe("detectCsvPreset", () => {
  it("prefers a specific preset over the url-list fallback", () => {
    expect(detectCsvPreset(input(loadFixture("pocket-part.csv")), CSV_PRESETS)?.id).toBe(
      "pocket-csv",
    );
    expect(detectCsvPreset(input("url,title\nhttps://example.com/a,Alpha"), CSV_PRESETS)?.id).toBe(
      "url-list",
    );
  });

  it("returns null when nothing matches", () => {
    expect(detectCsvPreset(input("alpha,beta\n1,2"), CSV_PRESETS)).toBeNull();
  });

  it("keeps url-list last in the registry so it only ever catches leftovers", () => {
    expect(CSV_PRESETS[CSV_PRESETS.length - 1].id).toBe("url-list");
  });
});
