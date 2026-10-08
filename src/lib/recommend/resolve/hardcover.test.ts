import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The SSRF guard is tested separately in fetch.test.ts.
vi.mock("@/lib/enrichment/fetch", () => ({
  assertSafeFetchUrl: vi.fn().mockResolvedValue(undefined),
}));

import {
  hardcoverAuthors,
  pickHardcoverRow,
  resolveBooksWithHardcover,
  toResolvedHardcoverBook,
} from "@/lib/recommend/resolve/hardcover";

const author = (name: string) => ({ author: { name }, contribution: "Author" });

// Rows arrive sorted by users_count, most shelved first.
const novel = {
  id: 2,
  slug: "piranesi",
  title: "Piranesi",
  users_count: 7916,
  rating: 4.22,
  ratings_count: 3079,
  pages: 245,
  cached_contributors: [author("Susanna Clarke"), { author: { name: "Chiwetel Ejiofor" }, contribution: "Narrator" }],
  cached_tags: { Genre: [{ tag: "Fantasy" }, { tag: "Mystery" }, { tag: "Literary" }, { tag: "Fiction" }] },
  image: { url: "https://assets.hardcover.app/piranesi.jpg" },
};
const artBook = {
  id: 3,
  slug: "piranesi-1992",
  title: "Piranesi",
  users_count: 3,
  cached_contributors: [author("Giovanni Battista Piranesi")],
  cached_tags: {},
  image: {},
};
const dispossessed = {
  id: 4,
  slug: "the-dispossessed",
  title: "The Dispossessed",
  users_count: 2949,
  cached_contributors: [author("Ursula K. Le Guin")],
};

const piranesi = { title: "Piranesi", creator: "Susanna Clarke", year: 2020 };

describe("hardcoverAuthors", () => {
  it("keeps authors and skips other contributions", () => {
    expect(hardcoverAuthors(novel)).toEqual(["Susanna Clarke"]);
  });
});

describe("pickHardcoverRow", () => {
  it("picks the title match by the candidate author", () => {
    expect(pickHardcoverRow([artBook, novel], piranesi)?.slug).toBe("piranesi");
  });

  it("falls back to the most shelved title match when no author overlaps", () => {
    expect(pickHardcoverRow([novel, artBook], { title: "Piranesi", creator: "Someone Else" })?.slug).toBe(
      "piranesi",
    );
  });

  it("matches titles without regard to case or a leading article", () => {
    expect(pickHardcoverRow([dispossessed], { title: "the dispossessed", creator: "Le Guin" })?.slug).toBe(
      "the-dispossessed",
    );
  });

  it("returns null when no title matches", () => {
    expect(pickHardcoverRow([dispossessed], piranesi)).toBeNull();
  });
});

describe("toResolvedHardcoverBook", () => {
  it("maps the row to a recommendation book", () => {
    expect(toResolvedHardcoverBook(novel)).toEqual({
      canonical_url: "https://hardcover.app/books/piranesi",
      cover_url: "https://assets.hardcover.app/piranesi.jpg",
      confirmed_year: null,
      external_id: "hardcover:2",
      verified_author: "Susanna Clarke",
      source_rating: 4.22,
      rating_count: "3k",
      length: "245 pages",
      genres: ["Fantasy", "Mystery", "Literary"],
      opening_line: null,
    });
  });

  it("omits the rating, cover and genres when Hardcover has none", () => {
    const resolved = toResolvedHardcoverBook(artBook);
    expect(resolved.source_rating).toBeNull();
    expect(resolved.rating_count).toBeNull();
    expect(resolved.cover_url).toBeNull();
    expect(resolved.genres).toBeUndefined();
  });
});

describe("resolveBooksWithHardcover", () => {
  const fetchMock = vi.fn();
  const candidates = [piranesi, { title: "Unknown 100% Book", creator: "Nobody", year: null }];

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("HARDCOVER_API_KEY", "abc");
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns nulls without an API key", async () => {
    vi.stubEnv("HARDCOVER_API_KEY", "");
    expect(await resolveBooksWithHardcover(candidates)).toEqual([null, null]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves the whole round with one request, in candidate order", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { books: [novel, artBook] } })));

    const resolved = await resolveBooksWithHardcover(candidates);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resolved[0]?.canonical_url).toBe("https://hardcover.app/books/piranesi");
    expect(resolved[1]).toBeNull();
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.authorization).toBe("Bearer abc");
    expect(JSON.parse(init.body).variables.where).toEqual([
      { title: { _ilike: "Piranesi" } },
      { title: { _ilike: "Unknown 100\\% Book" } },
    ]);
  });

  it("returns nulls on an HTTP error or a GraphQL error", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 429 }));
    expect(await resolveBooksWithHardcover(candidates)).toEqual([null, null]);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ message: "bad" }] })));
    expect(await resolveBooksWithHardcover(candidates)).toEqual([null, null]);
  });
});
