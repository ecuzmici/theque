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

/** "partial" means that some lookups failed and the others gave entries. */
export type SourceState = "ok" | "partial" | "no_key" | "error";

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
/** One Hardcover query holds all authors. The cap keeps the query small. */
const MAX_AUTHORS = 50;
const MIN_RATING = 4;
/** A released book with fewer readers is a stray edition or a translation. */
const MIN_READERS_RELEASED = 5;
const DAY_MS = 86_400_000;

/** Teasers, placeholders and audio dramas. None of them is a new book or film. */
const NOT_A_RELEASE = /^(untitled|sneak peek|excerpt|sampler|preview)\b|dramatized|dramatised|\baudio drama\b/i;

/** Words in a parenthesis or a subtitle that name an edition, not a new work. */
const EDITION_NOISE =
  /\b(a novel|novel|novella|edition|deluxe|anniversary|illustrated|collector'?s|reissue|unabridged|paperback|hardcover|hardback)\b/i;

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

  const authors = lovedCreators(items, "books", (i) => i.authors[0], MAX_AUTHORS);
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
    entries: sortEntries([...books.entries, ...films.entries]),
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
    .map(([name, item]) => [name, { id: item.id, title: shortTitle(item.title), rating: item.rating ?? 0 }] as const);
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
  const savedUrls = new Set(items.map((i) => i.url));
  // One set for all authors, so a book by two followed authors shows once.
  const seenIds = new Set<number>();
  const seenWorks = new Set<string>();
  const entries: RadarEntry[] = [];
  // Most-read first, so a duplicate record of a book loses to the main record.
  const books = result.data
    .flatMap((author) => author.contributions.map((c) => ({ author: author.name, book: c.book })))
    .sort((a, b) => (b.book.users_count ?? 0) - (a.book.users_count ?? 0));
  for (const { author, book } of books) {
    const because = authors.get(author);
    const url = book.slug ? `https://hardcover.app/books/${book.slug}` : null;
    const work = workKey(book.title);
    if (!because || !url || seenIds.has(book.id) || seenWorks.has(work)) continue;
    if (!isNewBook(book, now) || savedUrls.has(url) || library.some((item) => workKey(item.title) === work)) continue;
    seenIds.add(book.id);
    seenWorks.add(work);
    entries.push({
      key: `book-${book.id}`,
      kind: "book",
      title: book.title,
      creator: author,
      date: book.release_date,
      release: releaseLabel(book.release_date, now),
      image: bookCover(book),
      series: null,
      url,
      source: "Hardcover",
      goodreadsUrl: `https://www.goodreads.com/search?q=${encodeURIComponent(`${book.title} ${author}`)}`,
      because,
    });
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

/**
 * The title without edition words. "Project Hail Mary (Deluxe Edition): A
 * Novel" gives "Project Hail Mary". "Dune: The Heir" stays as it is.
 */
export function editionBase(title: string): string {
  let out = title.replace(/\s*[([]([^)\]]*)[)\]]/g, (match, inner: string) => (EDITION_NOISE.test(inner) ? "" : match));
  const colon = out.indexOf(":");
  if (colon > 0 && EDITION_NOISE.test(out.slice(colon + 1))) out = out.slice(0, colon);
  return out.trim();
}

/**
 * The rated title for display. It drops edition words, and a subtitle when
 * the title is long. "Dune: Part Two" stays as it is.
 */
function shortTitle(title: string): string {
  const base = editionBase(title);
  const colon = base.indexOf(":");
  return base.length > 40 && colon > 0 ? base.slice(0, colon).trim() : base;
}

/** One key for each work: a re-edition gives the same key, a new subtitle does not. */
function workKey(title: string): string {
  return editionBase(title)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** A print or ebook cover. An audiobook cover is square art, so the card shows the title instead. */
function bookCover(book: HcBook): string | null {
  const print = book.print_cover?.[0]?.image?.url;
  if (print) return print;
  const cover = book.image?.url ?? null;
  const audio = book.default_audio_edition?.image?.url;
  return cover && cover === audio ? null : cover;
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
  const failed = results.filter((r) => r.result.state !== "ok");
  if (failed.length === results.length) {
    return { state: failed[0]!.result.state as SourceState, entries: [] };
  }

  const library = items.filter((i) => i.category === "movies_and_tv");
  const savedUrls = new Set(items.map((i) => i.url));
  const seen = new Set<number>();
  const entries: RadarEntry[] = [];
  for (const { because, result } of results) {
    if (result.state !== "ok" || !result.data) continue;
    for (const credit of result.data.credits) {
      const url = `https://www.themoviedb.org/movie/${credit.id}`;
      if (seen.has(credit.id)) continue;
      if ((credit.date && credit.date < since) || NOT_A_RELEASE.test(credit.title)) continue;
      // A film matches on its full title, so "Dune: Part Three" stays next to "Dune: Part Two".
      if (savedUrls.has(url) || library.some((item) => titleScore(item.title, credit.title) === 2)) continue;
      seen.add(credit.id);
      entries.push({
        key: `film-${credit.id}`,
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
  return { state: failed.length > 0 ? "partial" : "ok", entries };
}

function releaseLabel(date: string | null, now: Date): RadarEntry["release"] {
  const time = date ? Date.parse(date) : Number.NaN;
  if (!date || Number.isNaN(time)) return { label: "Announced", upcoming: true };
  const d = new Date(time);
  const monthYear = `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  // One rule for the label, the filter and the sort: upcoming means a later time than now.
  if (time > now.getTime()) {
    const days = Math.ceil((time - now.getTime()) / DAY_MS);
    if (days === 1) return { label: "Tomorrow", upcoming: true };
    return { label: days < 45 ? `In ${days} days` : `Out ${monthYear}`, upcoming: true };
  }
  if (now.getTime() - time < 60 * DAY_MS) return { label: "Just out", upcoming: false };
  return { label: monthYear, upcoming: false };
}

function sortEntries(entries: RadarEntry[]): RadarEntry[] {
  const rank = (e: RadarEntry) => (!e.date ? 2 : e.release.upcoming ? 0 : 1);
  return entries.sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank) return byRank;
    if (rank(a) === 0) return a.date!.localeCompare(b.date!);
    if (rank(a) === 1) return b.date!.localeCompare(a.date!);
    return a.title.localeCompare(b.title);
  });
}
