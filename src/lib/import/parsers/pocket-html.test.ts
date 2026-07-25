import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  detectPocketHtml,
  parsePocketHtml,
  statusForPocketHeading,
} from "@/lib/import/parsers/pocket-html";
import type { ImportInput } from "@/lib/import/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
  return readFileSync(path.join(__dirname, "..", "fixtures", name), "utf8");
}

function input(text: string, filename?: string): ImportInput {
  return { text, filename: filename ?? null };
}

describe("parsePocketHtml", () => {
  const result = parsePocketHtml(input(loadFixture("pocket-export.html"), "ril_export.html"));

  it("reads the flat ul/li list", () => {
    expect(result.rows.map((row) => row.url)).toEqual([
      "https://example.com/unread-one",
      "https://example.com/unread-two",
      "https://example.com/archived",
    ]);
    expect(result.skipped).toEqual([]);
  });

  it("takes status from the section heading", () => {
    expect(result.rows.map((row) => row.status)).toEqual(["want", "want", "done"]);
  });

  it("categorises everything as articles", () => {
    for (const row of result.rows) {
      expect(row.category).toBe("articles");
      expect(row.source_ref).toEqual({ importer: "pocket-html", file: "ril_export.html" });
    }
  });

  it("converts time_added from Unix seconds", () => {
    expect(result.rows[0].created_at_hint).toBe("2020-09-13T12:26:40.000Z");
  });

  it("splits comma-delimited tags and tolerates an empty tags attribute", () => {
    // Comma-delimited here; the CSV export uses pipes instead.
    expect(result.rows[0].labels).toEqual(["tech", "ai"]);
    expect(result.rows[1].labels).toEqual([]);
  });

  it("falls back to the URL when the anchor text is empty", () => {
    expect(result.rows[1].title).toBe("https://example.com/unread-two");
  });

  it("never invents a done_at for archived items", () => {
    // time_added is when it was saved, not when it was read.
    expect(result.rows[2].done_at).toBeUndefined();
  });
});

describe("statusForPocketHeading", () => {
  it("matches Read Archive before Unread, since Unread contains 'read'", () => {
    expect(statusForPocketHeading("Unread")).toBe("want");
    expect(statusForPocketHeading("Read Archive")).toBe("done");
    expect(statusForPocketHeading("  read archive  ")).toBe("done");
    expect(statusForPocketHeading("Something else")).toBeNull();
    expect(statusForPocketHeading(null)).toBeNull();
  });
});

describe("section edge cases", () => {
  it("handles an empty Unread section followed by a populated archive", () => {
    const html = `<html><head><title>Pocket Export</title></head><body>
      <h1>Unread</h1>
      <ul></ul>
      <h1>Read Archive</h1>
      <ul><li><a href="https://example.com/a" time_added="1600000000" tags="">A</a></li></ul>
      </body></html>`;
    const result = parsePocketHtml(input(html));
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].status).toBe("done");
  });

  it("defaults to want for anchors that precede any heading", () => {
    const html = `<html><body><ul><li><a href="https://example.com/a" time_added="1600000000">A</a></li></ul></body></html>`;
    expect(parsePocketHtml(input(html)).rows[0].status).toBe("want");
  });

  it("skips unsupported schemes with a reason", () => {
    const html = `<html><head><title>Pocket Export</title></head><body><h1>Unread</h1><ul>
      <li><a href="javascript:void(0)" time_added="1600000000">Bad</a></li>
      <li><a href="https://example.com/ok" time_added="1600000001">Good</a></li>
      </ul></body></html>`;
    const result = parsePocketHtml(input(html));
    expect(result.rows).toHaveLength(1);
    expect(result.skipped).toEqual([
      { reason: "unsupported_scheme", raw: "javascript:void(0)" },
    ]);
  });

  it("warns rather than failing on an export with no items", () => {
    const html = `<html><head><title>Pocket Export</title></head><body><h1>Unread</h1><ul></ul></body></html>`;
    const result = parsePocketHtml(input(html));
    expect(result.rows).toEqual([]);
    expect(result.warnings).toEqual(["No saved items were found in this file."]);
  });
});

describe("detectPocketHtml", () => {
  it("recognises the exporter's own fingerprints", () => {
    expect(detectPocketHtml(input(loadFixture("pocket-export.html")))).toBe(true);
    expect(detectPocketHtml(input("<title>Pocket Export</title>"))).toBe(true);
    expect(detectPocketHtml(input("<!--So long and thanks for all the fish-->"))).toBe(true);
  });

  it("never claims a Netscape bookmark file", () => {
    expect(detectPocketHtml(input(loadFixture("chrome-bookmarks.html")))).toBe(false);
    expect(detectPocketHtml(input(loadFixture("safari-bookmarks.html")))).toBe(false);
  });
});
