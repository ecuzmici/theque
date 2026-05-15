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
]);

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

  return canonical.toString();
}
