import "server-only";

import { assertSafeFetchUrl } from "@/lib/enrichment/fetch";
import type { CategoryResolver, ResolverPatch } from "@/lib/enrichment/resolvers/types";

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

type SearchDocument = {
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

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** 2 = exact title, 1 = one title contains the other, 0 = unrelated. */
function titleScore(candidate: string, wanted: string): number {
  const a = normalize(candidate);
  const b = normalize(wanted);
  if (!a || !b) return 0;
  if (a === b) return 2;
  return a.includes(b) || b.includes(a) ? 1 : 0;
}

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
 * Books resolver — Hardcover GraphQL search. Ranked above Google Books because
 * it carries series and genres, which Google Books omits. Needs
 * HARDCOVER_API_KEY; returns null without one so enrichment falls through.
 */
export const resolveHardcover: CategoryResolver = async (input) => {
  const title = input.title?.trim() ?? "";
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
  // checks returned a German ISBN for Piranesi and 2019 for a 2020 title, so
  // both stay with Google Books, which the merged books path still runs.
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
