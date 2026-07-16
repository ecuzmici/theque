/**
 * Google Books description fetch for book recommendation cards (ADR 0015).
 *
 * Fetched per final card only, replacing the LLM-written description with a
 * real synopsis when a confident title match is found. Runs unkeyed on the
 * courtesy quota like the enrichment resolver; GOOGLE_BOOKS_API_KEY raises
 * the quota when set. Fails open (returns null) on any miss or error.
 *
 * Fetches through the B4 SSRF guard (assertSafeFetchUrl).
 */

import "server-only";

import { assertSafeFetchUrl } from "@/lib/enrichment/fetch";
import { normalizeTitle } from "@/lib/recommend/dedup";

const SEARCH_BASE = "https://www.googleapis.com/books/v1/volumes";
const TIMEOUT_MS = 8000;

/** Longest description shown on a card before sentence truncation. */
const DESCRIPTION_MAX_CHARS = 480;

type VolumeInfo = {
  title?: unknown;
  description?: unknown;
};

/** Strip HTML tags and decode the entities Google Books descriptions use. */
export function stripHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Truncate at the last sentence boundary within `max` chars; fall back to a
 * word boundary + ellipsis when no sentence fits.
 */
export function truncateAtSentence(text: string, max: number = DESCRIPTION_MAX_CHARS): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const lastSentenceEnd = Math.max(
    head.lastIndexOf(". "),
    head.lastIndexOf("! "),
    head.lastIndexOf("? "),
  );
  if (lastSentenceEnd > max * 0.4) return head.slice(0, lastSentenceEnd + 1);
  const lastSpace = head.lastIndexOf(" ");
  return `${head.slice(0, lastSpace > 0 ? lastSpace : max).trimEnd()}…`;
}

/**
 * Fetch a real description for a book by title (+ optional author).
 * The returned volume's title must match the candidate title (normalized,
 * inclusion either way) — a fuzzy hit for a different book is worse than
 * keeping the LLM text.
 */
export async function fetchBookDescription(
  title: string,
  author: string | null,
): Promise<string | null> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return null;

  const query = author?.trim()
    ? `intitle:"${trimmedTitle}" inauthor:"${author.trim()}"`
    : `intitle:"${trimmedTitle}"`;

  const url = new URL(SEARCH_BASE);
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", "3");
  url.searchParams.set("fields", "items(volumeInfo(title,description))");
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  if (apiKey) url.searchParams.set("key", apiKey);

  try {
    await assertSafeFetchUrl(url);
  } catch {
    return null;
  }

  let items: Array<{ volumeInfo?: VolumeInfo }>;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { items?: Array<{ volumeInfo?: VolumeInfo }> };
    items = body.items ?? [];
  } catch {
    return null;
  }

  const normCandidate = normalizeTitle(trimmedTitle);
  for (const item of items) {
    const info = item?.volumeInfo;
    if (!info || typeof info.title !== "string" || typeof info.description !== "string") continue;
    const normVolume = normalizeTitle(info.title);
    if (!normVolume || !normCandidate) continue;
    if (normVolume !== normCandidate && !normVolume.includes(normCandidate) && !normCandidate.includes(normVolume)) {
      continue;
    }
    const cleaned = stripHtml(info.description);
    if (cleaned.length < 40) continue; // too short to beat the LLM text
    return truncateAtSentence(cleaned);
  }

  return null;
}
