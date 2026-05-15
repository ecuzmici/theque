import type { ExtractResult } from "@/lib/enrichment/extract";
import type { FetchPageResult } from "@/lib/enrichment/fetch";
import {
  fetchImdbFromSuggestionApi,
  imdbSuggestionToStructured,
} from "@/lib/enrichment/fallbacks/imdb";
import { isBotBlockPage, isErrorPageTitle, isWeakTitle } from "@/lib/enrichment/meta-utils";
import { extractImdbTitleId, hintsFromUrl, type UrlHints } from "@/lib/enrichment/url-hints";

export type ApplyFallbacksOptions = {
  /** Original request URL (e.g. item canonical_url) before redirects. */
  requestUrl?: string;
};

function mergeStructured(
  base: Record<string, unknown>,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined || value === null) continue;
    if (out[key] === undefined) out[key] = value;
  }
  return out;
}

function mergeUrlHints(...urls: (string | undefined)[]): UrlHints {
  const merged: UrlHints = {};
  for (const url of urls) {
    if (!url) continue;
    const hints = hintsFromUrl(url);
    if (hints.place_name) merged.place_name = hints.place_name;
    if (hints.title_hint) merged.title_hint = hints.title_hint;
  }
  return merged;
}

function resolveTitle(
  title: string | null,
  structured: Record<string, unknown>,
  urlHints: UrlHints,
): string | null {
  const siteName = typeof structured.site_name === "string" ? structured.site_name : undefined;
  const titleHint =
    typeof structured.title_hint === "string"
      ? structured.title_hint
      : urlHints.title_hint ?? null;

  if (isErrorPageTitle(title)) title = null;
  if (isWeakTitle(title, siteName) && titleHint) return titleHint;
  if (!title?.trim() && titleHint) return titleHint;
  return title?.trim() || null;
}

function imdbNeedsSuggestionApi(
  title: string | null,
  structured: Record<string, unknown>,
  fetchResult: FetchPageResult,
): boolean {
  const siteName = typeof structured.site_name === "string" ? structured.site_name : "IMDb";
  if (isBotBlockPage(fetchResult.html, fetchResult.statusCode)) return true;
  if (isWeakTitle(title, siteName)) return true;
  if (typeof structured.title_hint !== "string") return true;
  if (structured.year === undefined) return true;
  return false;
}

export async function applyEnrichmentFallbacks(
  fetchResult: FetchPageResult,
  extracted: ExtractResult,
  opts?: ApplyFallbacksOptions,
): Promise<ExtractResult> {
  const hostname = new URL(fetchResult.finalUrl).hostname.toLowerCase();
  const urlHints = mergeUrlHints(opts?.requestUrl, fetchResult.finalUrl);
  let structured = mergeStructured(extracted.structured, {
    ...(urlHints.place_name ? { place_name: urlHints.place_name } : {}),
    ...(urlHints.title_hint && !extracted.structured.title_hint
      ? { title_hint: urlHints.title_hint }
      : {}),
  });

  let title = extracted.title;
  let image_url = extracted.image_url;

  const imdbHost = hostname === "imdb.com" || hostname.endsWith(".imdb.com");
  if (imdbHost && imdbNeedsSuggestionApi(title, structured, fetchResult)) {
    const ttId =
      extractImdbTitleId(fetchResult.finalUrl) ??
      (opts?.requestUrl ? extractImdbTitleId(opts.requestUrl) : null);
    if (ttId) {
      const suggestion = await fetchImdbFromSuggestionApi(ttId);
      if (suggestion) {
        structured = { ...structured, ...imdbSuggestionToStructured(suggestion) };
        if (!image_url && suggestion.image_url) image_url = suggestion.image_url;
      }
    }
  }

  title = resolveTitle(title, structured, urlHints);

  return {
    ...extracted,
    title,
    image_url,
    structured,
  };
}
