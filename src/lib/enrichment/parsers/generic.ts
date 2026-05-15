import { flattenJsonLd, type JsonLdNode } from "@/lib/jsonld";

function pickTitleFromLd(nodes: JsonLdNode[]): string | undefined {
  for (const n of nodes) {
    const name = n.name;
    if (typeof name === "string" && name.trim()) return name.trim();
    const headline = n.headline;
    if (typeof headline === "string" && headline.trim()) return headline.trim();
  }
  return undefined;
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
  const structured: Record<string, unknown> = {};

  const ogTitle = openGraph["og:title"];
  const ogDesc = openGraph["og:description"];
  const ogImage = openGraph["og:image"];
  const siteName = openGraph["og:site_name"];

  if (siteName) structured.site_name = siteName;

  const twTitle = twitter["twitter:title"];
  const twDesc = twitter["twitter:description"];
  const twImage = twitter["twitter:image"];

  const flattened = jsonLdRoots.flatMap(flattenJsonLd);
  const ldTitle = pickTitleFromLd(flattened);

  const title = ogTitle ?? twTitle ?? ldTitle ?? doc.querySelector("title")?.textContent?.trim();

  const description = ogDesc ?? twDesc ?? undefined;

  let image_url = ogImage ?? twImage;
  if (image_url && image_url.startsWith("//")) {
    image_url = `https:${image_url}`;
  }

  return {
    title,
    subtitle: undefined,
    description,
    image_url,
    structured,
  };
}
