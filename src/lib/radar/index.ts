import "server-only";

import type { SnapshotItem } from "@/lib/library-snapshot/load";
import { authorsOverlap, titleScore } from "@/lib/enrichment/resolvers/title-match";

import {
  booksByTitles,
  directorCredits,
  recentBooksByAuthors,
  type Fetch,
  type HcAuthor,
  type HcBook,
  type HcTitleRow,
  type SourceResult,
} from "./sources";

/** The library fields that the radar reads. */
export type RadarLibraryItem = Pick<
  SnapshotItem,
  "id" | "title" | "category" | "status" | "rating" | "authors" | "directors" | "url"
>;

export type RadarEntry = {
  key: string;
  kind: "book" | "film";
  title: string;
  creator: string;
  date: string | null;
  release: { label: string; upcoming: boolean };
  image: string | null;
  series: { name: string; position: number | null } | null;
  /** The Hardcover or TMDB page. The save action captures this URL. */
  url: string;
  source: "Hardcover" | "TMDB";
  /** A Goodreads search for books, null for films. */
  goodreadsUrl: string | null;
  because: { id: string; title: string; rating: number };
};

export type SourceState = "ok" | "no_key" | "error";

export type Radar = {
  /** Upcoming releases soonest first, then recent releases newest first, then undated announcements. */
  entries: RadarEntry[];
  watching: { authors: number; directors: number };
  sources: { books: SourceState; films: SourceState };
};

export type LoadRadarOptions = {
  now?: Date;
  fetch?: Fetch;
  /** API keys. The default reads HARDCOVER_API_KEY and TMDB_API_KEY. */
  keys?: { hardcover?: string | null; tmdb?: string | null };
};

const MONTHS_BACK = 18;
const MAX_DIRECTORS = 14;
const MIN_RATING = 4;
/** A released book with fewer readers is a stray edition or a translation. */
const MIN_READERS_RELEASED = 5;
const DAY_MS = 86_400_000;

/** Teasers, placeholders and audio dramas. None of them is a new book or film. */
const NOT_A_RELEASE = /^(untitled|sneak peek|excerpt|sampler|preview)\b|dramatized|dramatised|\baudio drama\b/i;

/** Hardcover lists translations as their own books. Some of them use another script. */
const NON_LATIN = /[^\p{Script=Latin}\p{N}\p{P}\p{Zs}\p{S}]/u;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Because = RadarEntry["because"];

/**
 * Finds new and upcoming books by the authors, and films by the directors,
 * of finished items rated 4 or 5. Titles that are in the library already
 * drop out. A missing key or a failed source gives no entries for that kind;
 * `sources` tells which.
 */
export async function loadRadar(items: RadarLibraryItem[], options: LoadRadarOptions = {}): Promise<Radar> {
  const now = options.now ?? new Date();
  const fetchFn = options.fetch ?? fetch;
  const hardcoverKey = options.keys ? options.keys.hardcover : process.env.HARDCOVER_API_KEY;
  const tmdbKey = options.keys ? options.keys.tmdb : process.env.TMDB_API_KEY;

  const since = new Date(now);
  since.setUTCMonth(since.getUTCMonth() - MONTHS_BACK);
  const sinceIso = since.toISOString().slice(0, 10);

  const authors = lovedCreators(items, "books", (i) => i.authors[0]);
  const directors = lovedCreators(items, "movies_and_tv", (i) => i.directors[0], MAX_DIRECTORS);

  const [books, films] = await Promise.all([
    authors.size === 0
      ? ({ state: "ok", entries: [] } as const)
      : findBooks(fetchFn, hardcoverKey, authors, items, sinceIso, now),
    directors.size === 0
      ? ({ state: "ok", entries: [] } as const)
      : findFilms(fetchFn, tmdbKey, directors, items, sinceIso, now),
  ]);

  return {
    entries: sortEntries([...books.entries, ...films.entries], now),
    watching: { authors: authors.size, directors: directors.size },
    sources: { books: books.state, films: films.state },
  };
}

/** Creators of finished items rated 4 or 5, best rating first, each with the item that earned the spot. */
function lovedCreators(
  items: RadarLibraryItem[],
  category: RadarLibraryItem["category"],
  pick: (item: RadarLibraryItem) => string | undefined,
  limit = Number.POSITIVE_INFINITY,
): Map<string, Because> {
  const best = new Map<string, RadarLibraryItem>();
  for (const item of items) {
    const name = pick(item)?.trim();
    if (!name || item.category !== category || item.status !== "done" || (item.rating ?? 0) < MIN_RATING) continue;
    const current = best.get(name);
    if (!current || (item.rating ?? 0) > (current.rating ?? 0)) best.set(name, item);
  }
  const sorted = [...best.entries()]
    .sort((a, b) => (b[1].rating ?? 0) - (a[1].rating ?? 0))
    .slice(0, limit)
    .map(([name, item]) => [name, { id: item.id, title: item.title, rating: item.rating ?? 0 }] as const);
  return new Map(sorted);
}

type Found = { state: SourceState; entries: RadarEntry[] };

async function findBooks(
  fetchFn: Fetch,
  key: string | null | undefined,
  authors: Map<string, Because>,
  items: RadarLibraryItem[],
  since: string,
  now: Date,
): Promise<Found> {
  const result: SourceResult<HcAuthor[]> = await recentBooksByAuthors(fetchFn, key, [...authors.keys()], since);
  if (result.state !== "ok") return { state: result.state, entries: [] };

  const library = items.filter((i) => i.category === "books");
  const entries: RadarEntry[] = [];
  for (const author of result.data) {
    const because = authors.get(author.name);
    if (!because) continue;
    const seen = new Set<string>();
    // Most-read first, so a duplicate record of a book loses to the main record.
    const books = author.contributions.map((c) => c.book).sort((a, b) => (b.users_count ?? 0) - (a.users_count ?? 0));
    for (const book of books) {
      const key = baseTitle(book.title).toLowerCase();
      if (seen.has(key) || !isNewBook(book, now) || bookInLibrary(library, book)) continue;
      seen.add(key);
      const url = book.slug ? `https://hardcover.app/books/${book.slug}` : null;
      if (!url) continue;
      entries.push({
        key: `book-${book.id}`,
        kind: "book",
        title: book.title,
        creator: author.name,
        date: book.release_date,
        release: releaseLabel(book.release_date, now),
        image: book.image?.url ?? null,
        series: null,
        url,
        source: "Hardcover",
        goodreadsUrl: `https://www.goodreads.com/search?q=${encodeURIComponent(`${book.title} ${author.name}`)}`,
        because,
      });
    }
  }

  const rows = await booksByTitles(fetchFn, key, [...new Set(entries.map((e) => e.title))]);
  for (const entry of entries) entry.series = seriesFor(rows, entry.title, entry.creator);
  return { state: "ok", entries };
}

function isNewBook(book: HcBook, now: Date): boolean {
  const released = !!book.release_date && Date.parse(book.release_date) <= now.getTime();
  return (
    !NOT_A_RELEASE.test(book.title) &&
    !NON_LATIN.test(book.title) &&
    isEnglishOrUnknown(book) &&
    !(released && (book.users_count ?? 0) < MIN_READERS_RELEASED)
  );
}

/** False when the default editions say the book is in a language other than English. */
function isEnglishOrUnknown(book: HcBook): boolean {
  const codes = [book.default_physical_edition?.language?.code2, book.default_ebook_edition?.language?.code2].filter(Boolean);
  return codes.length === 0 || codes.includes("en");
}

/** "Station Eleven: a post-apocalyptic tale" gives "Station Eleven". */
function baseTitle(title: string): string {
  return title.split(/\s*[:([]/)[0]!.trim();
}

/** A book matches on its base title, so a re-edition with a long subtitle drops out. */
function bookInLibrary(library: RadarLibraryItem[], book: HcBook): boolean {
  const url = book.slug ? `https://hardcover.app/books/${book.slug}` : null;
  return library.some(
    (item) => item.url === url || titleScore(baseTitle(item.title), baseTitle(book.title)) === 2,
  );
}

/** The first featured series of the most-read book with this title and author. */
function seriesFor(rows: HcTitleRow[], title: string, creator: string): RadarEntry["series"] {
  for (const row of rows) {
    if (titleScore(row.title, title) !== 2) continue;
    const series = row.book_series.find((s) => s.series?.name);
    if (!series) continue;
    const authors = (row.cached_contributors ?? [])
      .filter((c) => !c.contribution || c.contribution === "Author")
      .map((c) => c.author?.name ?? "")
      .filter(Boolean);
    if (!authorsOverlap([creator], authors)) continue;
    return { name: series.series!.name, position: series.position };
  }
  return null;
}

async function findFilms(
  fetchFn: Fetch,
  key: string | null | undefined,
  directors: Map<string, Because>,
  items: RadarLibraryItem[],
  since: string,
  now: Date,
): Promise<Found> {
  const results = await Promise.all(
    [...directors.entries()].map(async ([name, because]) => ({ because, result: await directorCredits(fetchFn, key, name) })),
  );
  const failed = results.find((r) => r.result.state !== "ok");
  if (failed && results.every((r) => r.result.state !== "ok")) {
    return { state: failed.result.state as SourceState, entries: [] };
  }

  const library = items.filter((i) => i.category === "movies_and_tv");
  const seen = new Set<string>();
  const entries: RadarEntry[] = [];
  for (const { because, result } of results) {
    if (result.state !== "ok" || !result.data) continue;
    for (const credit of result.data.credits) {
      const url = `https://www.themoviedb.org/${credit.media}/${credit.id}`;
      const key = `${credit.media}-${credit.id}`;
      if (seen.has(key)) continue;
      if ((credit.date && credit.date < since) || NOT_A_RELEASE.test(credit.title)) continue;
      // A film matches on its full title, so "Dune: Part Three" stays next to "Dune: Part Two".
      if (library.some((item) => item.url === url || titleScore(item.title, credit.title) === 2)) continue;
      seen.add(key);
      entries.push({
        key: `film-${key}`,
        kind: "film",
        title: credit.title,
        creator: result.data.person,
        date: credit.date,
        release: releaseLabel(credit.date, now),
        image: credit.poster,
        series: null,
        url,
        source: "TMDB",
        goodreadsUrl: null,
        because,
      });
    }
  }
  return { state: "ok", entries };
}

function releaseLabel(date: string | null, now: Date): RadarEntry["release"] {
  const time = date ? Date.parse(date) : Number.NaN;
  if (!date || Number.isNaN(time)) return { label: "Announced", upcoming: true };
  const days = Math.round((time - now.getTime()) / DAY_MS);
  const d = new Date(time);
  const monthYear = `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (days > 0) {
    if (days === 1) return { label: "Tomorrow", upcoming: true };
    return { label: days < 45 ? `In ${days} days` : `Out ${monthYear}`, upcoming: true };
  }
  if (days > -60) return { label: "Just out", upcoming: false };
  return { label: monthYear, upcoming: false };
}

function sortEntries(entries: RadarEntry[], now: Date): RadarEntry[] {
  const rank = (e: RadarEntry) => (!e.date ? 2 : Date.parse(e.date) > now.getTime() ? 0 : 1);
  return entries.sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank) return byRank;
    if (rank(a) === 0) return a.date!.localeCompare(b.date!);
    if (rank(a) === 1) return b.date!.localeCompare(a.date!);
    return a.title.localeCompare(b.title);
  });
}
