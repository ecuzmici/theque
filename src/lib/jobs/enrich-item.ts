import "server-only";

import type { CategorySource, ItemCategory, ItemStatus, Json } from "@/lib/database.types";
import { classify } from "@/lib/classify/index";
import { applyEnrichmentFallbacks } from "@/lib/enrichment/apply-fallbacks";
import { extractFromHtml } from "@/lib/enrichment/extract";
import { fetchPage } from "@/lib/enrichment/fetch";
import { isBotBlockPage, isWeakTitle } from "@/lib/enrichment/meta-utils";
import { createAdminClient } from "@/lib/supabase/admin";

export type EnrichOutcome = "ready" | "pending_retry" | "failed" | "skipped";

function stripExtractHints(structured: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...structured };
  delete rest.title_hint;
  return rest;
}

function buildSubtitle(category: ItemCategory, structured: Record<string, unknown>): string | null {
  switch (category) {
    case "movies_and_tv": {
      const directors = structured.directors as string[] | undefined;
      const year = structured.year as number | undefined;
      const d = directors?.[0];
      if (d && year !== undefined) return `${d} · ${year}`;
      if (d) return d;
      if (year !== undefined) return String(year);
      return null;
    }
    case "books": {
      const authors = structured.authors as string[] | undefined;
      const py = structured.published_year as number | undefined;
      const a = authors?.[0];
      if (a && py !== undefined) return `${a} · ${py}`;
      if (a) return a;
      if (py !== undefined) return String(py);
      return null;
    }
    default:
      return null;
  }
}

function defaultCardAspect(category: ItemCategory): string {
  const map: Record<ItemCategory, string> = {
    books: "2/3",
    movies_and_tv: "2/3",
    restaurants: "16/9",
    products: "1/1",
    gifts: "1/1",
    travel: "16/9",
    recipes: "16/9",
    articles: "16/9",
  };
  return map[category];
}

function mergeDisplay(existing: Json, category: ItemCategory): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  if (base.card_aspect === undefined || base.card_aspect === null || base.card_aspect === "") {
    base.card_aspect = defaultCardAspect(category);
  }
  return base;
}

export async function enrichItem(itemId: string): Promise<EnrichOutcome> {
  const admin = createAdminClient();

  const { data: row, error: loadErr } = await admin.from("items").select("*").eq("id", itemId).maybeSingle();
  if (loadErr || !row) return "skipped";

  if (row.processing_status === "failed" && row.enrichment_attempts >= 3) return "skipped";
  if (row.processing_status === "ready") return "skipped";

  await admin.from("items").update({ processing_status: "processing" }).eq("id", itemId);

  try {
    const fetchResult = await fetchPage(row.canonical_url);
    const extracted = await applyEnrichmentFallbacks(
      fetchResult,
      extractFromHtml(fetchResult.html, {
        finalUrl: fetchResult.finalUrl,
        statusCode: fetchResult.statusCode,
      }),
      { requestUrl: row.canonical_url },
    );

    const urlObj = new URL(fetchResult.finalUrl);
    const preserveManual = row.category_source === "manual" && row.category !== null;

    const classification = preserveManual
      ? {
          category: row.category as ItemCategory,
          category_confidence: row.category_confidence ?? 1,
          category_source: "manual" as CategorySource,
        }
      : classify({
          domain: urlObj.hostname,
          pathname: urlObj.pathname,
          jsonLd: extracted.raw_metadata.json_ld as unknown[],
        });

    const titleHint =
      typeof extracted.structured.title_hint === "string"
        ? extracted.structured.title_hint
        : null;
    const structuredClean = stripExtractHints(extracted.structured) as Record<string, unknown>;
    const mergedStructured = { ...structuredClean };
    const subtitle =
      extracted.subtitle ?? buildSubtitle(classification.category, mergedStructured);

    const siteForTitle =
      typeof mergedStructured.site_name === "string" ? mergedStructured.site_name : undefined;
    let title = extracted.title?.trim() || null;
    if (isWeakTitle(title, siteForTitle)) {
      title = titleHint?.trim() || null;
    }
    if (isWeakTitle(title, siteForTitle)) {
      const placeName =
        typeof mergedStructured.place_name === "string" ? mergedStructured.place_name : null;
      if (placeName) title = placeName;
    }
    if (!title?.trim()) {
      title = row.title?.trim() || null;
    }

    const nextStatus: ItemStatus =
      classification.category_confidence >= 0.6 ? "want" : "inbox";

    const display = mergeDisplay(row.display, classification.category);

    const fetchBlocked = isBotBlockPage(fetchResult.html, fetchResult.statusCode);
    const enrichmentError =
      fetchBlocked && !title?.trim() ? "fetch_blocked_or_sparse" : null;

    await admin
      .from("items")
      .update({
        title,
        subtitle,
        description: extracted.description ?? row.description,
        image_url: extracted.image_url ?? row.image_url,
        category: classification.category,
        category_confidence: classification.category_confidence,
        category_source: classification.category_source,
        status: preserveManual ? row.status : nextStatus,
        structured: mergedStructured as Json,
        raw_metadata: extracted.raw_metadata as unknown as Json,
        display: display as Json,
        processing_status: "ready",
        enrichment_error: enrichmentError,
        enriched_at: new Date().toISOString(),
      })
      .eq("id", itemId);

    return "ready";
  } catch (err) {
    const message = err instanceof Error ? err.message : "enrichment_failed";
    const attempts = row.enrichment_attempts + 1;
    const terminal = attempts >= 3;

    await admin
      .from("items")
      .update({
        enrichment_attempts: attempts,
        enrichment_error: message,
        processing_status: terminal ? "failed" : "pending",
      })
      .eq("id", itemId);

    return terminal ? "failed" : "pending_retry";
  }
}
