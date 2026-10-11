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

  it("cleans an IMDb og:title that carries the year, rating and genres", () => {
    const html = loadFixture("imdb-og-title-rating.html");
    const r = extractFromHtml(html, {
      finalUrl: "https://www.imdb.com/title/tt0098936/",
      statusCode: 200,
    });
    expect(r.raw_metadata.parser).toBe("imdb");
    expect(r.title).toBe("Twin Peaks");
    expect(r.structured.year).toBe(1990);
    expect(r.structured.genres).toEqual(["Crime", "Drama", "Mystery"]);
  });

  it("parses Recipe structured fields from @graph JSON-LD", () => {
    const html = loadFixture("recipe-graph.html");
    const r = extractFromHtml(html, {
      finalUrl: "https://www.kingarthurbaking.com/recipes/chocolate-chip-cookies-recipe",
      statusCode: 200,
    });
    expect(r.title).toBe("Classic Chocolate Chip Cookies");
    expect(r.structured.author).toBe("PJ Hamel");
    expect(r.structured.prep_time_minutes).toBe(12);
    expect(r.structured.cook_time_minutes).toBe(12);
    expect(r.structured.yield).toBe("36 cookies");
    expect(r.structured.rating).toBe(4.8);
  });

  it("parses Amazon product fields and normalizes title", () => {
    const html = loadFixture("amazon-product.html");
    const r = extractFromHtml(html, {
      finalUrl: "https://www.amazon.com/dp/B0BDHWDR12",
      statusCode: 200,
    });
    expect(r.raw_metadata.parser).toBe("amazon");
    expect(r.title).toBe("Test Product");
    expect(r.image_url).toBe("https://cdn.example/product.jpg");
    expect(r.structured.brand).toBe("Acme");
    expect(r.structured.price).toEqual({ amount: 49.99, currency: "USD" });
  });

  it("uses JSON-LD image metadata when social image tags are missing", () => {
    const r = extractFromHtml(
      `<!doctype html>
      <html>
        <head>
          <title>Useful item</title>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Thing",
              "name": "Useful item",
              "image": {
                "@type": "ImageObject",
                "url": "https://cdn.example/useful-item.jpg"
              }
            }
          </script>
        </head>
        <body></body>
      </html>`,
      {
        finalUrl: "https://example.com/useful-item",
        statusCode: 200,
      },
    );

    expect(r.image_url).toBe("https://cdn.example/useful-item.jpg");
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

  it("prefers the full Goodreads body description over the truncated og:description", () => {
    const html = `<!doctype html><html><head>
      <meta property="og:description" content="The six hundred passengers and crew members aboard a ju…" />
    </head><body>
      <div data-testid="description"><span class="Formatted">The six hundred passengers and crew members aboard a jumbo jetliner are left without a destination.<br /><br />Captain Jonah Scott became responsible for the entire human race.</span></div>
    </body></html>`;
    const r = extractFromHtml(html, {
      finalUrl: "https://www.goodreads.com/book/show/2034476.Down_to_a_Sunless_Sea",
      statusCode: 200,
    });
    expect(r.description).toBe(
      "The six hundred passengers and crew members aboard a jumbo jetliner are left without a destination. Captain Jonah Scott became responsible for the entire human race.",
    );
    expect(r.description).not.toContain("…");
  });
});
