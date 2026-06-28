/**
 * Open Library resolver for book recommendations (F1).
 *
 * Takes an LLM identity candidate (title, creator, year) and returns a
 * resolved canonical URL + cover image, or null if the book can't be
 * verified. No API key required.
 *
 * Fetches through the B4 SSRF guard (assertSafeFetchUrl).
 */

import "server-only";

import { assertSafeFetchUrl } from "@/lib/enrichment/fetch";
import type { LlmCandidate } from "@/lib/recommend/recommend-types";

export type ResolvedBook = {
  canonical_url: string;
  cover_url: string | null;
  confirmed_year: number | null;
  /** Open Library work id (e.g. OL12345W). */
  external_id: string;
  /** Author(s) from the matched Open Library doc — used to display a verified
   * author instead of the LLM's (which can be hallucinated). Null when the
   * matched doc has no author_name. */
  verified_author: string | null;
};

type OpenLibraryDoc = {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
};

type OpenLibrarySearchResponse = {
  docs: OpenLibraryDoc[];
};

const OPEN_LIBRARY_SEARCH = "https://openlibrary.org/search.json";
const TIMEOUT_MS = 8000;

/**
 * Normalize a title for matching:
 * - NFD normalize → strip combining diacritical marks
 * - lowercase
 * - strip punctuation
 * - strip leading articles
 */
export function normalizeTitle(title: string): string {
  const stripped = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.replace(/^(the|a|an)\s+/, "");
}

/**
 * Split a creator/author string into individual tokens.
 * Handles co-author forms like "Arkady and Boris Strugatsky", "Smith, Jones & Lee".
 */
export function splitCreatorTokens(creator: string): string[] {
  return creator
    .split(/[,&]|\band\b/i)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/**
 * Returns true if any token from the candidate creator matches any token
 * from the Open Library author list (substring in either direction).
 */
function authorsOverlap(candidateCreator: string, docAuthors: string[]): boolean {
  const candidateTokens = splitCreatorTokens(candidateCreator);
  const docTokens = docAuthors.map((a) => a.toLowerCase());

  for (const cToken of candidateTokens) {
    for (const dToken of docTokens) {
      if (cToken.includes(dToken) || dToken.includes(cToken)) return true;
      // Also try last-name matching: if cToken appears anywhere in dToken
      const cParts = cToken.split(/\s+/);
      const dParts = dToken.split(/\s+/);
      for (const cp of cParts) {
        if (cp.length >= 3 && dParts.some((dp) => dp.includes(cp) || cp.includes(dp))) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Build a resolved book from an Open Library doc.
 */
function toResolvedBook(doc: OpenLibraryDoc): ResolvedBook {
  const workId = doc.key.replace(/^\/works\//, "");
  return {
    canonical_url: `https://openlibrary.org${doc.key}`,
    cover_url: doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
      : null,
    confirmed_year: doc.first_publish_year ?? null,
    external_id: workId,
    verified_author: doc.author_name?.length ? doc.author_name.join(", ") : null,
  };
}

/**
 * Resolve a book candidate against Open Library.
 *
 * Two-pass tolerant matching:
 * 1. Primary: normalized title equality AND author overlap (handles co-author strings).
 * 2. Fallback: title-only exact match, preferring doc with cover + closest year.
 *
 * Returns null if neither pass finds a match.
 */
export async function resolveBookWithOpenLibrary(
  candidate: Pick<LlmCandidate, "title" | "creator" | "year">,
): Promise<ResolvedBook | null> {
  const params = new URLSearchParams({
    title: candidate.title,
    // Hardcoded to English-language works only (MARC language code "eng").
    // Theque is English-only, and this keeps the resolver from matching a
    // foreign-language edition of the same work.
    language: "eng",
    limit: "5",
    fields: "key,title,author_name,first_publish_year,cover_i",
  });
  if (candidate.creator) {
    params.set("author", candidate.creator);
  }

  const url = new URL(`${OPEN_LIBRARY_SEARCH}?${params.toString()}`);

  try {
    await assertSafeFetchUrl(url);
  } catch {
    return null;
  }

  let raw: OpenLibrarySearchResponse;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    raw = (await res.json()) as OpenLibrarySearchResponse;
  } catch {
    return null;
  }

  const docs = raw.docs ?? [];
  if (docs.length === 0) return null;

  const normCandidateTitle = normalizeTitle(candidate.title);

  // Pass 1: title match AND author overlap
  if (candidate.creator) {
    for (const doc of docs) {
      if (normalizeTitle(doc.title) !== normCandidateTitle) continue;
      if (!doc.author_name?.length) continue;
      if (authorsOverlap(candidate.creator, doc.author_name)) {
        return toResolvedBook(doc);
      }
    }
  }

  // Pass 2: title-only fallback — accept the best title match even without confirmed author.
  // Prefer: has cover_i, then closest first_publish_year to candidate.year.
  const titleMatches = docs.filter(
    (doc) => normalizeTitle(doc.title) === normCandidateTitle,
  );
  if (titleMatches.length === 0) return null;

  const best = titleMatches.sort((a, b) => {
    // Prefer doc with cover
    const aCover = a.cover_i ? 1 : 0;
    const bCover = b.cover_i ? 1 : 0;
    if (bCover !== aCover) return bCover - aCover;
    // Prefer closest year
    if (candidate.year && a.first_publish_year && b.first_publish_year) {
      return (
        Math.abs(a.first_publish_year - candidate.year) -
        Math.abs(b.first_publish_year - candidate.year)
      );
    }
    return 0;
  })[0];

  return toResolvedBook(best);
}
