import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveHardcover } from "@/lib/enrichment/resolvers/hardcover";

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

  it("returns null when every hit is an unrelated title", async () => {
    fetchMock.mockResolvedValue(searchResponse([{ title: "A Wholly Different Book", users_count: 900 }]));

    expect(await resolveHardcover({ canonicalUrl: "https://x", title: "Piranesi", structured: {} })).toBeNull();
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
