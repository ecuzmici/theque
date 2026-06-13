/**
 * Whether a URL contains a canonical entity ID that pins it to one specific
 * work/title. When true, the entity is Tier-1 identifiable and phase-1 world
 * knowledge can fill it — so phase-2 grounding is unnecessary.
 */
const ID_PATTERNS: Array<{ host: RegExp; path: RegExp }> = [
  { host: /(^|\.)imdb\.com$/i, path: /\/title\/tt\d+/i },
  { host: /(^|\.)goodreads\.com$/i, path: /\/book\/show\/\d+/i },
  { host: /(^|\.)openlibrary\.org$/i, path: /\/works\/OL\d+W/i },
  { host: /(^|\.)themoviedb\.org$/i, path: /\/(movie|tv)\/\d+/i },
  { host: /(^|\.)letterboxd\.com$/i, path: /\/film\/[^/]+/i },
];

export function hasCanonicalIdInUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;
  return ID_PATTERNS.some((p) => p.host.test(host) && p.path.test(path));
}
