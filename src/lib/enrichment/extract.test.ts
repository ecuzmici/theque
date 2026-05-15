import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { extractFromHtml } from "@/lib/enrichment/extract";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
  const filePath = path.join(__dirname, "fixtures", name);
  return readFileSync(filePath, "utf8");
}

describe("extractFromHtml", () => {
  it("extracts OG and JSON-LD from generic blog fixture", () => {
    const html = loadFixture("generic-blog.html");
    const r = extractFromHtml(html, {
      finalUrl: "https://example.com/posts/hello?utm_source=x",
      statusCode: 200,
    });
    expect(r.title).toBe("OG Article Title");
    expect(r.description).toBe("OG description here.");
    expect(r.image_url).toBe("https://cdn.example/img.jpg");
    expect(r.raw_metadata.parser).toBe("generic");
    expect(r.raw_metadata.open_graph["og:site_name"]).toBe("Example Blog");
    expect(Array.isArray(r.raw_metadata.json_ld)).toBe(true);
  });

  it("parses IMDb Movie structured fields", () => {
    const html = loadFixture("imdb-movie.html");
    const r = extractFromHtml(html, {
      finalUrl: "https://www.imdb.com/title/tt1375666/",
      statusCode: 200,
    });
    expect(r.raw_metadata.parser).toBe("imdb");
    expect(r.structured.directors).toEqual(["Christopher Nolan"]);
    expect(r.structured.year).toBe(2010);
    expect(r.structured.runtime_minutes).toBe(148);
    expect(r.title).toContain("Inception");
  });

  it("parses Goodreads Book structured fields", () => {
    const html = loadFixture("goodreads-book.html");
    const r = extractFromHtml(html, {
      finalUrl: "https://www.goodreads.com/book/show/123.Eragon",
      statusCode: 200,
    });
    expect(r.raw_metadata.parser).toBe("goodreads");
    expect(r.structured.authors).toEqual(["Christopher Paolini"]);
    expect(r.structured.published_year).toBe(2003);
    expect(r.structured.isbn).toBe("9780375826689");
    expect(r.structured.page_count).toBe(544);
  });
});
