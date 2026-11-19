import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveHardcover, titleFromHardcoverSlug } from "@/lib/enrichment/resolvers/hardcover";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  process.env.HARDCOVER_API_KEY = "test-token";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.HARDCOVER_API_KEY;
});

function searchResponse(documents: Array<Record<string, unknown>>) {
  return {
    ok: true,
    json: async () => ({ data: { search: { results: { hits: documents.map((document) => ({ document })) } } } }),
  };
}

function editionResponse(book: Record<string, unknown> | null) {
  return { ok: true, json: async () => ({ data: { books_by_pk: book } }) };
}

const piranesi = {
  title: "Piranesi",
  description: "A man lives in a house of endless halls.",
  author_names: ["Susanna Clarke"],
  genres: ["Fantasy", "Fiction", "Mystery"],
  isbns: ["9781635575637", "1635575630"],
  series_names: [],
  pages: 245,
  release_year: 2020,
  users_count: 7725,
  image: { url: "https://assets.hardcover.app/cover.jpg" },
};

const studyGuide = {
  title: "Piranesi by Susanna Clarke",
  author_names: ["William J. Collopy"],
  genres: [],
  isbns: [],
  pages: 13,
  users_count: 12,
};

describe("resolveHardcover", () => {
  it("returns null without a title", async () => {
    expect(await resolveHardcover({ canonicalUrl: "https://x", title: null, structured: {} })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("searches by the URL slug when the page gave no title", async () => {
    fetchMock.mockResolvedValue(
      searchResponse([{ ...piranesi, title: "A Fire Upon the Deep", author_names: ["Vernor Vinge"] }]),
    );

    const patch = await resolveHardcover({
      canonicalUrl: "https://hardcover.app/books/a-fire-upon-the-deep",
      title: null,
      structured: {},
    });

    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)) as {
      variables: { q: string };
    };
    expect(body.variables.q).toBe("a fire upon the deep");
    expect(patch?.title).toBe("A Fire Upon the Deep");
    expect(patch?.image_url).toBe("https://assets.hardcover.app/cover.jpg");
  });

  it("turns a slug into search words and keeps numbers", () => {
    expect(titleFromHardcoverSlug("catch-22")).toBe("catch 22");
    expect(titleFromHardcoverSlug("anomalies")).toBe("anomalies");
  });

  it("returns null when no token is configured", async () => {
    delete process.env.HARDCOVER_API_KEY;
    expect(await resolveHardcover({ canonicalUrl: "https://x", title: "Piranesi", structured: {} })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a Bearer header and maps the document onto a patch", async () => {
    fetchMock.mockResolvedValue(searchResponse([piranesi]));

    const patch = await resolveHardcover({
      canonicalUrl: "https://hardcover.app/books/piranesi",
      title: "Piranesi",
      structured: {},
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit & { headers: Record<string, string> };
    expect(init.headers.authorization).toBe("Bearer test-token");

    expect(patch).toEqual({
      source: "hardcover",
      title: "Piranesi",
      description: "A man lives in a house of endless halls.",
      image_url: "https://assets.hardcover.app/cover.jpg",
      structured: {
        authors: ["Susanna Clarke"],
        genres: ["Fantasy", "Fiction", "Mystery"],
        page_count: 245,
      },
    });
  });

  it("keeps a token that already carries the Bearer prefix", async () => {
    process.env.HARDCOVER_API_KEY = "Bearer already-prefixed";
    fetchMock.mockResolvedValue(searchResponse([piranesi]));

    await resolveHardcover({ canonicalUrl: "https://x", title: "Piranesi", structured: {} });

    const init = fetchMock.mock.calls[0][1] as RequestInit & { headers: Record<string, string> };
    expect(init.headers.authorization).toBe("Bearer already-prefixed");
  });

  it("prefers an exact title match over a more popular partial match", async () => {
    fetchMock.mockResolvedValue(searchResponse([{ ...studyGuide, users_count: 99999 }, piranesi]));

    const patch = await resolveHardcover({ canonicalUrl: "https://x", title: "Piranesi", structured: {} });

    expect(patch?.structured?.authors).toEqual(["Susanna Clarke"]);
  });

  it("breaks ties on popularity when both titles match equally", async () => {
    fetchMock.mockResolvedValue(
      searchResponse([
        { title: "Piranesi", author_names: ["Reprint Press"], users_count: 3, pages: 100 },
        piranesi,
      ]),
    );

    const patch = await resolveHardcover({ canonicalUrl: "https://x", title: "Piranesi", structured: {} });

    expect(patch?.structured?.authors).toEqual(["Susanna Clarke"]);
  });

  it("maps series name and position from featured_series", async () => {
    fetchMock.mockResolvedValue(
      searchResponse([
        {
          title: "Leviathan Wakes",
          author_names: ["James S. A. Corey"],
          series_names: ["The Expanse", "The Expanse (Chronological)"],
          featured_series: { position: 1 },
          users_count: 5000,
        },
      ]),
    );

    const patch = await resolveHardcover({ canonicalUrl: "https://x", title: "Leviathan Wakes", structured: {} });

    expect(patch?.structured?.series).toBe("The Expanse");
    expect(patch?.structured?.series_index).toBe(1);
  });

  it("appends the known author to the search query", async () => {
    fetchMock.mockResolvedValue(searchResponse([piranesi]));

    await resolveHardcover({
      canonicalUrl: "https://x",
      title: "Piranesi",
      structured: { authors: ["Susanna Clarke"] },
    });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as {
      variables: { q: string };
    };
    expect(body.variables.q).toBe("Piranesi Susanna Clarke");
  });

  it("skips a hit by another author when the item has authors", async () => {
    fetchMock.mockResolvedValue(
      searchResponse([
        { title: "Kurt Vonnegut's Cat's Cradle", author_names: ["Harold Bloom"], series_names: ["Bloom's Modern Critical Interpretations"], users_count: 40 },
      ]),
    );

    const patch = await resolveHardcover({
      canonicalUrl: "https://x",
      title: "Cat's Cradle",
      structured: { authors: ["Kurt Vonnegut", "Martí Sales Sariola"] },
    });

    expect(patch).toBeNull();
  });

  it("keeps a hit whose authors overlap the item authors", async () => {
    fetchMock.mockResolvedValue(
      searchResponse([
        { title: "Cat's Cradle", author_names: ["Kurt Vonnegut"], users_count: 5000 },
        { title: "Kurt Vonnegut's Cat's Cradle", author_names: ["Harold Bloom"], users_count: 40 },
      ]),
    );

    const patch = await resolveHardcover({
      canonicalUrl: "https://x",
      title: "Cat's Cradle",
      structured: { authors: ["Kurt Vonnegut"] },
    });

    expect(patch?.structured?.authors).toEqual(["Kurt Vonnegut"]);
  });

  it("returns null when every hit is an unrelated title", async () => {
    fetchMock.mockResolvedValue(searchResponse([{ title: "A Wholly Different Book", users_count: 900 }]));

    expect(await resolveHardcover({ canonicalUrl: "https://x", title: "Piranesi", structured: {} })).toBeNull();
  });

  it("takes the ISBN from the default physical edition, not from the search isbns", async () => {
    fetchMock
      .mockResolvedValueOnce(searchResponse([{ ...piranesi, id: "175280" }]))
      .mockResolvedValueOnce(
        editionResponse({
          default_physical_edition: { isbn_13: "9781635575637", isbn_10: "163557563X" },
          default_ebook_edition: { isbn_13: "9781635575644", isbn_10: null },
        }),
      );

    const patch = await resolveHardcover({ canonicalUrl: "https://x", title: "Piranesi", structured: {} });

    expect(patch?.structured?.isbn).toBe("9781635575637");
    const body = JSON.parse((fetchMock.mock.calls[1][1] as { body: string }).body) as {
      variables: { id: number };
    };
    expect(body.variables.id).toBe(175280);
  });

  it("falls back to the ebook edition ISBN and then to an ISBN-10", async () => {
    fetchMock
      .mockResolvedValueOnce(searchResponse([{ ...piranesi, id: "175280" }]))
      .mockResolvedValueOnce(
        editionResponse({
          default_physical_edition: null,
          default_ebook_edition: { isbn_13: null, isbn_10: "1635575648" },
        }),
      );

    const patch = await resolveHardcover({ canonicalUrl: "https://x", title: "Piranesi", structured: {} });

    expect(patch?.structured?.isbn).toBe("1635575648");
  });

  it("prefers the most-read English-group edition over a default edition from another group", async () => {
    fetchMock
      .mockResolvedValueOnce(searchResponse([{ ...piranesi, title: "Scythe", id: "308655" }]))
      .mockResolvedValueOnce(
        editionResponse({
          default_physical_edition: { isbn_13: "9786069674482", isbn_10: null },
          default_ebook_edition: null,
          editions: [
            { isbn_13: "9786069674482", isbn_10: null },
            { isbn_13: "9781406379242", isbn_10: "1406379247" },
          ],
        }),
      );

    const patch = await resolveHardcover({ canonicalUrl: "https://x", title: "Scythe", structured: {} });

    expect(patch?.structured?.isbn).toBe("9781406379242");
  });

  it("keeps a non-English default edition when no English-group ISBN exists", async () => {
    fetchMock
      .mockResolvedValueOnce(searchResponse([{ ...piranesi, id: "175280" }]))
      .mockResolvedValueOnce(
        editionResponse({
          default_physical_edition: { isbn_13: "9783453269118", isbn_10: null },
          default_ebook_edition: null,
          editions: [],
        }),
      );

    const patch = await resolveHardcover({ canonicalUrl: "https://x", title: "Piranesi", structured: {} });

    expect(patch?.structured?.isbn).toBe("9783453269118");
  });

  it("does not ask for the default edition when the item already has an ISBN", async () => {
    fetchMock.mockResolvedValueOnce(searchResponse([{ ...piranesi, id: "175280" }]));

    const patch = await resolveHardcover({
      canonicalUrl: "https://x",
      title: "Piranesi",
      structured: { isbn: "9781526622440" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(patch?.structured).not.toHaveProperty("isbn");
  });

  it("keeps the rest of the patch when the edition lookup fails", async () => {
    fetchMock
      .mockResolvedValueOnce(searchResponse([{ ...piranesi, id: "175280" }]))
      .mockRejectedValueOnce(new Error("network"));

    const patch = await resolveHardcover({ canonicalUrl: "https://x", title: "Piranesi", structured: {} });

    expect(patch?.structured?.authors).toEqual(["Susanna Clarke"]);
    expect(patch?.structured).not.toHaveProperty("isbn");
  });

  it("ignores edition-specific isbn and release_year", async () => {
    fetchMock.mockResolvedValue(searchResponse([piranesi]));

    const patch = await resolveHardcover({ canonicalUrl: "https://x", title: "Piranesi", structured: {} });

    expect(patch?.structured).not.toHaveProperty("isbn");
    expect(patch?.structured).not.toHaveProperty("published_year");
  });

  it("returns null on a GraphQL error payload", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ errors: [{ message: "nope" }] }) });

    expect(await resolveHardcover({ canonicalUrl: "https://x", title: "Piranesi", structured: {} })).toBeNull();
  });

  it("returns null when the request throws", async () => {
    fetchMock.mockRejectedValue(new Error("network"));

    expect(await resolveHardcover({ canonicalUrl: "https://x", title: "Piranesi", structured: {} })).toBeNull();
  });
});
