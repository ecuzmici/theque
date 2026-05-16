import {
  extractJsonLdStructured,
  flattenAllJsonLd,
  pickImageFromLd,
  pickTitleFromLd,
} from "@/lib/enrichment/parsers/jsonld-fields";
import { isWeakTitle, parseTitleTag } from "@/lib/enrichment/meta-utils";

function readMetaByName(doc: Document, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  doc.querySelectorAll(`meta[name^="${prefix}"]`).forEach((el) => {
    const name = el.getAttribute("name");
    const content = el.getAttribute("content");
    if (name && content) out[name] = content;
  });
  return out;
}

export function parseGeneric(
  doc: Document,
  jsonLdRoots: unknown[],
  openGraph: Record<string, string>,
  twitter: Record<string, string>,
): {
  title?: string;
  subtitle?: string;
  description?: string;
  image_url?: string;
  structured: Record<string, unknown>;
} {
  const flattened = flattenAllJsonLd(jsonLdRoots);
  const schemaStructured = extractJsonLdStructured(flattened);
  const structured: Record<string, unknown> = { ...schemaStructured };

  const ogTitle = openGraph["og:title"];
  const ogDesc = openGraph["og:description"];
  const ogImage = openGraph["og:image"];
  const siteName = openGraph["og:site_name"];

  if (siteName) structured.site_name = siteName;

  const twTitle = twitter["twitter:title"];
  const twDesc = twitter["twitter:description"];
  const twImage = twitter["twitter:image"];
  const itempropImage = doc
    .querySelector('meta[itemprop="image"], link[itemprop="image"]')
    ?.getAttribute("content") ?? doc.querySelector('link[rel~="image_src"]')?.getAttribute("href") ?? undefined;

  const articleMeta = readMetaByName(doc, "article:");
  const ldTitle = pickTitleFromLd(flattened);
  const ldImage = pickImageFromLd(flattened);

  let title = ogTitle ?? twTitle ?? ldTitle ?? doc.querySelector("title")?.textContent?.trim();
  if (title) {
    title = parseTitleTag(title, typeof siteName === "string" ? siteName : undefined) ?? title;
  }
  if (isWeakTitle(title, typeof siteName === "string" ? siteName : undefined)) {
    const hint = structured.title_hint;
    if (typeof hint === "string") title = hint;
  }

  const description = ogDesc ?? twDesc ?? undefined;

  let image_url =
    ogImage ??
    twImage ??
    ldImage ??
    itempropImage ??
    (typeof structured._product_image === "string" ? structured._product_image : undefined);
  delete structured._product_image;
  if (image_url && image_url.startsWith("//")) {
    image_url = `https:${image_url}`;
  }

  if (!structured.author && articleMeta["article:author"]) {
    structured.author = articleMeta["article:author"];
  }
  if (!structured.published_at && articleMeta["article:published_time"]) {
    structured.published_at = articleMeta["article:published_time"];
  }

  return {
    title,
    subtitle: undefined,
    description,
    image_url,
    structured,
  };
}
