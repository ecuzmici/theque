/**
 * Hardcover resolver for book recommendations (ADR 0018).
 *
 * Resolves a whole round of LLM candidates in ONE GraphQL request. The free
 * API tier allows 60 requests per minute with a burst of 5, and each top-level
 * field counts as one request. A search per candidate (24 per round) hits that
 * limit, so this queries the `books` table once with a case-insensitive title
 * match for every candidate and picks the best row for each one locally.
 *
 * Needs HARDCOVER_API_KEY; without one every candidate resolves to null so
 * the caller falls back to Open Library. Fetches through the B4 SSRF guard.
 */

import "server-only";

import { assertSafeFetchUrl } from "@/lib/enrichment/fetch";
import { normalizeTitle } from "@/lib/recommend/dedup";
import type { LlmCandidate } from "@/lib/recommend/recommend-types";
import {
  type ResolvedBook,
  authorsOverlap,
  formatRatingCount,
} from "@/lib/recommend/resolve/open-library";

const ENDPOINT = "https://api.hardcover.app/v1/graphql";
const TIMEOUT_MS = 8000;
/** Rows returned for the whole round; popular titles have many editions. */
const ROW_LIMIT = 400;

const BOOKS_QUERY = `query ThequeRecommendBooks($where: [books_bool_exp!]!, $limit: Int!) {
  books(where: {_or: $where, users_count: {_gt: 0}}, order_by: {users_count: desc}, limit: $limit) {
    id
    slug
    title
    users_count
    rating
    ratings_count
    pages
    cached_contributors
    cached_tags
    image { url }
  }
}`;

export type HardcoverBookRow = {
  id?: unknown;
  slug?: unknown;
  title?: unknown;
  users_count?: unknown;
  rating?: unknown;
  ratings_count?: unknown;
  pages?: unknown;
  cached_contributors?: unknown;
  cached_tags?: unknown;
  image?: { url?: unknown } | null;
};

type Candidate = Pick<LlmCandidate, "title" | "creator">;

function readToken(): string | null {
  const raw = process.env.HARDCOVER_API_KEY?.trim();
  if (!raw) return null;
  return raw.toLowerCase().startsWith("bearer ") ? raw : `Bearer ${raw}`;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Escape the ilike wildcards so a title matches literally. */
function ilikeLiteral(title: string): string {
  return title.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Author names from cached_contributors, authors first. */
export function hardcoverAuthors(row: HardcoverBookRow): string[] {
  if (!Array.isArray(row.cached_contributors)) return [];
  const names: string[] = [];
  for (const entry of row.cached_contributors) {
    const c = entry as { author?: { name?: unknown }; contribution?: unknown } | null;
    const name = c?.author?.name;
    if (typeof name !== "string" || !name.trim()) continue;
    if (c?.contribution !== null && c?.contribution !== undefined && c.contribution !== "Author") continue;
    if (!names.includes(name.trim())) names.push(name.trim());
  }
  return names;
}

function hardcoverGenres(row: HardcoverBookRow): string[] {
  const tags = row.cached_tags as { Genre?: unknown } | null | undefined;
  if (!tags || !Array.isArray(tags.Genre)) return [];
  const out: string[] = [];
  for (const entry of tags.Genre) {
    const tag = (entry as { tag?: unknown } | null)?.tag;
    if (typeof tag === "string" && tag.trim() && !out.includes(tag.trim())) out.push(tag.trim());
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * Pick the best row for one candidate. Pass 1 needs a title match and an
 * author overlap. Pass 2 accepts a title match alone. Rows arrive sorted by
 * users_count, so the first match in each pass is the most shelved edition.
 */
export function pickHardcoverRow(rows: HardcoverBookRow[], candidate: Candidate): HardcoverBookRow | null {
  const wanted = normalizeTitle(candidate.title);
  const matches = rows.filter(
    (row) =>
      typeof row.title === "string" &&
      typeof row.slug === "string" &&
      row.slug !== "" &&
      normalizeTitle(row.title) === wanted,
  );
  if (candidate.creator) {
    const withAuthor = matches.find((row) => authorsOverlap(candidate.creator, hardcoverAuthors(row)));
    if (withAuthor) return withAuthor;
  }
  return matches[0] ?? null;
}

/**
 * Build a resolved book from a Hardcover row.
 *
 * confirmed_year stays null: Hardcover's release_year describes an arbitrary
 * edition (2019 for Piranesi, first published 2020), so the route keeps the
 * LLM year instead.
 */
export function toResolvedHardcoverBook(row: HardcoverBookRow): ResolvedBook {
  const authors = hardcoverAuthors(row);
  const genres = hardcoverGenres(row);
  const ratingsCount = positiveNumber(row.ratings_count);
  const pages = positiveNumber(row.pages);
  const cover = row.image?.url;
  return {
    canonical_url: `https://hardcover.app/books/${row.slug as string}`,
    cover_url: typeof cover === "string" && cover.startsWith("https://") ? cover : null,
    confirmed_year: null,
    external_id: `hardcover:${String(row.id ?? row.slug)}`,
    verified_author: authors.length > 0 ? authors.join(", ") : null,
    source_rating: ratingsCount ? positiveNumber(row.rating) : null,
    rating_count: ratingsCount ? formatRatingCount(ratingsCount) : null,
    length: pages && Number.isInteger(pages) ? `${pages} pages` : null,
    genres: genres.length > 0 ? genres : undefined,
    opening_line: null,
  };
}

/**
 * Resolve every candidate against Hardcover with one request. The result has
 * one entry per candidate, in the same order: a book, or null when Hardcover
 * has no match, no key is set, or the request fails.
 */
export async function resolveBooksWithHardcover(candidates: Candidate[]): Promise<(ResolvedBook | null)[]> {
  const none = candidates.map(() => null);
  const titles = [...new Set(candidates.map((c) => c.title.trim()).filter(Boolean))];
  if (titles.length === 0) return none;

  const token = readToken();
  if (!token) return none;

  const url = new URL(ENDPOINT);
  try {
    await assertSafeFetchUrl(url);
  } catch {
    return none;
  }

  let rows: HardcoverBookRow[];
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "content-type": "application/json", accept: "application/json", authorization: token },
      body: JSON.stringify({
        query: BOOKS_QUERY,
        variables: {
          where: titles.map((title) => ({ title: { _ilike: ilikeLiteral(title) } })),
          limit: ROW_LIMIT,
        },
      }),
    });
    if (!res.ok) return none;
    const body = (await res.json()) as { errors?: unknown[]; data?: { books?: unknown } };
    if (Array.isArray(body.errors) && body.errors.length > 0) return none;
    if (!Array.isArray(body.data?.books)) return none;
    rows = body.data.books as HardcoverBookRow[];
  } catch {
    return none;
  }

  return candidates.map((candidate) => {
    const row = pickHardcoverRow(rows, candidate);
    return row ? toResolvedHardcoverBook(row) : null;
  });
}
