import { flattenJsonLd, typesOf } from "@/lib/jsonld";

function personNames(val: unknown): string[] {
  if (!val) return [];
  const list = Array.isArray(val) ? val : [val];
  const names: string[] = [];
  for (const entry of list) {
    if (typeof entry === "string") names.push(entry);
    else if (entry && typeof entry === "object" && typeof (entry as { name?: unknown }).name === "string") {
      names.push((entry as { name: string }).name);
    }
  }
  return names;
}

export function parseImdb(
  _doc: Document,
  jsonLdRoots: unknown[],
): { structured: Record<string, unknown> } {
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

    const duration = node.duration;
    if (typeof duration === "string" && duration.startsWith("PT")) {
      const hours = duration.match(/(\d+)H/i);
      const minutes = duration.match(/(\d+)M/i);
      let total = 0;
      if (hours) total += Number.parseInt(hours[1], 10) * 60;
      if (minutes) total += Number.parseInt(minutes[1], 10);
      if (total > 0) structured.runtime_minutes = total;
    }

    structured.media_type = types.includes("TVSeries") ? "tv" : "movie";
    break;
  }

  return { structured };
}
