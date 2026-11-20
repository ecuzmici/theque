/**
 * Hardcover and TMDB lookups for the release radar. Both APIs are free.
 * Hardcover allows 60 requests a minute with a burst of 5, so each lookup
 * sends one batched query. The Next data cache keeps each response for one day.
 */

export type Fetch = typeof fetch;

/** The result of one source lookup. "no_key" and "error" carry no data. */
export type SourceResult<T> = { state: "ok"; data: T } | { state: "no_key" | "error" };

const DAY = 86_400;
const HARDCOVER_ENDPOINT = "https://api.hardcover.app/v1/graphql";
const TMDB_BASE = "https://api.themoviedb.org/3";

// ---------------------------------------------------------------- Hardcover

type EditionLanguage = { language: { code2: string | null } | null } | null;

export type HcBook = {
  id: number;
  title: string;
  slug: string | null;
  release_date: string | null;
  users_count: number | null;
  image: { url: string | null } | null;
  default_physical_edition: EditionLanguage;
  default_ebook_edition: EditionLanguage;
};

export type HcAuthor = { id: number; name: string; contributions: Array<{ book: HcBook }> };

export type HcTitleRow = {
  title: string;
  cached_contributors: Array<{ author?: { name?: string }; contribution?: string | null }> | null;
  book_series: Array<{ position: number | null; series: { name: string } | null }>;
};

function hardcoverAuth(key: string | null | undefined): string | null {
  const raw = key?.trim();
  if (!raw) return null;
  return raw.toLowerCase().startsWith("bearer ") ? raw : `Bearer ${raw}`;
}

async function hardcover<T>(
  fetchFn: Fetch,
  key: string | null | undefined,
  query: string,
  variables: Record<string, unknown>,
): Promise<SourceResult<T>> {
  const auth = hardcoverAuth(key);
  if (!auth) return { state: "no_key" };
  try {
    const res = await fetchFn(HARDCOVER_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: auth },
      body: JSON.stringify({ query, variables }),
      next: { revalidate: DAY },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { state: "error" };
    const body = (await res.json()) as { data?: T; errors?: Array<{ message?: string }> };
    if (body.errors?.length || !body.data) {
      console.warn("[radar/hardcover]", body.errors?.[0]?.message ?? "no data");
      return { state: "error" };
    }
    return { state: "ok", data: body.data };
  } catch {
    return { state: "error" };
  }
}

export const AUTHORS_QUERY = `query RadarAuthors($names: [String!]!, $since: date!) {
  authors(where: {name: {_in: $names}}, order_by: {books_count: desc}) {
    id
    name
    contributions(
      where: {
        _or: [{contribution: {_is_null: true}}, {contribution: {_eq: "Author"}}]
        book: {release_date: {_gte: $since}, compilation: {_eq: false}}
      }
      order_by: {book: {release_date: desc}}
      limit: 20
    ) {
      book {
        id title slug release_date users_count image { url }
        default_physical_edition { language { code2 } }
        default_ebook_edition { language { code2 } }
      }
    }
  }
}`;

/**
 * Books by each author, released on or after `since` (ISO date), in one query.
 * Hardcover can hold two authors with the same name. The author with the most
 * books comes first and wins.
 */
export async function recentBooksByAuthors(
  fetchFn: Fetch,
  key: string | null | undefined,
  names: string[],
  since: string,
): Promise<SourceResult<HcAuthor[]>> {
  if (names.length === 0) return { state: "ok", data: [] };
  const result = await hardcover<{ authors: HcAuthor[] }>(fetchFn, key, AUTHORS_QUERY, { names, since });
  if (result.state !== "ok") return result;
  const seen = new Set<string>();
  const authors = result.data.authors.filter((a) => {
    const name = a.name.toLowerCase();
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });
  return { state: "ok", data: authors };
}

export const SERIES_FOR_TITLES_QUERY = `query RadarSeriesForTitles($where: [books_bool_exp!]!) {
  books(where: {_or: $where, users_count: {_gt: 0}}, order_by: {users_count: desc}, limit: 500) {
    title
    cached_contributors
    book_series(where: {featured: {_eq: true}}) { position series { name } }
  }
}`;

const SERIES_BATCH = 40;

/**
 * Hardcover books that match the titles, most-read first, with their featured
 * series. One `_or` query for each batch of 40 titles. A failed batch gives
 * no rows; the caller shows the books without a series.
 */
export async function booksByTitles(
  fetchFn: Fetch,
  key: string | null | undefined,
  titles: string[],
): Promise<HcTitleRow[]> {
  const rows: HcTitleRow[] = [];
  for (let i = 0; i < titles.length; i += SERIES_BATCH) {
    const where = titles
      .slice(i, i + SERIES_BATCH)
      .map((title) => ({ title: { _ilike: title.replace(/[\\%_]/g, (c) => `\\${c}`) } }));
    const result = await hardcover<{ books: HcTitleRow[] }>(fetchFn, key, SERIES_FOR_TITLES_QUERY, { where });
    if (result.state === "ok") rows.push(...result.data.books);
  }
  return rows;
}

// --------------------------------------------------------------------- TMDB

export type TmdbPersonSearch = {
  results?: Array<{ id: number; name: string; known_for_department?: string }>;
};

export type TmdbCombinedCredits = {
  crew?: Array<{
    id: number;
    media_type?: "movie" | "tv";
    title?: string;
    name?: string;
    job?: string;
    release_date?: string;
    first_air_date?: string;
    poster_path?: string | null;
  }>;
};

async function tmdb<T>(
  fetchFn: Fetch,
  key: string | null | undefined,
  path: string,
  params: Record<string, string> = {},
): Promise<SourceResult<T>> {
  if (!key?.trim()) return { state: "no_key" };
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", key.trim());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const res = await fetchFn(url, { next: { revalidate: DAY }, signal: AbortSignal.timeout(8_000) });
    return res.ok ? { state: "ok", data: (await res.json()) as T } : { state: "error" };
  } catch {
    return { state: "error" };
  }
}

function sameName(a: string, b: string): boolean {
  const norm = (v: string) => v.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
  return norm(a) === norm(b);
}

export type DirectorCredit = {
  id: number;
  media: "movie" | "tv";
  title: string;
  date: string | null;
  poster: string | null;
};

/**
 * The films and shows that a person directed, newest first. The person must
 * have the same name. A person known for directing wins over a namesake.
 */
export async function directorCredits(
  fetchFn: Fetch,
  key: string | null | undefined,
  name: string,
): Promise<SourceResult<{ person: string; credits: DirectorCredit[] } | null>> {
  const search = await tmdb<TmdbPersonSearch>(fetchFn, key, "/search/person", { query: name });
  if (search.state !== "ok") return search;
  // TMDB search is fuzzy: "Jon Park" also finds "Jon Parkin". Keep the people with the same name.
  const results = (search.data.results ?? []).filter((p) => sameName(p.name, name));
  const person = results.find((p) => p.known_for_department === "Directing") ?? results[0];
  if (!person) return { state: "ok", data: null };

  const credits = await tmdb<TmdbCombinedCredits>(fetchFn, key, `/person/${person.id}/combined_credits`);
  if (credits.state !== "ok") return credits;
  const seen = new Set<string>();
  const list: DirectorCredit[] = [];
  for (const c of credits.data.crew ?? []) {
    const media = c.media_type === "tv" ? "tv" : "movie";
    const id = `${media}-${c.id}`;
    if (c.job !== "Director" || seen.has(id)) continue;
    seen.add(id);
    list.push({
      id: c.id,
      media,
      title: c.title ?? c.name ?? "Untitled",
      date: c.release_date || c.first_air_date || null,
      poster: c.poster_path ? `https://image.tmdb.org/t/p/w342${c.poster_path}` : null,
    });
  }
  list.sort((a, b) => (b.date ?? "9999").localeCompare(a.date ?? "9999"));
  return { state: "ok", data: { person: person.name, credits: list } };
}
