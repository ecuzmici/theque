import "server-only";

import { assertSafeFetchUrl } from "@/lib/enrichment/fetch";
import type { CategoryResolver, ResolverPatch } from "@/lib/enrichment/resolvers/types";
import { extractHardcoverSlug } from "@/lib/enrichment/url-hints";
import { titleScore } from "@/lib/enrichment/resolvers/title-match";
import { firstValidIsbn, isEnglishGroupIsbn, normalizeIsbn } from "@/lib/isbn";

const ENDPOINT = "https://api.hardcover.app/v1/graphql";
const TIMEOUT_MS = 8000;
const PER_PAGE = 5;

/**
 * Hardcover search returns a Typesense payload whose `document` carries every
 * field we need in one round trip. Relevance is weak, so we re-rank locally:
 * an exact title match beats a partial one, then popularity breaks the tie.
 */
const SEARCH_QUERY = `query ThequeBookSearch($q: String!, $perPage: Int!) {
  search(query: $q, query_type: "Book", per_page: $perPage) {
    results
  }
}`;

/**
 * Hardcover picks one default edition per book, usually the first English
 * hardcover. Its ISBN is stable, unlike the search document `isbns`, which
 * lists every edition in no fixed order. The 10 most-read editions with an
 * ISBN are the fallback when the default edition is not English.
 */
const EDITION_QUERY = `query ThequeDefaultEdition($id: Int!) {
  books_by_pk(id: $id) {
    default_physical_edition { isbn_13 isbn_10 }
    default_ebook_edition { isbn_13 isbn_10 }
    editions(where: {isbn_13: {_is_null: false}}, order_by: {users_count: desc}, limit: 10) { isbn_13 isbn_10 }
  }
}`;

type EditionIsbns = { isbn_13?: unknown; isbn_10?: unknown } | null | undefined;

type SearchDocument = {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  author_names?: unknown;
  genres?: unknown;
  series_names?: unknown;
  featured_series?: { position?: unknown } | null;
  pages?: unknown;
  rating?: unknown;
  users_count?: unknown;
  image?: { url?: unknown } | null;
};

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringArray(value: unknown, limit: number): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed && !out.includes(trimmed)) out.push(trimmed);
    if (out.length >= limit) break;
  }
  return out.length ? out : null;
}

function readToken(): string | null {
  const raw = process.env.HARDCOVER_API_KEY?.trim();
  if (!raw) return null;
  return raw.toLowerCase().startsWith("bearer ") ? raw : `Bearer ${raw}`;
}

/** Pick the best hit for `wanted`, or null when nothing plausibly matches. */
function pickBest(hits: unknown, wanted: string): SearchDocument | null {
  if (!Array.isArray(hits)) return null;
  let best: SearchDocument | null = null;
  let bestScore = 0;
  let bestCount = -1;

  for (const hit of hits) {
    const doc = (hit as { document?: SearchDocument } | null)?.document;
    if (!doc || typeof doc.title !== "string") continue;
    const score = titleScore(doc.title, wanted);
    if (score === 0) continue;
    const users = count(doc.users_count);
    if (score > bestScore || (score === bestScore && users > bestCount)) {
      best = doc;
      bestScore = score;
      bestCount = users;
    }
  }
  return best;
}

/**
 * ISBN for Hardcover book `id`. The order is:
 * 1. the default physical edition, then the default ebook edition, when the
 *    ISBN is from an English-language group;
 * 2. the most-read edition with an English-language ISBN;
 * 3. the default physical edition, the default ebook edition, then the
 *    most-read edition, in any language.
 * ISBN-13 comes before ISBN-10. Null on any miss or error.
 */
export async function fetchDefaultEditionIsbn(id: number, token: string): Promise<string | null> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "content-type": "application/json", accept: "application/json", authorization: token },
      body: JSON.stringify({ query: EDITION_QUERY, variables: { id } }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: {
        books_by_pk?: {
          default_physical_edition?: EditionIsbns;
          default_ebook_edition?: EditionIsbns;
          editions?: EditionIsbns[];
        } | null;
      };
    };
    const book = body.data?.books_by_pk;
    if (!book) return null;
    const isbnsOf = (edition: EditionIsbns) => [edition?.isbn_13, edition?.isbn_10];
    const defaults = [...isbnsOf(book.default_physical_edition), ...isbnsOf(book.default_ebook_edition)];
    const popular = (Array.isArray(book.editions) ? book.editions : []).flatMap(isbnsOf);
    const all = [...defaults, ...popular];
    return firstValidIsbn(all.filter(isEnglishGroupIsbn)) ?? firstValidIsbn(all);
  } catch {
    return null;
  }
}

/** Hardcover book id from a search document, or null. The search returns it as a string. */
function documentId(doc: SearchDocument): number | null {
  const id = typeof doc.id === "string" ? Number.parseInt(doc.id, 10) : doc.id;
  return typeof id === "number" && Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Books resolver — Hardcover GraphQL search. Ranked above Google Books because
 * it carries series and genres, which Google Books omits. Needs
 * HARDCOVER_API_KEY; returns null without one so enrichment falls through.
 */
/**
 * "a-fire-upon-the-deep" → "a fire upon the deep". A trailing number stays
 * ("catch-22"); the search still matches "the-three-body-problem-2" by containment.
 */
export function titleFromHardcoverSlug(slug: string): string {
  return slug.replace(/-/g, " ").trim();
}

export const resolveHardcover: CategoryResolver = async (input) => {
  // A blocked hardcover.app page gives no title. The URL slug still names the book.
  const slug = extractHardcoverSlug(input.canonicalUrl);
  const title = input.title?.trim() || (slug ? titleFromHardcoverSlug(slug) : "");
  if (!title) return null;

  const token = readToken();
  if (!token) return null;

  const url = new URL(ENDPOINT);
  try {
    await assertSafeFetchUrl(url);
  } catch {
    return null;
  }

  const authorHint = stringArray(input.structured.authors, 1)?.[0] ?? "";
  const query = authorHint ? `${title} ${authorHint}` : title;

  let doc: SearchDocument | null = null;
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "content-type": "application/json", accept: "application/json", authorization: token },
      body: JSON.stringify({ query: SEARCH_QUERY, variables: { q: query, perPage: PER_PAGE } }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      errors?: unknown[];
      data?: { search?: { results?: { hits?: unknown } } };
    };
    if (Array.isArray(body.errors) && body.errors.length > 0) return null;
    doc = pickBest(body.data?.search?.results?.hits, title);
  } catch {
    return null;
  }
  if (!doc) return null;

  const structured: Record<string, unknown> = {};

  const authors = stringArray(doc.author_names, 5);
  if (authors) structured.authors = authors;

  const genres = stringArray(doc.genres, 5);
  if (genres) structured.genres = genres;

  const series = stringArray(doc.series_names, 1);
  if (series) {
    structured.series = series[0];
    const position = doc.featured_series?.position;
    if (typeof position === "number" && Number.isFinite(position) && position > 0) {
      structured.series_index = position;
    }
  }

  // isbns[] and release_year describe an arbitrary edition, not the work. Live
  // checks returned a German ISBN for Piranesi and 2019 for a 2020 title. The
  // ISBN comes from the default edition instead, and only when the item has
  // no valid ISBN yet. The year stays with Google Books.
  const id = documentId(doc);
  if (id !== null && !normalizeIsbn(input.structured.isbn)) {
    const isbn = await fetchDefaultEditionIsbn(id, token);
    if (isbn) structured.isbn = isbn;
  }

  if (typeof doc.pages === "number" && Number.isInteger(doc.pages) && doc.pages > 0) {
    structured.page_count = doc.pages;
  }

  const patch: ResolverPatch = { source: "hardcover", structured };

  if (typeof doc.title === "string" && doc.title.trim()) patch.title = doc.title.trim();
  if (typeof doc.description === "string" && doc.description.trim()) {
    patch.description = doc.description.trim();
  }
  const image = doc.image?.url;
  if (typeof image === "string" && image.startsWith("https://")) patch.image_url = image;

  if (Object.keys(structured).length === 0 && !patch.description && !patch.image_url) return null;
  return patch;
};
