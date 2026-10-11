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

/** Genre labels from `cached_tags.Genre`, in Hardcover order, without duplicates. */
export function hardcoverGenreLabels(row: HardcoverBookRow, max = MAX_GENRES): string[] {
  const tags = row.cached_tags as { Genre?: unknown } | null | undefined;
  if (!tags || !Array.isArray(tags.Genre)) return [];
  const out: string[] = [];
  for (const entry of tags.Genre) {
    const tag = (entry as { tag?: unknown } | null)?.tag;
    if (typeof tag === "string" && tag.trim() && !out.includes(tag.trim())) out.push(tag.trim());
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Match each book to a Hardcover row and read its genres. A book with authors
 * needs an author overlap, so a title clash does not give a wrong genre.
 */
export function matchGenreRows(rows: HardcoverBookRow[], books: GenreLookupBook[]): GenreLookupResult {
  const result: GenreLookupResult = { genres: new Map(), misses: new Map() };
  for (const book of books) {
    const row = pickHardcoverRow(rows, { title: book.title, creator: book.authors.join(", ") });
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
  const titles = [...new Set(books.map((b) => b.title.trim()).filter(Boolean))];
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
