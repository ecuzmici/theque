import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadRadar, type RadarLibraryItem } from "@/lib/radar";

import hardcoverAuthorsJson from "./fixtures/hardcover-authors.json";
import hardcoverSeries from "./fixtures/hardcover-series.json";
import tmdbCreditsAster from "./fixtures/tmdb-credits-aster.json";
import tmdbCreditsVilleneuve from "./fixtures/tmdb-credits-villeneuve.json";
import tmdbSearchAster from "./fixtures/tmdb-search-aster.json";
import tmdbSearchVilleneuve from "./fixtures/tmdb-search-villeneuve.json";
import type { HcAuthor } from "./sources";

const hardcoverAuthors = hardcoverAuthorsJson as unknown as { data: { authors: HcAuthor[] } };

/** The fixtures were recorded on 2026-11-20 with `since` = 2025-05-20. */
const NOW = new Date("2026-11-20T12:00:00Z");
const KEYS = { hardcover: "hc-test", tmdb: "tmdb-test" };

let n = 0;
function item(partial: Partial<RadarLibraryItem> & Pick<RadarLibraryItem, "title" | "category">): RadarLibraryItem {
  n += 1;
  return {
    id: `item-${n}`,
    status: "want",
    rating: null,
    authors: [],
    directors: [],
    url: `https://example.com/${n}`,
    ...partial,
  };
}

const LIBRARY: RadarLibraryItem[] = [
  item({ title: "Maggie's Grave", category: "books", status: "done", rating: 5, authors: ["David Sodergren"] }),
  item({ title: "The Strength of the Few", category: "books", status: "done", rating: 5, authors: ["James Islington"] }),
  item({ title: "The Last Colony", category: "books", status: "done", rating: 5, authors: ["John Scalzi"] }),
  item({ title: "Old Man's War", category: "books", status: "done", rating: 4, authors: ["John Scalzi"] }),
  item({ title: "Project Hail Mary", category: "books", status: "done", rating: 4, authors: ["Andy Weir"] }),
  item({ title: "A Book I Disliked", category: "books", status: "done", rating: 2, authors: ["Someone Else"] }),
  item({ title: "Unread", category: "books", status: "want", rating: null, authors: ["Another Author"] }),
  item({ title: "Hard Luck Jenny", category: "books", status: "want", authors: ["David Sodergren"] }),
  item({ title: "Dune: Part Two", category: "movies_and_tv", status: "done", rating: 4, directors: ["Denis Villeneuve"] }),
  item({ title: "Midsommar", category: "movies_and_tv", status: "done", rating: 5, directors: ["Ari Aster"] }),
  item({ title: "Eddington", category: "movies_and_tv", status: "want", directors: ["Ari Aster"] }),
];

type Call = { url: string; body: string | null };

/** Answers each request with the recorded response. Tests never reach the network. */
function recordedFetch(overrides: { hardcoverStatus?: number; extraBooks?: HcAuthor["contributions"] } = {}) {
  const calls: Call[] = [];
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? init.body : null;
    calls.push({ url, body });
    if (url.startsWith("https://api.hardcover.app/")) {
      if (overrides.hardcoverStatus) return json({}, overrides.hardcoverStatus);
      if (body?.includes("RadarAuthors")) {
        if (!overrides.extraBooks) return json(hardcoverAuthors);
        const copy = structuredClone(hardcoverAuthors);
        copy.data.authors[0]!.contributions.push(...overrides.extraBooks);
        return json(copy);
      }
      if (body?.includes("RadarSeriesForTitles")) return json(hardcoverSeries);
    }
    const parsed = new URL(url);
    if (parsed.pathname === "/3/search/person") {
      const query = parsed.searchParams.get("query");
      if (query === "Denis Villeneuve") return json(tmdbSearchVilleneuve);
      if (query === "Ari Aster") return json(tmdbSearchAster);
      return json({ results: [] });
    }
    if (parsed.pathname === "/3/person/137427/combined_credits") return json(tmdbCreditsVilleneuve);
    if (parsed.pathname === "/3/person/1145520/combined_credits") return json(tmdbCreditsAster);
    return json({}, 404);
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls };
}

async function radarWith(options: Parameters<typeof recordedFetch>[0] = {}, library = LIBRARY) {
  const { fetchFn, calls } = recordedFetch(options);
  const radar = await loadRadar(library, { now: NOW, fetch: fetchFn, keys: KEYS });
  return { radar, calls };
}

function titles(radar: Awaited<ReturnType<typeof loadRadar>>, kind?: "book" | "film") {
  return radar.entries.filter((e) => !kind || e.kind === kind).map((e) => e.title);
}

describe("loadRadar", () => {
  it("watches the authors and directors of finished items rated 4 or 5", async () => {
    const { radar, calls } = await radarWith();
    expect(radar.watching).toEqual({ authors: 4, directors: 2 });
    const authorsCall = calls.find((c) => c.body?.includes("RadarAuthors"));
    const variables = JSON.parse(authorsCall!.body!).variables;
    expect([...variables.names].sort()).toEqual(["Andy Weir", "David Sodergren", "James Islington", "John Scalzi"]);
    expect(variables.since).toBe("2025-05-20");
  });

  it("sends one Hardcover query for all authors and one for the series", async () => {
    const { calls } = await radarWith();
    expect(calls.filter((c) => c.url.startsWith("https://api.hardcover.app/"))).toHaveLength(2);
  });

  it("drops teasers, translations, re-editions and books already in the library", async () => {
    const { radar } = await radarWith();
    const books = titles(radar, "book");
    expect(books).not.toContain("Sneak Peek for Monsters of Ohio");
    expect(books).not.toContain("Viser la lune");
    expect(books).not.toContain("Vástago");
    expect(books).not.toContain("3 Days, 9 Months, 27 Years: The Time Traveler's Passport");
    expect(books).not.toContain("The Strength of the Few");
    expect(books).not.toContain("Hard Luck Jenny");
    expect(books.filter((t) => t === "Monsters of Ohio")).toHaveLength(1);
    expect(books).toEqual(
      expect.arrayContaining(["Maggot Road", "Monsters of Ohio", "Exoplanet", "Scion", "The Justice of One", "The Suffering"]),
    );
  });

  it("keeps the most-read record of a book that Hardcover lists twice", async () => {
    const { radar } = await radarWith();
    const ohio = radar.entries.find((e) => e.title === "Monsters of Ohio");
    expect(ohio?.url).toBe("https://hardcover.app/books/monsters-of-ohio-2026");
  });

  it("drops audio dramas", async () => {
    const drama = {
      book: {
        id: 1,
        title: "The Last Colony (Dramatized Adaptation)",
        slug: "the-last-colony-dramatized",
        release_date: "2026-12-01",
        users_count: 40,
        image: null,
        default_physical_edition: null,
        default_ebook_edition: null,
      },
    };
    const { radar } = await radarWith({ extraBooks: [drama] });
    expect(titles(radar)).not.toContain("The Last Colony (Dramatized Adaptation)");
  });

  it("drops upcoming translations by edition language and by script", async () => {
    const vastago = hardcoverAuthors.data.authors
      .flatMap((a) => a.contributions)
      .find((c) => c.book.title === "Vástago")!;
    const spanish = {
      book: {
        ...vastago.book,
        id: 2,
        title: "La justicia de uno",
        release_date: "2027-06-01",
        users_count: 50,
        default_physical_edition: { language: { code2: "es" } },
      },
    };
    const cyrillic = { book: { ...vastago.book, id: 3, title: "Сила немногих", release_date: "2027-06-01", users_count: 50 } };
    const { radar } = await radarWith({ extraBooks: [spanish, cyrillic] });
    expect(titles(radar)).not.toContain("La justicia de uno");
    expect(titles(radar)).not.toContain("Сила немногих");
  });

  it("keeps a sequel film next to the part in the library", async () => {
    const { radar } = await radarWith();
    const films = titles(radar, "film");
    expect(films).toContain("Dune: Part Three");
    expect(films).not.toContain("Dune: Part Two");
  });

  it("drops untitled placeholders, old films and films already in the library", async () => {
    const { radar } = await radarWith();
    const films = titles(radar, "film");
    expect(films).not.toContain("Untitled James Bond Film");
    expect(films).not.toContain("Untitled Sixth Ari Aster Feature Film");
    expect(films).not.toContain("Eddington");
    expect(films).not.toContain("Beau Is Afraid");
    expect(films).toContain("Scapegoat");
  });

  it("skips a director when TMDB finds only a person with another name", async () => {
    const library = [
      item({ title: "Midsommar", category: "movies_and_tv", status: "done", rating: 5, directors: ["Ari Ast"] }),
    ];
    const { fetchFn, calls } = recordedFetch();
    const searchAsAster = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/3/search/person") url.searchParams.set("query", "Ari Aster");
      return fetchFn(url, init);
    }) as unknown as typeof fetch;
    const radar = await loadRadar(library, { now: NOW, fetch: searchAsAster, keys: KEYS });
    expect(radar.entries).toEqual([]);
    expect(calls.some((c) => c.url.includes("combined_credits"))).toBe(false);
  });

  it("names the rated item that put each release on the radar", async () => {
    const { radar } = await radarWith();
    const dune = radar.entries.find((e) => e.title === "Dune: Part Three");
    expect(dune?.because).toMatchObject({ title: "Dune: Part Two", rating: 4 });
    expect(dune?.creator).toBe("Denis Villeneuve");
    expect(dune?.url).toBe("https://www.themoviedb.org/movie/1170608");
    const scion = radar.entries.find((e) => e.title === "Scion");
    expect(scion?.because).toMatchObject({ title: "The Strength of the Few", rating: 5 });
  });

  it("adds the series of a book when the series author matches", async () => {
    const { radar } = await radarWith();
    expect(radar.entries.find((e) => e.title === "Scion")?.series).toEqual({ name: "Scion", position: 1 });
    expect(radar.entries.find((e) => e.title === "The Justice of One")?.series).toEqual({ name: "Hierarchy", position: 3 });
    expect(radar.entries.find((e) => e.title === "Exoplanet")?.series).toBeNull();
  });

  it("orders upcoming releases soonest first, then recent ones, then undated ones", async () => {
    const { radar } = await radarWith();
    const order = titles(radar);
    expect(order.slice(0, 2)).toEqual(["Maggot Road", "Dune: Part Three"]);
    expect(order.indexOf("The Justice of One")).toBeLessThan(order.indexOf("Exoplanet"));
    expect(order.indexOf("Exoplanet")).toBeLessThan(order.indexOf("Monsters of Ohio"));
    expect(order.at(-1)).toBe("Scapegoat");
  });

  it("labels each release by its date", async () => {
    const { radar } = await radarWith();
    const label = (title: string) => radar.entries.find((e) => e.title === title)?.release;
    expect(label("Maggot Road")).toEqual({ label: "In 13 days", upcoming: true });
    expect(label("The Justice of One")).toEqual({ label: "Out May 2027", upcoming: true });
    expect(label("Exoplanet")).toEqual({ label: "Just out", upcoming: false });
    expect(label("The Shattering Peace")).toEqual({ label: "Sep 2025", upcoming: false });
    expect(label("Scapegoat")).toEqual({ label: "Announced", upcoming: true });
  });

  it("reports each source as ok", async () => {
    const { radar } = await radarWith();
    expect(radar.sources).toEqual({ books: "ok", films: "ok" });
  });

  it("calls no API and reports no_key when the keys are missing", async () => {
    const { fetchFn, calls } = recordedFetch();
    const radar = await loadRadar(LIBRARY, { now: NOW, fetch: fetchFn, keys: { hardcover: null, tmdb: "" } });
    expect(calls).toHaveLength(0);
    expect(radar.sources).toEqual({ books: "no_key", films: "no_key" });
    expect(radar.entries).toEqual([]);
  });

  it("keeps the films when Hardcover fails", async () => {
    const { radar } = await radarWith({ hardcoverStatus: 500 });
    expect(radar.sources.books).toBe("error");
    expect(titles(radar, "book")).toEqual([]);
    expect(titles(radar, "film")).toContain("Dune: Part Three");
  });

  it("calls no API when nothing is rated 4 or 5", async () => {
    const { fetchFn, calls } = recordedFetch();
    const library = LIBRARY.map((i) => ({ ...i, rating: i.rating ? 3 : null }));
    const radar = await loadRadar(library, { now: NOW, fetch: fetchFn, keys: KEYS });
    expect(calls).toHaveLength(0);
    expect(radar.watching).toEqual({ authors: 0, directors: 0 });
    expect(radar.entries).toEqual([]);
  });
});
