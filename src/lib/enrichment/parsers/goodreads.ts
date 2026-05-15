import { flattenJsonLd, typesOf } from "@/lib/jsonld";

function readAggregateRating(node: Record<string, unknown>): {
  rating?: number;
  scale?: number;
  count?: number;
} {
  const ar = node.aggregateRating;
  if (!ar || typeof ar !== "object") return {};
  const o = ar as Record<string, unknown>;
  const ratingValue = o.ratingValue;
  const bestRating = o.bestRating;
  const ratingCount = o.ratingCount;
  return {
    rating: typeof ratingValue === "string" ? Number.parseFloat(ratingValue) : typeof ratingValue === "number" ? ratingValue : undefined,
    scale: typeof bestRating === "string" ? Number.parseFloat(bestRating) : typeof bestRating === "number" ? bestRating : undefined,
    count: typeof ratingCount === "number" ? ratingCount : typeof ratingCount === "string" ? Number.parseInt(ratingCount, 10) : undefined,
  };
}

export function parseGoodreads(
  _doc: Document,
  jsonLdRoots: unknown[],
): { structured: Record<string, unknown> } {
  const structured: Record<string, unknown> = {
    site_name: "Goodreads",
  };

  const nodes = jsonLdRoots.flatMap(flattenJsonLd);

  for (const node of nodes) {
    const types = typesOf(node);
    if (!types.includes("Book")) continue;

    const name = node.name;
    if (typeof name === "string") structured.title_hint = name;

    const author = node.author;
    const authors: string[] = [];
    if (author && typeof author === "object") {
      const a = author as Record<string, unknown>;
      if (typeof a.name === "string") authors.push(a.name);
    }
    if (Array.isArray(author)) {
      for (const a of author) {
        if (a && typeof a === "object" && typeof (a as { name?: unknown }).name === "string") {
          authors.push((a as { name: string }).name);
        }
      }
    }
    if (authors.length) structured.authors = authors;

    const isbn = node.isbn;
    if (typeof isbn === "string") structured.isbn = isbn;

    const datePublished = node.datePublished;
    if (typeof datePublished === "string") {
      const year = Number.parseInt(datePublished.slice(0, 4), 10);
      if (!Number.isNaN(year)) structured.published_year = year;
    }

    const pages = node.numberOfPages;
    if (typeof pages === "number") structured.page_count = pages;
    else if (typeof pages === "string") {
      const n = Number.parseInt(pages, 10);
      if (!Number.isNaN(n)) structured.page_count = n;
    }

    const { rating, scale, count } = readAggregateRating(node);
    if (rating !== undefined) structured.average_rating = rating;
    if (scale !== undefined) structured.rating_scale = scale;
    if (count !== undefined) structured.ratings_count = count;

    break;
  }

  return { structured };
}
