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

type EditionLanguage = { language: { code2: string | null } | null } | null;

export type HcAuthorBook = HcBook & {
  default_physical_edition: EditionLanguage;
  default_ebook_edition: EditionLanguage;
};

export type HcAuthor = {
  id: number;
  name: string;
  contributions: Array<{ book: HcAuthorBook }>;
};

/** False when the default editions say the book is in a language other than English. */
export function isEnglishOrUnknown(book: HcAuthorBook): boolean {
  const codes = [book.default_physical_edition?.language?.code2, book.default_ebook_edition?.language?.code2].filter(Boolean);
  return codes.length === 0 || codes.includes("en");
}

const AUTHORS_QUERY = `query LabAuthors($names: [String!]!, $since: date!) {
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

const SERIES_FOR_TITLES = `query LabSeriesForTitles($where: [books_bool_exp!]!) {
  books(where: {_or: $where, users_count: {_gt: 0}}, order_by: {users_count: desc}, limit: 500) {
    title
    cached_contributors
    book_series(where: {featured: {_eq: true}}) { position series { name } }
  }
}`;

type TitleRow = {
  title: string;
  cached_contributors: Array<{ author?: { name?: string }; contribution?: string | null }> | null;
  book_series: Array<{ position: number | null; series: { name: string } | null }>;
};

export type FoundSeries = { name: string; position: number | null };

/**
 * Featured series for each entry, found by exact title in batches of 40.
 * The caller checks the authors. Rows come most-read first, so the first
 * match with series data wins.
 */
export async function seriesForTitles(
  entries: Array<{ key: string; title: string }>,
): Promise<Map<string, Array<FoundSeries & { authors: string[] }>>> {
  const out = new Map<string, Array<FoundSeries & { authors: string[] }>>();
  const norm = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
  for (let i = 0; i < entries.length; i += 40) {
    const batch = entries.slice(i, i + 40);
    const where = batch.map((e) => ({ title: { _ilike: e.title.replace(/[\\%_]/g, (c) => `\\${c}`) } }));
    const data = await hardcover<{ books: TitleRow[] }>(SERIES_FOR_TITLES, { where });
    for (const entry of batch) {
      if (out.has(entry.key)) continue;
      const row = data?.books.find((b) => norm(b.title) === norm(entry.title) && b.book_series.length > 0);
      if (!row) continue;
      const authors = (row.cached_contributors ?? [])
        .filter((c) => !c.contribution || c.contribution === "Author")
        .map((c) => c.author?.name ?? "")
        .filter(Boolean);
      out.set(
        entry.key,
        row.book_series
          .filter((s) => s.series?.name)
          .map((s) => ({ name: s.series!.name, position: s.position, authors })),
      );
    }
  }
  return out;
}
