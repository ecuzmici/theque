import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveBooks } from "@/lib/enrichment/resolvers/google-books";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

function volumeResponse(info: Record<string, unknown>) {
  return {
    ok: true,
    json: async () => ({ items: [{ volumeInfo: info }] }),
  };
}

describe("resolveBooks", () => {
  it("returns null when there is neither isbn nor title", async () => {
    expect(await resolveBooks({ canonicalUrl: "https://x", title: null, structured: {} })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("queries by ISBN and maps authors, year, page_count, image", async () => {
    fetchMock.mockResolvedValue(
      volumeResponse({
        authors: ["Frank Herbert"],
        publishedDate: "1965-08-01",
        pageCount: 412,
        imageLinks: { thumbnail: "http://books.google.com/img.jpg" },
      }),
    );

    const patch = await resolveBooks({
      canonicalUrl: "https://example.com/book",
      title: "Dune",
      structured: { isbn: "9780441013593" },
    });

    const calledUrl = new URL(fetchMock.mock.calls[0][0].toString());
    expect(calledUrl.searchParams.get("q")).toBe("isbn:9780441013593");
    expect(patch).toEqual({
      source: "google_books",
      image_url: "https://books.google.com/img.jpg",
      structured: { authors: ["Frank Herbert"], published_year: 1965, page_count: 412 },
    });
  });

  it("queries by title when no isbn and upgrades thumbnail to https", async () => {
    fetchMock.mockResolvedValue(volumeResponse({ authors: ["Andy Weir"], publishedDate: "2011" }));
    const patch = await resolveBooks({ canonicalUrl: "https://x", title: "The Martian", structured: {} });
    const calledUrl = new URL(fetchMock.mock.calls[0][0].toString());
    expect(calledUrl.searchParams.get("q")).toBe("The Martian");
    expect(patch?.structured).toEqual({ authors: ["Andy Weir"], published_year: 2011 });
  });

  it("returns null on non-200 or empty results", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    expect(await resolveBooks({ canonicalUrl: "https://x", title: "Dune", structured: {} })).toBeNull();

    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    expect(await resolveBooks({ canonicalUrl: "https://x", title: "Dune", structured: {} })).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    expect(await resolveBooks({ canonicalUrl: "https://x", title: "Dune", structured: {} })).toBeNull();
  });

  it("sends the API key when GOOGLE_BOOKS_API_KEY is set", async () => {
    process.env.GOOGLE_BOOKS_API_KEY = "test-key";
    fetchMock.mockResolvedValue(volumeResponse({ authors: ["Frank Herbert"] }));

    await resolveBooks({ canonicalUrl: "https://x", title: "Dune", structured: {} });

    const calledUrl = new URL(fetchMock.mock.calls[0][0].toString());
    expect(calledUrl.searchParams.get("key")).toBe("test-key");
    delete process.env.GOOGLE_BOOKS_API_KEY;
  });

  it("omits the key parameter when no key is configured", async () => {
    delete process.env.GOOGLE_BOOKS_API_KEY;
    fetchMock.mockResolvedValue(volumeResponse({ authors: ["Frank Herbert"] }));

    await resolveBooks({ canonicalUrl: "https://x", title: "Dune", structured: {} });

    const calledUrl = new URL(fetchMock.mock.calls[0][0].toString());
    expect(calledUrl.searchParams.has("key")).toBe(false);
  });
});
