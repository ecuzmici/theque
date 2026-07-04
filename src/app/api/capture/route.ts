import { after } from "next/server";

import { parseCaptureCategoryHint } from "@/lib/capture/category-hint";
import { parseCaptureSnapshot } from "@/lib/capture/capture-snapshot";
import type { Database, ItemSource, Json } from "@/lib/database.types";
import {
  lookupCaptureTokenUser,
  parseBearerToken,
} from "@/lib/auth/capture-token";
import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { decryptItemFields, encryptField } from "@/lib/crypto/field-crypto";
import type { CaptureItemPayload, CaptureRequestBody, CaptureResponseBody } from "@/lib/types/api";
import {
  hasMaxLength,
  MAX_NOTE_LENGTH,
  MAX_URL_LENGTH,
} from "@/lib/input-limits";
import { wouldBenefitFromLlmReenrichment } from "@/lib/enrichment/llm/eligibility";
import { enrichItem } from "@/lib/jobs/enrich-item";
import { rateLimit } from "@/lib/rate-limit";
import { checkQuota, MAX_ITEMS_PER_USER } from "@/lib/quotas";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fingerprint } from "@/lib/url/fingerprint";
import { domainFromCanonicalUrl } from "@/lib/url/domain";
import { normalizeUrl } from "@/lib/url/normalize";

const SOURCES = new Set<ItemSource>([
  "chrome_extension",
  "ios_shortcut",
  "manual",
  "mobile_share_extension",
]);

function jsonResponse(body: unknown, init?: ResponseInit) {
  return Response.json(body, init);
}

// Only non-null, non-empty strings are ciphertext candidates — mirrors
// `decryptField`'s passthrough for `null`/`""` (never store `enc.` of an
// empty string; see ADR 0013).
function encryptIfPresent(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  return encryptField(value);
}

export async function POST(req: Request) {
  let bodyUnknown: unknown;
  try {
    bodyUnknown = await req.json();
  } catch {
    return jsonResponse({ code: "invalid_body" }, { status: 400 });
  }

  const body = bodyUnknown as CaptureRequestBody;

  if (!body?.url || typeof body.url !== "string") {
    return jsonResponse({ code: "invalid_url" }, { status: 400 });
  }

  if (!hasMaxLength(body.url, MAX_URL_LENGTH)) {
    return jsonResponse({ code: "invalid_url" }, { status: 400 });
  }

  if (!body.source || !SOURCES.has(body.source)) {
    return jsonResponse({ code: "invalid_source" }, { status: 400 });
  }

  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== "string" || !hasMaxLength(body.note, MAX_NOTE_LENGTH)) {
      return jsonResponse({ code: "invalid_note" }, { status: 400 });
    }
  }

  // Legacy extension fields — accepted and ignored for Web Store 1.0.0 compatibility.
  void body.tag_names;
  void body.collection_ids;

  const captureSnapshot =
    body.capture_snapshot !== undefined ? parseCaptureSnapshot(body.capture_snapshot) : null;

  let canonical: string;
  try {
    canonical = normalizeUrl(body.url);
  } catch {
    return jsonResponse({ code: "invalid_url" }, { status: 400 });
  }

  const fp = fingerprint(canonical);
  const domain = domainFromCanonicalUrl(canonical);

  const bearer = parseBearerToken(req.headers.get("authorization"));
  let userId: string | null = null;
  let clientMode: "session" | "token" = "session";

  if (bearer?.startsWith("bmly_")) {
    const tokenUser = await lookupCaptureTokenUser(bearer);
    userId = tokenUser?.userId ?? null;
    clientMode = "token";
  } else {
    const user = await getSessionUserOrNull();
    userId = user?.id ?? null;
  }

  if (!userId) {
    return jsonResponse({ code: "unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`capture:${userId}`, 60, 60);
  if (!rl.ok) {
    return jsonResponse(
      { code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 60) } },
    );
  }

  const admin = createAdminClient();
  const userClient = clientMode === "session" ? await createClient() : null;
  const db = clientMode === "session" && userClient ? userClient : admin;

  const { data: existing } = await db
    .from("items")
    .select("*")
    .eq("user_id", userId)
    .eq("url_fingerprint", fp)
    .maybeSingle();

  if (existing) {
    // A fresh snapshot is better evidence than whatever the original capture
    // had — store it, and re-run enrichment when the item never got good data.
    if (captureSnapshot) {
      const existingRaw =
        existing.raw_metadata &&
        typeof existing.raw_metadata === "object" &&
        !Array.isArray(existing.raw_metadata)
          ? (existing.raw_metadata as Record<string, Json>)
          : {};
      const existingStructured =
        existing.structured &&
        typeof existing.structured === "object" &&
        !Array.isArray(existing.structured)
          ? (existing.structured as Record<string, unknown>)
          : {};
      const needsRequeue =
        existing.processing_status === "failed" ||
        existing.enrichment_error !== null ||
        wouldBenefitFromLlmReenrichment({
          category: existing.category,
          title: existing.title,
          description: existing.description,
          structured: existingStructured,
        });

      await admin
        .from("items")
        .update({
          raw_metadata: {
            ...existingRaw,
            capture_snapshot: captureSnapshot,
          } as Json,
          ...(needsRequeue
            ? {
                processing_status: "pending" as const,
                enrichment_attempts: 0,
                enrichment_error: null,
              }
            : {}),
        })
        .eq("id", existing.id);

      if (needsRequeue) {
        after(async () => {
          await enrichItem(existing.id);
        });
      }
    }

    const res: CaptureResponseBody = {
      created: false,
      item: mapCaptureItem(decryptItemFields(existing)),
    };
    return jsonResponse(res);
  }

  const quota = await checkQuota(admin, userId, "items", MAX_ITEMS_PER_USER);
  if (!quota.ok) {
    return jsonResponse({ code: "quota_exceeded" }, { status: 409 });
  }

  const categoryHint = parseCaptureCategoryHint(body.category_hint);
  if (categoryHint === "invalid") {
    return jsonResponse({ code: "invalid_category_hint" }, { status: 400 });
  }

  const insertRow = {
    user_id: userId,
    url: body.url.trim(),
    canonical_url: canonical,
    url_fingerprint: fp,
    domain,
    source: body.source,
    note: encryptIfPresent(body.note),
    status: "inbox" as const,
    processing_status: "pending" as const,
    structured: (categoryHint ? { capture_category_hint: categoryHint } : {}) as Json,
    ...(captureSnapshot
      ? { raw_metadata: { capture_snapshot: captureSnapshot } as Json }
      : {}),
  };

  const { data: createdRow, error: insertErr } = await db
    .from("items")
    .insert(insertRow)
    .select("*")
    .single();

  if (insertErr || !createdRow) {
    console.error("[api/capture] insert_failed:", insertErr?.message);
    return jsonResponse({ code: "insert_failed" }, { status: 500 });
  }

  after(async () => {
    await enrichItem(createdRow.id);
  });

  const res: CaptureResponseBody = {
    created: true,
    item: mapCaptureItem(decryptItemFields(createdRow)),
  };
  return jsonResponse(res, { status: 201 });
}

function mapCaptureItem(row: Database["public"]["Tables"]["items"]["Row"]): CaptureItemPayload {
  return {
    id: row.id,
    url: row.url,
    canonical_url: row.canonical_url,
    domain: row.domain,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    image_url: row.image_url,
    category: row.category,
    category_confidence: row.category_confidence,
    status: row.status,
    processing_status: row.processing_status,
    source: row.source,
    note: row.note,
    created_at: row.created_at,
  };
}
