import { normalizeAmazonTitle } from "@/lib/enrichment/meta-utils";

function metaContent(doc: Document, selector: string): string | undefined {
  const el = doc.querySelector(selector);
  const content = el?.getAttribute("content");
  return content?.trim() || undefined;
}

export function parseAmazon(
  doc: Document,
  openGraph: Record<string, string>,
): {
  title?: string;
  image_url?: string;
  structured: Record<string, unknown>;
} {
  const structured: Record<string, unknown> = {
    site_name: openGraph["og:site_name"] ?? "Amazon",
  };

  const domTitle = doc.querySelector("#productTitle")?.textContent?.trim();
  const ogTitle = openGraph["og:title"];
  const rawTitle = domTitle ?? ogTitle;
  const title = rawTitle ? normalizeAmazonTitle(rawTitle) : undefined;
  if (title) structured.title_hint = title;

  const priceAmount = metaContent(doc, 'meta[property="product:price:amount"]');
  const priceCurrency = metaContent(doc, 'meta[property="product:price:currency"]');
  if (priceAmount && priceCurrency) {
    const amount = Number.parseFloat(priceAmount);
    if (!Number.isNaN(amount)) {
      structured.price = { amount, currency: priceCurrency };
    }
  }

  const brand =
    doc.querySelector("#bylineInfo")?.textContent?.trim() ??
    doc.querySelector('a#bylineInfo')?.textContent?.trim();
  if (brand && !/^visit the/i.test(brand)) {
    structured.brand = brand.replace(/^Brand:\s*/i, "").trim();
  }

  let image_url: string | undefined = openGraph["og:image"];
  if (!image_url) {
    const landing = doc.querySelector<HTMLImageElement>("#landingImage, #imgBlkFront");
    image_url = landing?.getAttribute("src") ?? landing?.getAttribute("data-old-hires") ?? undefined;
  }
  if (image_url?.startsWith("//")) image_url = `https:${image_url}`;

  return { title, image_url, structured };
}
