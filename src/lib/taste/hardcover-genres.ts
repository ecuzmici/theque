import "server-only";

import { assertSafeFetchUrl } from "@/lib/enrichment/fetch";
import { authorsOverlap } from "@/lib/recommend/resolve/open-library";
import {
  hardcoverAuthors,
  pickHardcoverRow,
  type HardcoverBookRow,
} from "@/lib/recommend/resolve/hardcover";

// Batched Hardcover genre lookup for the book genre backfill (ADR 0020, decision 4).
// One GraphQL request covers a whole batch of titles. The free tier allows a
// burst of 5 requests per token, and each top-level field counts as one request.

const ENDPOINT = "https://api.hardcover.app/v1/graphql";
const TIMEOUT_MS = 10000;
const ROW_LIMIT = 300;
const MAX_GENRES = 5;
/**
 * Keep a genre tag only when its vote count is at least this share of the top
 * tag count. Readers add "Science Fiction" to many fantasy books with few votes.
 */
const MIN_VOTE_SHARE = 0.25;
/**
 * Ignore the genre tags of a book when its top tag has fewer votes than this.
 * Few votes give noisy tags, and the LLM tagger gives better genres.
 */
const MIN_TOP_VOTES = 5;

const GENRE_QUERY = `query ThequeBookGenres($where: [books_bool_exp!]!, $limit: Int!) {
  books(where: {_or: $where}, order_by: {users_count: desc}, limit: $limit) {
    id
    slug
    title
    users_count
    cached_contributors
    cached_tags
  }
}`;

export type GenreLookupBook = { id: string; title: string; authors: string[] };

export type GenreLookupResult = {
  /** Genre labels by item id. A book with no match has no entry. */
  genres: Map<string, string[]>;
  /** Why a book has no entry, by item id. */
  misses: Map<string, string>;
};

function readToken(): string | null {
  const raw = process.env.HARDCOVER_API_KEY?.trim();
  if (!raw) return null;
  return raw.toLowerCase().startsWith("bearer ") ? raw : `Bearer ${raw}`;
}

/** Escape the ilike wildcards so a title matches literally. */
function ilikeLiteral(title: string): string {
  return title.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Genre labels from `cached_tags.Genre`, in Hardcover order, without duplicates.
 * A tag with a vote count below MIN_VOTE_SHARE of the top count is dropped.
 * When the top count is below MIN_TOP_VOTES, the function returns no label.
 * A tag with no count is kept.
 */
export function hardcoverGenreLabels(row: HardcoverBookRow, max = MAX_GENRES): string[] {
  const tags = row.cached_tags as { Genre?: unknown } | null | undefined;
  if (!tags || !Array.isArray(tags.Genre)) return [];
  const entries = tags.Genre.map((entry) => entry as { tag?: unknown; count?: unknown } | null);
  const counts = entries.map((e) => (typeof e?.count === "number" ? e.count : null));
  const top = Math.max(0, ...counts.map((c) => c ?? 0));
  if (counts.some((c) => c !== null) && top < MIN_TOP_VOTES) return [];
  const out: string[] = [];
  entries.forEach((entry, i) => {
    const tag = entry?.tag;
    const count = counts[i];
    if (out.length >= max || typeof tag !== "string" || !tag.trim()) return;
    if (count !== null && count < top * MIN_VOTE_SHARE) return;
    if (!out.includes(tag.trim())) out.push(tag.trim());
  });
  return out;
}

const SERIES_SUFFIX = /\s*\([^()]*#\s*\d+(\.\d+)?\)\s*$/;
const SUBTITLE = /\s*:\s.*$/;

/**
 * Titles to look up for one book, most exact first:
 *   1. The saved title.
 *   2. The title without a Goodreads series suffix, "Dune (Dune, #1)" → "Dune".
 *   3. The title without a subtitle, "Into Thin Air: A Personal Account" → "Into Thin Air".
 * The subtitle variant needs an author, because a short title clashes more.
 */
export function lookupTitles(book: Pick<GenreLookupBook, "title" | "authors">): string[] {
  const full = book.title.trim();
  const noSeries = full.replace(SERIES_SUFFIX, "").trim();
  const out = [full, noSeries];
  if (book.authors.length > 0) out.push(noSeries.replace(SUBTITLE, "").trim());
  return [...new Set(out.filter(Boolean))];
}

function pickForBook(rows: HardcoverBookRow[], book: GenreLookupBook): HardcoverBookRow | null {
  for (const title of lookupTitles(book)) {
    const row = pickHardcoverRow(rows, { title, creator: book.authors.join(", ") });
    if (row) return row;
  }
  return null;
}

/**
 * Match each book to a Hardcover row and read its genres. A book with authors
 * needs an author overlap, so a title clash does not give a wrong genre.
 */
export function matchGenreRows(rows: HardcoverBookRow[], books: GenreLookupBook[]): GenreLookupResult {
  const result: GenreLookupResult = { genres: new Map(), misses: new Map() };
  for (const book of books) {
    const row = pickForBook(rows, book);
    if (!row) {
      result.misses.set(book.id, "no title match");
      continue;
    }
    if (book.authors.length > 0 && !authorsOverlap(book.authors.join(", "), hardcoverAuthors(row))) {
      result.misses.set(book.id, "no author match");
      continue;
    }
    const genres = hardcoverGenreLabels(row);
    if (genres.length === 0) {
      result.misses.set(book.id, "match has no genres");
      continue;
    }
    result.genres.set(book.id, genres);
  }
  return result;
}

/** One Hardcover request for a batch of books. Throws on a network or API error. */
export async function lookupBookGenres(books: GenreLookupBook[]): Promise<GenreLookupResult> {
  const token = readToken();
  if (!token) throw new Error("HARDCOVER_API_KEY is not set");
  const titles = [...new Set(books.flatMap(lookupTitles))];
  if (titles.length === 0) return { genres: new Map(), misses: new Map() };

  const url = new URL(ENDPOINT);
  await assertSafeFetchUrl(url);
  const res = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "content-type": "application/json", accept: "application/json", authorization: token },
    body: JSON.stringify({
      query: GENRE_QUERY,
      variables: {
        where: titles.map((title) => ({ title: { _ilike: ilikeLiteral(title) } })),
        limit: ROW_LIMIT,
      },
    }),
  });
  if (!res.ok) throw new Error(`hardcover http ${res.status}`);
  const body = (await res.json()) as { errors?: { message?: string }[]; data?: { books?: unknown } };
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    throw new Error(`hardcover error: ${body.errors[0]?.message ?? "unknown"}`);
  }
  if (!Array.isArray(body.data?.books)) throw new Error("hardcover: no books array");
  return matchGenreRows(body.data.books as HardcoverBookRow[], books);
}
