/**
 * Normalize URLs for deduplication and stable fingerprints.
 */

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "fbclid",
  "gclid",
  "mc_eid",
  "msclkid",
  "_ga",
  "ref",
  "source",
  "ref_",
  "igshid",
  "mc_cid",
  "_hsenc",
  "_hsmi",
  "ttclid",
  "twclid",
  "li_fat_id",
  "srsltid",
  "gbraid",
  "wbraid",
  "yclid",
  "dclid",
  "mkt_tok",
]);

function hostIs(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/**
 * Host rules for sites whose entity pages carry search and tracking
 * parameters (IMDb `ref_`, Goodreads `from_search`, Amazon `crid`). The same
 * title saved from two pages must get one fingerprint, so these rules drop
 * the query or rebuild the URL from the entity id.
 */
function applyHostRules(url: URL): URL {
  const host = url.hostname;
  const path = url.pathname;

  if (/(^|\.)amazon\.[a-z.]+$/.test(host)) {
    const asin = path.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i)?.[1];
    if (asin) return new URL(`https://${host}/dp/${asin.toUpperCase()}`);
    return url;
  }

  const dropQuery =
    (hostIs(host, "imdb.com") && /^\/title\/tt\d+/.test(path)) ||
    (hostIs(host, "goodreads.com") && path.startsWith("/book/show/")) ||
    (hostIs(host, "themoviedb.org") && /^\/(movie|tv)\//.test(path)) ||
    (hostIs(host, "letterboxd.com") && path.startsWith("/film/")) ||
    (hostIs(host, "openlibrary.org") && /^\/(works|books)\//.test(path));
  if (dropQuery) {
    url.search = "";
    return url;
  }

  // `si` is a share id on YouTube and Spotify. On other hosts it can carry meaning.
  if (hostIs(host, "youtube.com") || hostIs(host, "spotify.com")) {
    url.searchParams.delete("si");
  }
  return url;
}

function stripTrackingSearchParams(searchParams: URLSearchParams): void {
  for (const key of [...searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (lower.startsWith("utm_") || TRACKING_PARAMS.has(lower)) {
      searchParams.delete(key);
    }
  }
}

/**
 * Resolve short hosts that should expand for canonical comparison (PoC stub).
 */
export function resolveKnownShortHosts(url: URL): URL {
  if (url.hostname === "youtu.be") {
    const id = url.pathname.replace(/^\//, "").split("/")[0];
    if (id) {
      const expanded = new URL("https://www.youtube.com/watch");
      expanded.searchParams.set("v", id);
      return expanded;
    }
  }
  return url;
}

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("invalid_url");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("invalid_url");
  }

  parsed.hostname = parsed.hostname.toLowerCase();

  const canonical = resolveKnownShortHosts(parsed);

  canonical.protocol = "https:";
  stripTrackingSearchParams(canonical.searchParams);
  canonical.searchParams.sort();

  canonical.hash = "";

  let path = canonical.pathname;
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  canonical.pathname = path || "/";

  return applyHostRules(canonical).toString();
}
