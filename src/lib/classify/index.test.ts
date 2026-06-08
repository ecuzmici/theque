import { describe, expect, it } from "vitest";

import { classify } from "@/lib/classify/index";

describe("classify", () => {
  it("imdb domain maps to movies_and_tv (authoritative)", () => {
    const r = classify({
      domain: "www.imdb.com",
      pathname: "/title/tt123",
      jsonLd: [],
    });
    expect(r.category).toBe("movies_and_tv");
    expect(r.category_confidence).toBe(0.95);
    expect(r.category_source).toBe("domain");
  });

  it("goodreads maps to books (authoritative)", () => {
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

  it("unknown domain falls back to null with low confidence", () => {
    const r = classify({
      domain: "unknown.example",
      pathname: "/post/hello",
      jsonLd: [],
    });
    expect(r.category).toBeNull();
    expect(r.category_confidence).toBe(0.3);
    expect(r.category_source).toBe("heuristic");
  });

  it("uses a category hint when there is no stronger classification evidence", () => {
    const r = classify({
      domain: "unknown.example",
      pathname: "/post/hello",
      jsonLd: [],
      categoryHint: "movies_and_tv",
    });

    expect(r.category).toBe("movies_and_tv");
    expect(r.category_confidence).toBe(0.6);
    expect(r.category_source).toBe("heuristic");
  });

  it("prefers a category hint over path heuristics when both apply", () => {
    const r = classify({
      domain: "unknown.example",
      pathname: "/recipes/soup",
      jsonLd: [],
      categoryHint: "movies_and_tv",
    });

    expect(r.category).toBe("movies_and_tv");
    expect(r.category_confidence).toBe(0.6);
    expect(r.category_source).toBe("heuristic");
  });

  it("lets domain evidence beat a category hint", () => {
    const r = classify({
      domain: "goodreads.com",
      pathname: "/book/show/1",
      jsonLd: [],
      categoryHint: "movies_and_tv",
    });

    expect(r.category).toBe("books");
    expect(r.category_source).toBe("domain");
  });

  it("lets schema.org evidence beat a category hint", () => {
    const r = classify({
      domain: "example.org",
      pathname: "/story",
      jsonLd: [{ "@type": "Recipe", name: "Soup" }],
      categoryHint: "travel",
    });

    expect(r.category).toBe("recipes");
    expect(r.category_source).toBe("schema_org");
  });

  // A2: schema.org wins over ambiguous domain
  it("schema.org Recipe beats ambiguous domain (amazon)", () => {
    const r = classify({
      domain: "amazon.com",
      pathname: "/dp/B001",
      jsonLd: [{ "@type": "Recipe", name: "Soup" }],
    });
    expect(r.category).toBe("recipes");
    expect(r.category_source).toBe("schema_org");
  });

  it("ambiguous domain is used when schema.org is absent", () => {
    const r = classify({
      domain: "youtube.com",
      pathname: "/watch?v=abc",
      jsonLd: [],
    });
    expect(r.category).toBe("videos");
    expect(r.category_confidence).toBe(0.55);
    expect(r.category_source).toBe("domain");
  });

  it("google.com no longer maps to restaurants — returns null", () => {
    const r = classify({
      domain: "google.com",
      pathname: "/search?q=pizza",
      jsonLd: [],
    });
    expect(r.category).toBeNull();
  });

  // A3: new categories
  it("spotify maps to music (authoritative)", () => {
    const r = classify({
      domain: "open.spotify.com",
      pathname: "/album/abc",
      jsonLd: [],
    });
    expect(r.category).toBe("music");
    expect(r.category_confidence).toBe(0.95);
  });

  it("github maps to apps (authoritative)", () => {
    const r = classify({
      domain: "github.com",
      pathname: "/owner/repo",
      jsonLd: [],
    });
    expect(r.category).toBe("apps");
    expect(r.category_confidence).toBe(0.95);
  });

  it("schema.org MusicAlbum maps to music", () => {
    const r = classify({
      domain: "example.org",
      pathname: "/album",
      jsonLd: [{ "@type": "MusicAlbum", name: "Test" }],
    });
    expect(r.category).toBe("music");
    expect(r.category_source).toBe("schema_org");
  });

  it("schema.org SoftwareApplication maps to apps", () => {
    const r = classify({
      domain: "example.org",
      pathname: "/app",
      jsonLd: [{ "@type": "SoftwareApplication", name: "Test" }],
    });
    expect(r.category).toBe("apps");
    expect(r.category_source).toBe("schema_org");
  });
});
