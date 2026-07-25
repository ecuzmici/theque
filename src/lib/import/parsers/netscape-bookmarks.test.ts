import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  detectNetscapeBookmarks,
  parseNetscapeBookmarks,
} from "@/lib/import/parsers/netscape-bookmarks";
import type { ImportInput } from "@/lib/import/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
  return readFileSync(path.join(__dirname, "..", "fixtures", name), "utf8");
}

function input(text: string, filename?: string): ImportInput {
  return { text, filename: filename ?? null };
}

describe("Chrome-shaped export", () => {
  const result = parseNetscapeBookmarks(input(loadFixture("chrome-bookmarks.html"), "bookmarks.html"));
  const byUrl = new Map(result.rows.map((row) => [row.url, row]));

  it("reads bookmarks despite unclosed DT/DD/P tags", () => {
    expect(result.rows).toHaveLength(3);
    expect([...byUrl.keys()]).toEqual([
      "https://example.com/one",
      "https://example.com/nested",
      "https://example.com/top",
    ]);
  });

  it("maps the folder path to labels", () => {
    expect(byUrl.get("https://example.com/one")?.labels).toEqual(["Bookmarks bar"]);
    // Nested folder plus the non-standard TAGS attribute (Firefox, linkding,
    // Karakeep, Raindrop), which is comma-delimited.
    expect(byUrl.get("https://example.com/nested")?.labels).toEqual([
      "Bookmarks bar",
      "Reading",
      "essay",
      "longread",
    ]);
    // A top-level bookmark has no folder.
    expect(byUrl.get("https://example.com/top")?.labels).toEqual([]);
  });

  it("converts ADD_DATE from Unix seconds", () => {
    expect(byUrl.get("https://example.com/one")?.created_at_hint).toBe(
      "2020-09-13T12:26:41.000Z",
    );
  });

  it("reads the <DD> description that follows a bookmark", () => {
    expect(byUrl.get("https://example.com/one")?.description).toBe("A description for one");
    expect(byUrl.get("https://example.com/top")?.description).toBeNull();
  });

  it("discards ICON favicons rather than treating them as cover images", () => {
    // A 5,000-bookmark Chrome export is 10-20 MB and ~95% base64 favicon.
    for (const row of result.rows) {
      expect(row.image_url).toBeNull();
      expect(JSON.stringify(row)).not.toContain("base64");
    }
  });

  it("routes bookmarklets and browser-internal URLs to skipped with a reason", () => {
    expect(result.skipped).toEqual([
      { reason: "unsupported_scheme", raw: "javascript:void(0)" },
      { reason: "unsupported_scheme", raw: "chrome://bookmarks/" },
    ]);
  });

  it("leaves the category to the app's classifier and defaults to want", () => {
    for (const row of result.rows) {
      expect(row.category).toBeNull();
      expect(row.status).toBe("want");
      expect(row.source_ref).toEqual({
        importer: "netscape-bookmarks",
        file: "bookmarks.html",
      });
    }
  });
});

describe("Safari-shaped export", () => {
  // Safari writes no ADD_DATE, no ICON, no TAGS, no <DD>, emits a valueless
  // <H3 FOLDED>, leaves <HTML> unclosed, and has no root <DL> wrapper — a
  // parser that iterates "the first <DL>" silently misbehaves here.
  const result = parseNetscapeBookmarks(input(loadFixture("safari-bookmarks.html")));

  it("finds every bookmark without a root DL wrapper", () => {
    expect(result.rows.map((row) => row.url)).toEqual([
      "https://example.org/favorite",
      "https://example.org/later",
      "https://example.org/loose",
    ]);
    expect(result.skipped).toEqual([]);
  });

  it("still resolves folder names from the valueless <H3 FOLDED> headings", () => {
    expect(result.rows.map((row) => row.labels)).toEqual([
      ["Favorites"],
      ["Reading List"],
      [],
    ]);
  });

  it("leaves created_at_hint null when the file carries no ADD_DATE", () => {
    for (const row of result.rows) {
      expect(row.created_at_hint).toBeNull();
      expect(row.title).not.toBeNull();
    }
  });
});

describe("malformed and hostile input", () => {
  it("recovers from badly nested, unclosed markup", () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
      <DL><p>
      <DT><H3>Folder
      <DL><p>
      <DT><A HREF="https://example.com/a">Alpha
      <DT><A HREF="https://example.com/b">Beta`;
    const result = parseNetscapeBookmarks(input(html));
    expect(result.rows.map((row) => row.url)).toEqual([
      "https://example.com/a",
      "https://example.com/b",
    ]);
  });

  it("skips an anchor with an empty href rather than throwing", () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><A HREF="">Nothing</A></DL>`;
    const result = parseNetscapeBookmarks(input(html));
    expect(result.rows).toEqual([]);
    expect(result.skipped[0].reason).toBe("missing_url");
  });

  it("skips a row whose ADD_DATE is Chrome's 1601-epoch microseconds", () => {
    // That magnitude means the user handed over Chrome's `Bookmarks` JSON, not
    // the HTML export; emitting a year-53000 date would be worse than skipping.
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><A HREF="https://example.com/a" ADD_DATE="13244025600000000">A</A></DL>`;
    const result = parseNetscapeBookmarks(input(html));
    expect(result.rows).toEqual([]);
    expect(result.skipped[0].reason).toBe("timestamp_out_of_range");
  });

  it("reads lower-case attribute names too", () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><a href="https://example.com/a" add_date="1600000000" tags="one,two">A</a></DL>`;
    const result = parseNetscapeBookmarks(input(html));
    expect(result.rows[0].created_at_hint).toBe("2020-09-13T12:26:40.000Z");
    expect(result.rows[0].labels).toEqual(["one", "two"]);
  });

  it("caps the number of bookmarks read", () => {
    const anchors = Array.from(
      { length: 6 },
      (_, i) => `<DT><A HREF="https://example.com/${i}">Item ${i}</A>`,
    ).join("");
    const result = parseNetscapeBookmarks(input(`<DL><p>${anchors}</DL>`), { maxRows: 2 });
    expect(result.rows).toHaveLength(2);
    expect(result.warnings.some((w) => w.includes("Only the first 2"))).toBe(true);
  });

  it("warns rather than failing on a file with no bookmarks", () => {
    const result = parseNetscapeBookmarks(input("<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p></DL>"));
    expect(result.rows).toEqual([]);
    expect(result.warnings).toEqual(["No bookmarks were found in this file."]);
  });
});

describe("detectNetscapeBookmarks", () => {
  it("matches on the doctype and on a bare DL/DT skeleton", () => {
    expect(detectNetscapeBookmarks(input(loadFixture("chrome-bookmarks.html")))).toBe(true);
    expect(detectNetscapeBookmarks(input(loadFixture("safari-bookmarks.html")))).toBe(true);
    expect(detectNetscapeBookmarks(input('<DL><p><DT><A HREF="https://x.test">x</A></DL>'))).toBe(
      true,
    );
  });

  it("does not claim Pocket's flat list", () => {
    expect(detectNetscapeBookmarks(input(loadFixture("pocket-export.html")))).toBe(false);
  });
});
