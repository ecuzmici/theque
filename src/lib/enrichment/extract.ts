import { JSDOM, VirtualConsole } from "jsdom";

import type { Json } from "@/lib/database.types";

import { isWeakTitle } from "@/lib/enrichment/meta-utils";
import { parseAmazon } from "@/lib/enrichment/parsers/amazon";
import { parseGoodreads } from "@/lib/enrichment/parsers/goodreads";
import { parseGeneric } from "@/lib/enrichment/parsers/generic";
import { parseImdb } from "@/lib/enrichment/parsers/imdb";

export type RawMetadata = {
  fetched_at: string;
  final_url: string;
  status_code: number;
  open_graph: Record<string, string>;
  twitter: Record<string, string>;
  json_ld: Json;
  parser: string;
};

export type ExtractResult = {
  title: string | null;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  structured: Record<string, unknown>;
  raw_metadata: RawMetadata;
};

const virtualConsole = new VirtualConsole();
virtualConsole.on("error", () => {
  /* JSDOM may log CSS parse errors on large pages; extraction still proceeds */
});

function readMetaMap(doc: Document, propertyPrefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  const nodes = doc.querySelectorAll(`meta[property^="${propertyPrefix}"]`);
  nodes.forEach((el) => {
    const prop = el.getAttribute("property");
    const content = el.getAttribute("content");
    if (prop && content) out[prop] = content;
  });
  return out;
}

function readTwitterCard(doc: Document): Record<string, string> {
  const out: Record<string, string> = {};
  doc.querySelectorAll('meta[name^="twitter:"]').forEach((el) => {
    const name = el.getAttribute("name");
    const content = el.getAttribute("content");
    if (name && content) out[name] = content;
  });
  return out;
}

function parseJsonLdScripts(doc: Document): unknown[] {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  const jsonLd: unknown[] = [];
  scripts.forEach((s) => {
    const text = s.textContent?.trim();
    if (!text) return;
    try {
      jsonLd.push(JSON.parse(text));
    } catch {
      /* ignore malformed blocks */
    }
  });
  return jsonLd;
}

export function extractFromHtml(
  html: string,
  opts: { finalUrl: string; statusCode: number },
): ExtractResult {
  const dom = new JSDOM(html, { virtualConsole });
  const doc = dom.window.document;
  const hostname = new URL(opts.finalUrl).hostname.toLowerCase();

  const open_graph = readMetaMap(doc, "og:");
  const twitter = readTwitterCard(doc);
  const json_ld = parseJsonLdScripts(doc);

  let parser = "generic";
  let structured: Record<string, unknown> = {};

  let title: string | null = null;
  let image_url: string | null = null;

  if (hostname === "imdb.com" || hostname.endsWith(".imdb.com")) {
    const imdb = parseImdb(doc, json_ld, open_graph);
    structured = { ...structured, ...imdb.structured };
    parser = "imdb";
  } else if (hostname === "goodreads.com" || hostname.endsWith(".goodreads.com")) {
    const gr = parseGoodreads(doc, json_ld);
    structured = { ...structured, ...gr.structured };
    parser = "goodreads";
  } else if (hostname === "amazon.com" || hostname.endsWith(".amazon.com")) {
    const amazon = parseAmazon(doc, open_graph);
    structured = { ...structured, ...amazon.structured };
    title = amazon.title ?? null;
    image_url = amazon.image_url ?? null;
    parser = "amazon";
  }

  const generic = parseGeneric(doc, json_ld, open_graph, twitter);

  if (!title) title = generic.title ?? null;
  if (!image_url) image_url = generic.image_url ?? null;
  const description = generic.description ?? null;

  const titleHint =
    typeof structured.title_hint === "string" ? structured.title_hint : undefined;
  const siteName =
    typeof structured.site_name === "string" ? structured.site_name : undefined;
  if (titleHint && isWeakTitle(title, siteName)) {
    title = titleHint;
  }

  const raw_metadata: RawMetadata = {
    fetched_at: new Date().toISOString(),
    final_url: opts.finalUrl,
    status_code: opts.statusCode,
    open_graph,
    twitter,
    json_ld: json_ld as Json,
    parser,
  };

  return {
    title,
    subtitle: generic.subtitle ?? null,
    description,
    image_url,
    structured: { ...generic.structured, ...structured },
    raw_metadata,
  };
}
