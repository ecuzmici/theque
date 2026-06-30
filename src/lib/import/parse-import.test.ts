import { describe, expect, it } from "vitest";

import {
  detectImportFormat,
  extractImportedUrls,
  parseBookmarksHtml,
  parseCsvUrls,
} from "./parse-import";

const NETSCAPE_BOOKMARKS = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
  <DT><A HREF="https://www.goodreads.com/book/show/1.Foo" ADD_DATE="1700000000">Foo</A>
  <DT><A HREF="https://example.com/article?a=1&amp;b=2">Article</A>
  <DT><A HREF="place:type=6&sort=14">Recent Tags</A>
  <DT><A HREF="javascript:void(0)">bookmarklet</A>
</DL><p>`;

// Pocket's ril_export.html is the same Netscape format.
const POCKET_HTML = `<!DOCTYPE html>
<html><head><title>Pocket Export</title></head>
<body><h1>Unread</h1><ul>
  <li><a href="https://news.example.com/story-1" time_added="1700000001">Story 1</a></li>
  <li><a href='https://blog.example.org/post'>Post</a></li>
</ul></body></html>`;

const POCKET_CSV = `title,url,time_added,tags,status
"Some Story","https://news.example.com/story-1",1700000001,,unread
"Another","https://blog.example.org/post",1700000002,tech,unread
"No link",,1700000003,,unread`;

// Goodreads "library export" — no URL column, IDs (and ISBNs) formula-guarded.
const GOODREADS_CSV = `Book Id,Title,Author,ISBN
1,The First,Jane Doe,="9780000000001"
="42",The Answer,John Roe,="9780000000042"
,Missing Id,Nobody,="9780000000099"`;

describe("parseBookmarksHtml", () => {
  it("extracts http(s) hrefs and ignores place:/javascript:", () => {
    expect(parseBookmarksHtml(NETSCAPE_BOOKMARKS)).toEqual([
      "https://www.goodreads.com/book/show/1.Foo",
      "https://example.com/article?a=1&b=2", // &amp; decoded
    ]);
  });

  it("handles single-quoted hrefs (Pocket export)", () => {
    expect(parseBookmarksHtml(POCKET_HTML)).toEqual([
      "https://news.example.com/story-1",
      "https://blog.example.org/post",
    ]);
  });

  it("returns [] for empty or link-less html", () => {
    expect(parseBookmarksHtml("")).toEqual([]);
    expect(parseBookmarksHtml("<html><body>no links</body></html>")).toEqual([]);
  });
});

describe("parseCsvUrls", () => {
  it("reads a url column (Pocket CSV) and skips blank cells", () => {
    expect(parseCsvUrls(POCKET_CSV)).toEqual([
      "https://news.example.com/story-1",
      "https://blog.example.org/post",
    ]);
  });

  it("builds Goodreads URLs from Book Id when there is no url column", () => {
    expect(parseCsvUrls(GOODREADS_CSV)).toEqual([
      "https://www.goodreads.com/book/show/1",
      "https://www.goodreads.com/book/show/42",
    ]);
  });

  it("returns [] when no url/href/book-id column is present", () => {
    expect(parseCsvUrls("title,author\nFoo,Bar")).toEqual([]);
  });

  it("returns [] for empty or header-only csv", () => {
    expect(parseCsvUrls("")).toEqual([]);
    expect(parseCsvUrls("title,url")).toEqual([]);
  });
});

describe("detectImportFormat", () => {
  it("uses the file extension first", () => {
    expect(detectImportFormat("bookmarks.html", "")).toBe("html");
    expect(detectImportFormat("export.HTM", "")).toBe("html");
    expect(detectImportFormat("pocket.csv", "")).toBe("csv");
  });

  it("sniffs content when the extension is unknown", () => {
    expect(detectImportFormat("data.txt", NETSCAPE_BOOKMARKS)).toBe("html");
    expect(detectImportFormat("data.txt", POCKET_CSV)).toBe("csv");
    expect(detectImportFormat("data.txt", "https://a.com\nhttps://b.com")).toBe("text");
  });
});

describe("extractImportedUrls", () => {
  it("dispatches to the bookmarks parser and dedupes", () => {
    const html = `${POCKET_HTML}\n<a href="https://news.example.com/story-1">dup</a>`;
    expect(extractImportedUrls("export.html", html)).toEqual([
      "https://news.example.com/story-1",
      "https://blog.example.org/post",
    ]);
  });

  it("dispatches to the csv parser", () => {
    expect(extractImportedUrls("pocket.csv", POCKET_CSV)).toEqual([
      "https://news.example.com/story-1",
      "https://blog.example.org/post",
    ]);
  });

  it("falls back to whitespace-separated URLs for plain text", () => {
    const text = "https://a.com\n  not-a-url\nhttps://b.com https://a.com";
    expect(extractImportedUrls("links.txt", text)).toEqual([
      "https://a.com",
      "https://b.com",
    ]);
  });

  it("returns [] for an empty file", () => {
    expect(extractImportedUrls("empty.html", "")).toEqual([]);
  });
});
