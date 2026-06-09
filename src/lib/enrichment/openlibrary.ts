/**
 * Open Library work enrichment.
 *
 * Open Library work *pages* (HTML) are unreliable: og:title and even the <h1>
 * show whichever edition Open Library happens to pick as default, which is
 * frequently a non-English translation (e.g. "Yüzüklerin Efendisi" for The Lord
 * of the Rings). The generic HTML extractor therefore renders these books badly.
 *
 * Open Library's JSON API exposes the canonical (English) work title, a clean
 * description, cover ids, and author keys, so we fetch that directly instead of
 * scraping the page. All fetches go through the B4 SSRF guard.
 */

import "server-only";

import type { ExtractResult, RawMetadata } from "@/lib/enrichment/extract";
import { assertSafeFetchUrl } from "@/lib/enrichment/fetch";
import type { FetchPageResult } from "@/lib/enrichment/fetch";

const TIMEOUT_MS = 8000;
const MAX_AUTHORS = 3;
const WORK_KEY_RE = /\/works\/(OL\d+W)\b/i;

type OpenLibraryWork = {
  title?: unknown;
  description?: unknown;
  covers?: unknown;
  authors?: unknown;
  first_publish_date?: unknown;
};

/**
 * Extract the work key (e.g. "OL27448W") from an Open Library work URL.
 * Returns null for non-Open-Library hosts or non-work paths (e.g. /books/...M).
 */
export function parseOpenLibraryWorkKey(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "openlibrary.org") return null;
  const match = parsed.pathname.match(WORK_KEY_RE);
  return match ? match[1] : null;
}

async function fetchJson(url: string): Promise<unknown | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
    await assertSafeFetchUrl(parsed);
  } catch {
    return null;
  }
  try {
    const res = await fetch(parsed, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

/** Open Library descriptions are either a string or `{ type, value }`. */
function descriptionToString(description: unknown): string | null {
  if (typeof description === "string") return description.trim() || null;
  if (description && typeof description === "object") {
    const value = (description as { value?: unknown }).value;
    if (typeof value === "string") return value.trim() || null;
  }
  return null;
}

function firstCoverId(covers: unknown): number | null {
  if (!Array.isArray(covers)) return null;
  for (const id of covers) {
    // Open Library uses -1 as a sentinel for "no cover".
    if (typeof id === "number" && id > 0) return id;
  }
  return null;
}

function extractYear(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/\b(\d{4})\b/);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  return Number.isNaN(year) ? null : year;
}

async function resolveAuthorNames(authors: unknown): Promise<string[]> {
  if (!Array.isArray(authors)) return [];
  const keys = authors
    .map((entry) => {
      if (entry && typeof entry === "object") {
        const author = (entry as { author?: { key?: unknown } }).author;
        if (author && typeof author.key === "string") return author.key;
      }
      return null;
    })
    .filter((key): key is string => Boolean(key))
    .slice(0, MAX_AUTHORS);

  const names: string[] = [];
  for (const key of keys) {
    const author = await fetchJson(`https://openlibrary.org${key}.json`);
    const name = (author as { name?: unknown } | null)?.name;
    if (typeof name === "string" && name.trim()) names.push(name.trim());
  }
  return names;
}

/**
 * Resolve an Open Library work URL to a clean ExtractResult via the JSON API.
 * Returns null when the URL is not an Open Library work or the API is
 * unreachable, so the caller can fall back to the generic HTML pipeline.
 */
export async function enrichOpenLibraryWork(
  canonicalUrl: string,
): Promise<{ fetchResult: FetchPageResult; extracted: ExtractResult } | null> {
  const key = parseOpenLibraryWorkKey(canonicalUrl);
  if (!key) return null;

  const work = (await fetchJson(`https://openlibrary.org/works/${key}.json`)) as
    | OpenLibraryWork
    | null;
  if (!work || typeof work.title !== "string" || !work.title.trim()) return null;

  const title = work.title.trim();
  const description = descriptionToString(work.description);
  const coverId = firstCoverId(work.covers);
  const image_url = coverId
    ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
    : null;
  const authors = await resolveAuthorNames(work.authors);
  const publishedYear = extractYear(work.first_publish_date);

  const structured: Record<string, unknown> = { site_name: "Open Library" };
  if (authors.length) structured.authors = authors;
  if (publishedYear !== null) structured.published_year = publishedYear;

  const finalUrl = `https://openlibrary.org/works/${key}`;
  const raw_metadata: RawMetadata = {
    fetched_at: new Date().toISOString(),
    final_url: finalUrl,
    status_code: 200,
    open_graph: {},
    twitter: {},
    json_ld: [],
    parser: "openlibrary",
  };

  return {
    // Synthetic fetch result: the JSON path does not scrape HTML, but downstream
    // enrichment only reads finalUrl/statusCode/html (html only for bot-block
    // detection, which an empty body passes).
    fetchResult: { html: "", finalUrl, statusCode: 200 },
    extracted: {
      title,
      subtitle: null,
      description,
      image_url,
      structured,
      raw_metadata,
    },
  };
}
