export type UrlHints = {
  title_hint?: string;
  place_name?: string;
};

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment.replace(/\+/g, " "));
  } catch {
    return segment.replace(/\+/g, " ");
  }
}

function titleFromMapsPlacePath(pathname: string): string | undefined {
  const match = pathname.match(/\/maps\/place\/([^/@]+)/i);
  if (!match) return undefined;
  const raw = decodePathSegment(match[1]);
  const name = raw.split(",")[0]?.trim();
  return name || undefined;
}

function titleFromTripAdvisorPath(pathname: string): string | undefined {
  const match = pathname.match(/Reviews-([^-]+(?:-[^-]+)*)-/i);
  if (!match) return undefined;
  return decodePathSegment(match[1].replace(/_/g, " "));
}

export function hintsFromUrl(finalUrl: string): UrlHints {
  let url: URL;
  try {
    url = new URL(finalUrl);
  } catch {
    return {};
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const hints: UrlHints = {};

  const isGoogleMapsHost =
    host === "google.com" ||
    host.endsWith(".google.com") ||
    host === "maps.google.com";

  if (isGoogleMapsHost && url.pathname.includes("/maps/")) {
    const place = titleFromMapsPlacePath(url.pathname);
    if (place) {
      hints.place_name = place;
      hints.title_hint = place;
    }
  }

  if (host === "tripadvisor.com" || host.endsWith(".tripadvisor.com")) {
    const place = titleFromTripAdvisorPath(url.pathname);
    if (place) {
      hints.place_name = place;
      hints.title_hint = place;
    }
  }

  return hints;
}

export function extractImdbTitleId(url: string): string | null {
  try {
    const match = new URL(url).pathname.match(/\/title\/(tt\d+)/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export type TmdbRef = { mediaType: "movie" | "tv"; id: string };

/** Read the TMDB entity from a themoviedb.org URL, e.g. `/movie/886083-deadstream`. */
export function extractTmdbRef(url: string): TmdbRef | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host !== "themoviedb.org" && !host.endsWith(".themoviedb.org")) return null;
    const match = parsed.pathname.match(/^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?(movie|tv)\/(\d+)/);
    if (!match) return null;
    return { mediaType: match[1] as "movie" | "tv", id: match[2] };
  } catch {
    return null;
  }
}

/** Read the book slug from a hardcover.app URL, e.g. `/books/a-fire-upon-the-deep`. */
export function extractHardcoverSlug(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host !== "hardcover.app" && !host.endsWith(".hardcover.app")) return null;
    const match = parsed.pathname.match(/^\/books\/([a-z0-9-]+)/i);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}
