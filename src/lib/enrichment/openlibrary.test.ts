import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

// SSRF guard is tested separately in fetch.test.ts.
vi.mock("@/lib/enrichment/fetch", () => ({
  assertSafeFetchUrl: vi.fn().mockResolvedValue(undefined),
}));

import {
  parseOpenLibraryWorkKey,
  enrichOpenLibraryWork,
} from "@/lib/enrichment/openlibrary";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("parseOpenLibraryWorkKey", () => {
  it("extracts the work key from a bare work URL", () => {
    expect(parseOpenLibraryWorkKey("https://openlibrary.org/works/OL27448W")).toBe("OL27448W");
  });

  it("extracts the work key when a slug is present", () => {
    expect(
      parseOpenLibraryWorkKey("https://openlibrary.org/works/OL27448W/The_Lord_of_the_Rings"),
    ).toBe("OL27448W");
  });

  it("returns null for non-Open-Library hosts", () => {
    expect(parseOpenLibraryWorkKey("https://goodreads.com/works/OL27448W")).toBeNull();
  });

  it("returns null for edition (/books/...M) URLs", () => {
    expect(parseOpenLibraryWorkKey("https://openlibrary.org/books/OL123M")).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(parseOpenLibraryWorkKey("not a url")).toBeNull();
  });
});

/** Build a fetch mock routed by URL substring. */
function mockFetchByUrl(routes: Record<string, unknown>) {
  const fn = vi.fn(async (input: unknown) => {
    const url = String(input);
    for (const [needle, body] of Object.entries(routes)) {
      if (url.includes(needle)) {
        return { ok: true, json: async () => body };
      }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("enrichOpenLibraryWork", () => {
  it("returns clean English title, author, cover, and year from the JSON API", async () => {
    mockFetchByUrl({
      "/works/OL27448W.json": {
        title: "The Lord of the Rings",
        description: { type: "/type/text", value: "An epic adventure." },
        covers: [14625765],
        authors: [{ author: { key: "/authors/OL26320A" } }],
        first_publish_date: "1954",
      },
      "/authors/OL26320A.json": { name: "J.R.R. Tolkien" },
    });

    const result = await enrichOpenLibraryWork(
      "https://openlibrary.org/works/OL27448W/Y%C3%BCz%C3%BCklerin_Efendisi",
    );

    expect(result).not.toBeNull();
    expect(result!.extracted.title).toBe("The Lord of the Rings");
    expect(result!.extracted.description).toBe("An epic adventure.");
    expect(result!.extracted.image_url).toBe(
      "https://covers.openlibrary.org/b/id/14625765-L.jpg",
    );
    expect(result!.extracted.structured.authors).toEqual(["J.R.R. Tolkien"]);
    expect(result!.extracted.structured.published_year).toBe(1954);
    expect(result!.extracted.raw_metadata.parser).toBe("openlibrary");
    expect(result!.fetchResult.finalUrl).toBe("https://openlibrary.org/works/OL27448W");
  });

  it("handles a plain-string description and missing cover", async () => {
    mockFetchByUrl({
      "/works/OL893415W.json": {
        title: "Dune",
        description: "Desert planet politics.",
        covers: [-1],
        authors: [{ author: { key: "/authors/OL79034A" } }],
      },
      "/authors/OL79034A.json": { name: "Frank Herbert" },
    });

    const result = await enrichOpenLibraryWork("https://openlibrary.org/works/OL893415W");

    expect(result).not.toBeNull();
    expect(result!.extracted.title).toBe("Dune");
    expect(result!.extracted.description).toBe("Desert planet politics.");
    expect(result!.extracted.image_url).toBeNull();
    expect(result!.extracted.structured.published_year).toBeUndefined();
  });

  it("returns null for non-work URLs (falls back to HTML pipeline)", async () => {
    const fn = mockFetchByUrl({});
    const result = await enrichOpenLibraryWork("https://example.com/page");
    expect(result).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it("returns null when the work API is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const result = await enrichOpenLibraryWork("https://openlibrary.org/works/OL27448W");
    expect(result).toBeNull();
  });

  it("returns null when the work has no title", async () => {
    mockFetchByUrl({ "/works/OL27448W.json": { description: "no title here" } });
    const result = await enrichOpenLibraryWork("https://openlibrary.org/works/OL27448W");
    expect(result).toBeNull();
  });
});
