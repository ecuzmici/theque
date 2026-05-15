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
