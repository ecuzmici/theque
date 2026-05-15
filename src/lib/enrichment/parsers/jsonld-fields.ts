import { flattenJsonLd, type JsonLdNode, typesOf } from "@/lib/jsonld";

import { parseIsoDurationMinutes, personNames } from "@/lib/enrichment/meta-utils";

export function extractJsonLdStructured(nodes: JsonLdNode[]): Record<string, unknown> {
  const structured: Record<string, unknown> = {};

  for (const node of nodes) {
    const types = typesOf(node);

    if (types.includes("Recipe")) {
      applyRecipe(node, structured);
      continue;
    }

    if (types.includes("Product")) {
      applyProduct(node, structured);
      continue;
    }

    if (types.some((t) => t === "NewsArticle" || t === "Article" || t === "BlogPosting")) {
      applyArticle(node, structured);
      continue;
    }

    if (
      types.some(
        (t) =>
          t === "LodgingBusiness" ||
          t === "Hotel" ||
          t === "VacationRental" ||
          t === "Accommodation",
      )
    ) {
      applyLodging(node, structured);
    }
  }

  return structured;
}

function applyRecipe(node: JsonLdNode, structured: Record<string, unknown>): void {
  const name = node.name;
  if (typeof name === "string") structured.title_hint = name;

  const author = personNames(node.author);
  if (author.length) structured.author = author[0];

  const prep = parseIsoDurationMinutes(node.prepTime);
  if (prep !== undefined) structured.prep_time_minutes = prep;

  const cook = parseIsoDurationMinutes(node.cookTime);
  if (cook !== undefined) structured.cook_time_minutes = cook;

  const total = parseIsoDurationMinutes(node.totalTime);
  if (total !== undefined && structured.prep_time_minutes === undefined) {
    structured.prep_time_minutes = total;
  }

  const yieldVal = node.recipeYield;
  if (typeof yieldVal === "string") structured.yield = yieldVal;
  else if (Array.isArray(yieldVal) && yieldVal.length) {
    structured.yield = String(yieldVal[yieldVal.length - 1]);
  }

  const rating = node.aggregateRating;
  if (rating && typeof rating === "object") {
    const rv = (rating as { ratingValue?: unknown }).ratingValue;
    if (typeof rv === "string" || typeof rv === "number") {
      structured.rating = Number.parseFloat(String(rv));
      structured.rating_scale = 5;
    }
  }
}

function applyProduct(node: JsonLdNode, structured: Record<string, unknown>): void {
  const name = node.name;
  if (typeof name === "string") structured.title_hint = name;

  const brand = node.brand;
  if (typeof brand === "string") structured.brand = brand;
  else if (brand && typeof brand === "object" && typeof (brand as { name?: unknown }).name === "string") {
    structured.brand = (brand as { name: string }).name;
  }

  const offers = node.offers;
  const offer = Array.isArray(offers) ? offers[0] : offers;
  if (offer && typeof offer === "object") {
    const o = offer as Record<string, unknown>;
    const price = o.price;
    const currency = o.priceCurrency;
    if (price !== undefined && currency !== undefined) {
      structured.price = {
        amount: typeof price === "string" ? Number.parseFloat(price) : price,
        currency,
      };
    }
    if (typeof o.availability === "string") {
      structured.availability = o.availability.replace(/^https?:\/\/schema\.org\//i, "").toLowerCase();
    }
  }

  const image = node.image;
  if (typeof image === "string") structured._product_image = image;
  else if (Array.isArray(image) && typeof image[0] === "string") structured._product_image = image[0];
}

function applyArticle(node: JsonLdNode, structured: Record<string, unknown>): void {
  const headline = node.headline ?? node.name;
  if (typeof headline === "string" && headline.trim()) structured.title_hint = headline.trim();

  const authors = personNames(node.author);
  if (authors.length) structured.author = authors.join(", ");

  const datePublished = node.datePublished;
  if (typeof datePublished === "string") structured.published_at = datePublished;

  const publisher = node.publisher;
  if (publisher && typeof publisher === "object" && typeof (publisher as { name?: unknown }).name === "string") {
    structured.publisher = (publisher as { name: string }).name;
  }
}

function applyLodging(node: JsonLdNode, structured: Record<string, unknown>): void {
  const name = node.name;
  if (typeof name === "string") {
    structured.lodging_name = name;
    structured.title_hint = name;
  }

  const address = node.address;
  if (address && typeof address === "object") {
    const a = address as Record<string, unknown>;
    const parts = [a.streetAddress, a.addressLocality, a.addressRegion, a.addressCountry].filter(
      (x): x is string => typeof x === "string" && x.length > 0,
    );
    if (parts.length) structured.address = parts.join(", ");
  }

  const dest = node.containedInPlace;
  if (dest && typeof dest === "object" && typeof (dest as { name?: unknown }).name === "string") {
    structured.destination = (dest as { name: string }).name;
  }
}

export function pickTitleFromLd(nodes: JsonLdNode[]): string | undefined {
  for (const n of nodes) {
    const types = typesOf(n);
    if (types.includes("Recipe") || types.includes("Product")) {
      const name = n.name;
      if (typeof name === "string" && name.trim()) return name.trim();
    }
    const headline = n.headline ?? n.name;
    if (typeof headline === "string" && headline.trim()) return headline.trim();
  }
  return undefined;
}

export function flattenAllJsonLd(jsonLdRoots: unknown[]): JsonLdNode[] {
  return jsonLdRoots.flatMap(flattenJsonLd);
}
