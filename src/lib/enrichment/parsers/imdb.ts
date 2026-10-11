import { flattenJsonLd, typesOf } from "@/lib/jsonld";

import { parseImdbTitle, parseIsoDurationMinutes, personNames } from "@/lib/enrichment/meta-utils";

export function parseImdb(
  doc: Document,
  jsonLdRoots: unknown[],
  openGraph: Record<string, string>,
): { title?: string; structured: Record<string, unknown> } {
  const structured: Record<string, unknown> = {
    site_name: "IMDb",
  };

  const nodes = jsonLdRoots.flatMap(flattenJsonLd);

  for (const node of nodes) {
    const types = typesOf(node);
    const isMovie = types.some((t) => t === "Movie" || t === "TVSeries" || t === "TVEpisode");
    if (!isMovie) continue;

    structured.original_type = types.find((t) => t === "Movie" || t === "TVSeries") ?? "Movie";

    const name = node.name;
    if (typeof name === "string") structured.title_hint = name;

    const datePublished = node.datePublished;
    if (typeof datePublished === "string") {
      const year = Number.parseInt(datePublished.slice(0, 4), 10);
      if (!Number.isNaN(year)) structured.year = year;
    }

    const directors = personNames(node.director);
    if (directors.length) structured.directors = directors;

    const genre = node.genre;
    if (typeof genre === "string") structured.genres = [genre];
    else if (Array.isArray(genre)) structured.genres = genre.filter((g): g is string => typeof g === "string");

    const runtime = parseIsoDurationMinutes(node.duration);
    if (runtime !== undefined) structured.runtime_minutes = runtime;

    structured.media_type = types.includes("TVSeries") ? "tv" : "movie";
    break;
  }

  // No JSON-LD name: clean the page title. It can carry the year, the rating
  // and the genres, and those must not reach the item title.
  if (!structured.title_hint) {
    const parts =
      parseImdbTitle(openGraph["og:title"]) ??
      parseImdbTitle(doc.querySelector("title")?.textContent ?? undefined);
    if (parts) {
      structured.title_hint = parts.title;
      if (structured.year === undefined && parts.year !== undefined) structured.year = parts.year;
      if (structured.genres === undefined && parts.genres) structured.genres = parts.genres;
    }
  }

  const title = typeof structured.title_hint === "string" ? structured.title_hint : undefined;
  return { ...(title ? { title } : {}), structured };
}
