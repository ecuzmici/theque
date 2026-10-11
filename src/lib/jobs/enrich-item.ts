import "server-only";

import { captureCategoryHintFromStructured } from "@/lib/capture/category-hint";
import type { CategorySource, ItemCategory, ItemStatus, Json } from "@/lib/database.types";
import { classify } from "@/lib/classify/index";
import { applyEnrichmentFallbacks } from "@/lib/enrichment/apply-fallbacks";
import { extractFromHtml } from "@/lib/enrichment/extract";
import { fetchPage } from "@/lib/enrichment/fetch";
import { fetchViaJinaReader } from "@/lib/enrichment/jina-reader";
import { enrichOpenLibraryWork } from "@/lib/enrichment/openlibrary";
import { cacheItemImage, extractDominantColorForUrl } from "@/lib/enrichment/image-cache";
import { decideLlmEligibility } from "@/lib/enrichment/llm/eligibility";
import { enhanceCategoryWithGemini } from "@/lib/enrichment/llm/gemini-category-enhancer";
import { isEnrichmentLlmConfigured } from "@/lib/enrichment/llm/llm-config";
import { extractPageText } from "@/lib/enrichment/page-text";
import { readCaptureSnapshot, snapshotToFetchResult } from "@/lib/enrichment/snapshot-adapter";
import { mergeLlmEnrichment } from "@/lib/enrichment/llm/merge-llm-enrichment";
import { isBotBlockPage, isGeneratedShareCard, isWeakTitle } from "@/lib/enrichment/meta-utils";
import { resolveCategoryEvidence } from "@/lib/enrichment/resolvers/index";
import { chooseSubtitle } from "@/lib/enrichment/subtitle";
import { aiDailyLimitForUser } from "@/lib/ai/limits";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_ENRICH_LLM_DAILY_LIMIT = 100;

function enrichLlmDailyLimit(): number {
  const parsed = Number.parseInt(process.env.ENRICH_LLM_DAILY_LIMIT ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ENRICH_LLM_DAILY_LIMIT;
}

export type EnrichOutcome = "ready" | "pending_retry" | "failed" | "skipped";

function stripExtractHints(structured: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...structured };
  delete rest.title_hint;
  return rest;
}

function hasUsefulValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

// `series` counts as important for books. The Kobo displays a series name, and
// the EPUB upload path writes it into the file. Only Hardcover supplies it, so
// a book without it must still reach the resolvers.
const RESOLVER_IMPORTANT_FIELDS: Partial<Record<ItemCategory, string[]>> = {
  movies_and_tv: ["year", "directors"],
  books: ["authors", "published_year", "series"],
};

function resolverFieldsSparse(
  category: ItemCategory | null,
  structured: Record<string, unknown>,
): boolean {
  if (!category) return false;
  const fields = RESOLVER_IMPORTANT_FIELDS[category];
  if (!fields) return false;
  const filled = fields.filter((f) => hasUsefulValue(structured[f])).length;
  return filled < fields.length;
}

function hasSparseFetchEvidence(input: {
  title: string | null;
  description: string | null;
  image_url: string | null;
  structured: Record<string, unknown>;
}): boolean {
  return (
    isWeakTitle(input.title) &&
    !input.description?.trim() &&
    !input.image_url?.trim() &&
    !Object.values(input.structured).some(hasUsefulValue)
  );
}

function defaultCardAspect(category: ItemCategory | null): string {
  if (!category) return "16/9";
  const map: Record<ItemCategory, string> = {
    books: "2/3",
    movies_and_tv: "2/3",
    restaurants: "16/9",
    products: "1/1",
    travel: "16/9",
    recipes: "16/9",
    articles: "16/9",
  };
  return map[category];
}

function mergeDisplay(existing: Json, category: ItemCategory | null): Record<string, unknown> {
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
    // Open Library work pages keep their JSON-API path (clean English title);
    // otherwise a capture snapshot (rendered, logged-in, bot-check-passed DOM
    // from the extension) beats a server fetch of the same URL.
    const openLibrary = await enrichOpenLibraryWork(row.canonical_url);
    const snapshot = openLibrary ? null : readCaptureSnapshot(row.raw_metadata);

    const fetchResult = openLibrary
      ? openLibrary.fetchResult
      : snapshot
        ? snapshotToFetchResult(snapshot, row.canonical_url)
        : await fetchPage(row.canonical_url);

    const extracted = openLibrary
      ? openLibrary.extracted
      : await applyEnrichmentFallbacks(
          fetchResult,
          extractFromHtml(fetchResult.html, {
            finalUrl: fetchResult.finalUrl,
            statusCode: fetchResult.statusCode,
          }),
          { requestUrl: row.canonical_url },
        );

    let jinaResult: Awaited<ReturnType<typeof fetchViaJinaReader>> = null;
    let pageText = snapshot?.text ?? (openLibrary ? null : extractPageText(fetchResult.html));
    // Phase 2: when a server fetch was blocked/empty and there's no snapshot,
    // try the Jina Reader readability proxy (opt-in, fail-open).
    if (!snapshot && !openLibrary) {
      const blockedOrEmpty = isBotBlockPage(fetchResult.html, fetchResult.statusCode) || !pageText;
      if (blockedOrEmpty) {
        jinaResult = await fetchViaJinaReader(row.canonical_url);
        if (jinaResult) pageText = jinaResult.markdown;
      }
    }

    const urlObj = new URL(fetchResult.finalUrl);
    const preserveManual = row.category_source === "manual" && row.category !== null;
    // Transient capture input: `capture_category_hint` is read once for `classify()` and is not
    // merged into the final `structured` written below—keeping internal capture metadata out of
    // user-facing structured fields. Preserving it in DB `structured` would require hiding it in
    // the item UI (out of scope here).
    const categoryHint = preserveManual ? null : captureCategoryHintFromStructured(row.structured);

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
          categoryHint,
        });

    const titleHint =
      typeof extracted.structured.title_hint === "string"
        ? extracted.structured.title_hint
        : null;
    const structuredClean = stripExtractHints(extracted.structured) as Record<string, unknown>;
    let mergedStructured = { ...structuredClean };
    let mergedRawMetadata: Record<string, unknown> = {
      ...(extracted.raw_metadata as unknown as Record<string, unknown>),
      ...(snapshot
        ? { capture_snapshot: snapshot, evidence_source: "capture_snapshot" }
        : { evidence_source: jinaResult ? "jina_reader" : openLibrary ? "open_library" : "server_fetch" }),
      ...(jinaResult ? { jina: { used: true } } : {}),
    };
    let mergedTitle = extracted.title?.trim() || null;
    if (jinaResult?.title && isWeakTitle(mergedTitle)) {
      mergedTitle = jinaResult.title;
    }
    let mergedSubtitle = extracted.subtitle ?? null;
    let mergedDescription = extracted.description ?? row.description;
    // A generated share card is not a cover. Drop it so the resolvers supply one.
    const coverOrNull = (url: string | null) => (isGeneratedShareCard(url) ? null : url);
    let mergedImageUrl = coverOrNull(extracted.image_url) ?? coverOrNull(row.image_url);
    let mergedCategory = classification.category;
    let mergedCategoryConfidence = classification.category_confidence;
    let mergedCategorySource = classification.category_source;

    // Phase 3: free deterministic API resolvers. Only when important fields are
    // still sparse or the cover is missing; fills missing fields and ranks above
    // any later LLM merge.
    if (resolverFieldsSparse(mergedCategory, mergedStructured) || !mergedImageUrl) {
      const patch = await resolveCategoryEvidence(mergedCategory, {
        canonicalUrl: fetchResult.finalUrl,
        title: isWeakTitle(mergedTitle) ? (titleHint?.trim() || mergedTitle) : mergedTitle,
        structured: mergedStructured,
      });
      if (patch) {
        if (patch.structured) {
          for (const [key, value] of Object.entries(patch.structured)) {
            if (value !== undefined && value !== null && !hasUsefulValue(mergedStructured[key])) {
              mergedStructured[key] = value;
            }
          }
        }
        if (patch.title && isWeakTitle(mergedTitle)) mergedTitle = patch.title;
        if (patch.description && !mergedDescription?.trim()) mergedDescription = patch.description;
        if (patch.image_url && !mergedImageUrl) mergedImageUrl = patch.image_url;
        mergedRawMetadata = {
          ...mergedRawMetadata,
          resolver: { source: patch.source, fields: Object.keys(patch.structured ?? {}) },
        };
      }
    }

    const fetchBlocked = snapshot ? false : isBotBlockPage(fetchResult.html, fetchResult.statusCode);
    const fetchSparse = hasSparseFetchEvidence({
      title: mergedTitle,
      description: mergedDescription,
      image_url: mergedImageUrl,
      structured: mergedStructured,
    });

    const llmEligibility = decideLlmEligibility({
      enabled: process.env.LLM_ENRICHMENT_ENABLED === "true",
      hasApiKey: isEnrichmentLlmConfigured(),
      fetchBlocked,
      fetchSparse,
      category: mergedCategory,
      categorySource: classification.category_source,
      title: mergedTitle,
      description: mergedDescription,
      image_url: mergedImageUrl,
      structured: mergedStructured,
      groundingEnabled: process.env.LLM_GROUNDING_ENABLED === "true",
      canonicalUrl: fetchResult.finalUrl,
    });

    // Daily backstop per user. Background enrichment runs without a person at
    // the keyboard, so a capture loop could otherwise spend the AI budget.
    const llmWithinCap =
      llmEligibility.eligible &&
      (
        await rateLimit(
          `llm-enrich:${row.user_id}`,
          aiDailyLimitForUser(row.user_id, enrichLlmDailyLimit()),
          86400,
        )
      ).ok;
    if (llmEligibility.eligible && !llmWithinCap) {
      mergedRawMetadata = { ...mergedRawMetadata, llm_skipped: "daily_cap" };
    }

    if (llmWithinCap) {
      const llmResult = await enhanceCategoryWithGemini({
        finalUrl: fetchResult.finalUrl,
        category: mergedCategory,
        categorySuggestionAllowed: llmEligibility.categorySuggestionAllowed,
        categorySuggestionReason: llmEligibility.categorySuggestionReason,
        title: mergedTitle,
        subtitle: mergedSubtitle,
        description: mergedDescription,
        image_url: mergedImageUrl,
        structured: mergedStructured,
        rawMetadata: extracted.raw_metadata,
        pageText,
        groundingRecommended: llmEligibility.eligible ? llmEligibility.groundingRecommended : false,
      });

      const merged = mergeLlmEnrichment({
        current: {
          title: mergedTitle,
          subtitle: mergedSubtitle,
          description: mergedDescription,
          image_url: mergedImageUrl,
          category: mergedCategory,
          category_confidence: mergedCategoryConfidence,
          category_source: mergedCategorySource,
          structured: mergedStructured,
          rawMetadata: mergedRawMetadata,
        },
        categorySuggestionAllowed: llmEligibility.categorySuggestionAllowed,
        categorySuggestionReason: llmEligibility.categorySuggestionReason,
        llmResult,
        now: new Date().toISOString(),
      });

      mergedTitle = merged.title;
      mergedSubtitle = merged.subtitle;
      mergedDescription = merged.description;
      mergedImageUrl = merged.image_url;
      mergedStructured = merged.structured;
      mergedRawMetadata = merged.rawMetadata;
      mergedCategory = merged.category;
      mergedCategoryConfidence = merged.category_confidence;
      mergedCategorySource = merged.category_source;
    }

    // The page shows the cached copy first (`getDisplayImageUrl`), so a new
    // image URL must replace the cached copy, or the old cover stays visible.
    const imageUrlChanged = !!mergedImageUrl && mergedImageUrl !== row.image_url;
    const cachedImage = !mergedImageUrl
      ? null
      : !row.image_storage_path || imageUrlChanged
        ? await cacheItemImage(admin, row.user_id, itemId, mergedImageUrl)
        : !row.dominant_color
          ? await extractDominantColorForUrl(mergedImageUrl)
          : null;
    const imageStoragePath = cachedImage?.storagePath ?? row.image_storage_path ?? null;

    const subtitle = chooseSubtitle(mergedCategory, mergedStructured, mergedSubtitle);

    const siteForTitle =
      typeof mergedStructured.site_name === "string" ? mergedStructured.site_name : undefined;
    let title = mergedTitle;
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
      mergedCategoryConfidence >= 0.6 ? "want" : "inbox";

    const display = mergeDisplay(row.display, mergedCategory);

    const enrichmentError =
      fetchBlocked && !title?.trim() ? "fetch_blocked_or_sparse" : null;

    await admin
      .from("items")
      .update({
        title,
        subtitle,
        description: mergedDescription,
        image_url: mergedImageUrl,
        image_storage_path: imageStoragePath,
        dominant_color: cachedImage?.dominantColor ?? row.dominant_color ?? null,
        dominant_hue: cachedImage?.dominantHue ?? row.dominant_hue ?? null,
        category: mergedCategory,
        category_confidence: mergedCategoryConfidence,
        category_source: mergedCategorySource,
        status:
          row.status === "inbox" && mergedCategorySource !== "manual" ? nextStatus : row.status,
        structured: mergedStructured as Json,
        raw_metadata: mergedRawMetadata as Json,
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
