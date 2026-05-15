import { describe, expect, it } from "vitest";

import { classify } from "@/lib/classify/index";

describe("classify", () => {
  it("imdb domain maps to movies_and_tv", () => {
    const r = classify({
      domain: "www.imdb.com",
      pathname: "/title/tt123",
      jsonLd: [],
    });
    expect(r.category).toBe("movies_and_tv");
    expect(r.category_confidence).toBe(0.95);
    expect(r.category_source).toBe("domain");
  });

  it("goodreads maps to books", () => {
    const r = classify({
      domain: "goodreads.com",
      pathname: "/book/show/1",
      jsonLd: [],
    });
    expect(r.category).toBe("books");
    expect(r.category_source).toBe("domain");
  });

  it("unknown domain with Book JSON-LD maps to books via schema", () => {
    const r = classify({
      domain: "example.org",
      pathname: "/story",
      jsonLd: [{ "@type": "Book", name: "Test" }],
    });
    expect(r.category).toBe("books");
    expect(r.category_confidence).toBe(0.85);
    expect(r.category_source).toBe("schema_org");
  });

  it("unknown domain falls back to articles with low confidence", () => {
    const r = classify({
      domain: "unknown.example",
      pathname: "/post/hello",
      jsonLd: [],
    });
    expect(r.category).toBe("articles");
    expect(r.category_confidence).toBe(0.4);
    expect(r.category_source).toBe("heuristic");
  });
});
