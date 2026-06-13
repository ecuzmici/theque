import "server-only";

import { assertSafeFetchUrl } from "@/lib/enrichment/fetch";
import type { CategoryResolver, ResolverPatch } from "@/lib/enrichment/resolvers/types";

const SEARCH_BASE = "https://www.googleapis.com/books/v1/volumes";
const TIMEOUT_MS = 8000;

type VolumeInfo = {
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

/** Books resolver — Google Books API (no key). Query by ISBN, else by title. */
export const resolveBooks: CategoryResolver = async (input) => {
  const isbn = typeof input.structured.isbn === "string" ? input.structured.isbn.trim() : "";
  const title = input.title?.trim() ?? "";
  if (!isbn && !title) return null;

  const query = isbn ? `isbn:${isbn}` : title;
  const url = new URL(SEARCH_BASE);
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", "1");

  try {
    await assertSafeFetchUrl(url);
  } catch {
    return null;
  }

  let info: VolumeInfo | undefined;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { items?: Array<{ volumeInfo?: VolumeInfo }> };
    info = body.items?.[0]?.volumeInfo;
  } catch {
    return null;
  }
  if (!info) return null;

  const structured: Record<string, unknown> = {};
  const authors = stringArray(info.authors);
  if (authors) structured.authors = authors;
  const py = year(info.publishedDate);
  if (py !== null) structured.published_year = py;
  if (typeof info.pageCount === "number" && Number.isInteger(info.pageCount) && info.pageCount > 0) {
    structured.page_count = info.pageCount;
  }

  if (Object.keys(structured).length === 0) return null;

  const patch: ResolverPatch = { source: "google_books", structured };
  const thumb = info.imageLinks?.thumbnail;
  if (typeof thumb === "string" && thumb) patch.image_url = thumb.replace(/^http:/, "https:");
  return patch;
};
