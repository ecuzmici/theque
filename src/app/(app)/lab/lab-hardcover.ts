import "server-only";

/**
 * Hardcover GraphQL helpers for the idea lab. Free API, key in
 * HARDCOVER_API_KEY. The limit is about 60 requests a minute, so callers
 * batch names into one query and responses are cached for a day.
 */
const ENDPOINT = "https://api.hardcover.app/v1/graphql";
const DAY = 86_400;

function token(): string | null {
  const raw = process.env.HARDCOVER_API_KEY?.trim();
  if (!raw) return null;
  return raw.toLowerCase().startsWith("bearer ") ? raw : `Bearer ${raw}`;
}

export async function hardcover<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  const auth = token();
  if (!auth) return null;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: auth },
      body: JSON.stringify({ query, variables }),
      next: { revalidate: DAY },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: T; errors?: Array<{ message?: string }> };
    if (body.errors?.length) {
      console.warn("[lab/hardcover]", body.errors[0]?.message);
      return null;
    }
    return body.data ?? null;
  } catch {
    return null;
  }
}

export type HcBook = {
  id: number;
  title: string;
  slug: string | null;
  release_date: string | null;
  users_count: number | null;
  image: { url: string | null } | null;
};

export type HcSeries = {
  id: number;
  name: string;
  books_count: number | null;
  primary_books_count: number | null;
  book_series: Array<{ position: number | null; book: HcBook }>;
};

const SERIES_QUERY = `query LabSeries($names: [String!]!) {
  series(where: {name: {_in: $names}, books_count: {_gt: 0}}, order_by: {books_count: desc}) {
    id
    name
    books_count
    primary_books_count
    book_series(
      where: {featured: {_eq: true}, position: {_is_null: false}, book: {compilation: {_eq: false}}}
      order_by: {position: asc}
    ) {
      position
      book { id title slug release_date users_count image { url } }
    }
  }
}`;

/** Series by exact name. When names collide, the series with the most books wins. */
export async function seriesByName(names: string[]): Promise<Map<string, HcSeries>> {
  const out = new Map<string, HcSeries>();
  if (names.length === 0) return out;
  const data = await hardcover<{ series: HcSeries[] }>(SERIES_QUERY, { names });
  for (const s of data?.series ?? []) {
    const key = s.name.toLowerCase();
    // Keep the biggest series of a name; it is the one people mean.
    if (!out.has(key)) out.set(key, s);
  }
  return out;
}

export type HcAuthor = {
  id: number;
  name: string;
  contributions: Array<{ book: HcBook }>;
};

const AUTHORS_QUERY = `query LabAuthors($names: [String!]!, $since: date!) {
  authors(where: {name: {_in: $names}}, order_by: {books_count: desc}) {
    id
    name
    contributions(
      where: {contribution: {_is_null: true}, book: {release_date: {_gte: $since}, compilation: {_eq: false}}}
      order_by: {book: {release_date: desc}}
      limit: 8
    ) {
      book { id title slug release_date users_count image { url } }
    }
  }
}`;

/** Books by each author released on or after `since` (ISO date), newest first. */
export async function recentBooksByAuthors(names: string[], since: string): Promise<HcAuthor[]> {
  if (names.length === 0) return [];
  const data = await hardcover<{ authors: HcAuthor[] }>(AUTHORS_QUERY, { names, since });
  const seen = new Set<string>();
  return (data?.authors ?? []).filter((a) => {
    const key = a.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
