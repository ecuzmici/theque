import "server-only";

import { assertSafeFetchUrl } from "@/lib/enrichment/fetch";
import { titleScore } from "@/lib/enrichment/resolvers/title-match";
import type { CategoryResolver, ResolverPatch } from "@/lib/enrichment/resolvers/types";
import { firstValidIsbn, normalizeIsbn } from "@/lib/isbn";

const SEARCH_BASE = "https://www.googleapis.com/books/v1/volumes";
const TIMEOUT_MS = 8000;

type VolumeInfo = {
  title?: unknown;
  language?: unknown;
  industryIdentifiers?: unknown;
  authors?: unknown;
  publishedDate?: unknown;
  pageCount?: unknown;
  imageLinks?: { thumbnail?: unknown };
};

function year(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = value.match(/\b(\d{4})\b/);
  if (!m) return null;
  const y = Number.parseInt(m[1], 10);
  return y >= 1000 && y <= 3000 ? y : null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  return out.length ? out : null;
}

/** ISBN-13, else ISBN-10, from a volume's industryIdentifiers. */
function volumeIsbn(info: VolumeInfo): string | null {
  if (!Array.isArray(info.industryIdentifiers)) return null;
  const ids = info.industryIdentifiers as Array<{ type?: unknown; identifier?: unknown }>;
  const of = (type: string) => ids.filter((id) => id?.type === type).map((id) => id.identifier);
  return firstValidIsbn([...of("ISBN_13"), ...of("ISBN_10")]);
}

/**
 * The volume to read. A title search returns study guides and editions in
 * many languages. The order is: exact title in English, exact title, partial
 * title in English, partial title. `matched` is false when no title matches;
 * the first volume still fills the other fields, but it does not supply an
 * ISBN.
 */
function pickVolume(volumes: VolumeInfo[], title: string): { info: VolumeInfo; matched: boolean } | null {
  if (volumes.length === 0) return null;
  const score = (v: VolumeInfo) => (typeof v.title === "string" ? titleScore(v.title, title) : 0);
  for (const wanted of [2, 1]) {
    const matching = volumes.filter((v) => score(v) === wanted);
    const best = matching.find((v) => v.language === "en") ?? matching[0];
    if (best) return { info: best, matched: true };
  }
  return { info: volumes[0]!, matched: false };
}

/**
 * Books resolver — Google Books API. Query by ISBN, else by title.
 * The keyless endpoint shares one anonymous quota and now answers 429 most of
 * the day, so set GOOGLE_BOOKS_API_KEY to get a per-project quota.
 */
export const resolveBooks: CategoryResolver = async (input) => {
  const isbn = normalizeIsbn(input.structured.isbn) ?? "";
  const title = input.title?.trim() ?? "";
  if (!isbn && !title) return null;

  const author = stringArray(input.structured.authors)?.[0];
  const query = isbn ? `isbn:${isbn}` : author ? `${title} inauthor:"${author}"` : title;
  const url = new URL(SEARCH_BASE);
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", isbn ? "1" : "5");
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY?.trim();
  if (apiKey) url.searchParams.set("key", apiKey);

  try {
    await assertSafeFetchUrl(url);
  } catch {
    return null;
  }

  let picked: { info: VolumeInfo; matched: boolean } | null;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { items?: Array<{ volumeInfo?: VolumeInfo }> };
    const volumes = (body.items ?? []).map((item) => item?.volumeInfo).filter((v): v is VolumeInfo => !!v);
    picked = isbn ? (volumes[0] ? { info: volumes[0], matched: true } : null) : pickVolume(volumes, title);
  } catch {
    return null;
  }
  if (!picked) return null;
  const { info } = picked;

  const structured: Record<string, unknown> = {};
  const authors = stringArray(info.authors);
  if (authors) structured.authors = authors;
  const py = year(info.publishedDate);
  if (py !== null) structured.published_year = py;
  if (typeof info.pageCount === "number" && Number.isInteger(info.pageCount) && info.pageCount > 0) {
    structured.page_count = info.pageCount;
  }

  if (!isbn && picked.matched) {
    const found = volumeIsbn(info);
    if (found) structured.isbn = found;
  }

  if (Object.keys(structured).length === 0) return null;

  const patch: ResolverPatch = { source: "google_books", structured };
  const thumb = info.imageLinks?.thumbnail;
  if (typeof thumb === "string" && thumb) patch.image_url = thumb.replace(/^http:/, "https:");
  return patch;
};
