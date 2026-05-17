import { after } from "next/server";

import { parseCaptureCategoryHint } from "@/lib/capture/category-hint";
import type { Database, ItemSource, Json } from "@/lib/database.types";
import {
  lookupCaptureTokenUser,
  parseBearerToken,
} from "@/lib/auth/capture-token";
import { getSessionUserOrNull } from "@/lib/auth/session-user";
import type { CaptureItemPayload, CaptureRequestBody, CaptureResponseBody } from "@/lib/types/api";
import { enrichItem } from "@/lib/jobs/enrich-item";
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

function normalizeTagNames(names?: string[]): string[] {
  if (!names?.length) return [];
  const set = new Set<string>();
  for (const raw of names) {
    const n = raw.trim().toLowerCase();
    if (n) set.add(n);
  }
  return [...set];
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return Response.json(body, init);
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

  if (!body.source || !SOURCES.has(body.source)) {
    return jsonResponse({ code: "invalid_source" }, { status: 400 });
  }

  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== "string" || body.note.length > 2000) {
      return jsonResponse({ code: "invalid_note" }, { status: 400 });
    }
  }

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
    const res: CaptureResponseBody = {
      created: false,
      item: mapCaptureItem(existing),
    };
    return jsonResponse(res);
  }

  const categoryHint = parseCaptureCategoryHint(body.category_hint);
  if (categoryHint === "invalid") {
    return jsonResponse({ code: "invalid_category_hint" }, { status: 400 });
  }

  if (body.collection_ids?.length) {
    const { data: owned } = await admin
      .from("collections")
      .select("id")
      .eq("user_id", userId)
      .in("id", body.collection_ids);

    if (!owned || owned.length !== body.collection_ids.length) {
      return jsonResponse({ code: "forbidden" }, { status: 403 });
    }
  }

  const insertRow = {
    user_id: userId,
    url: body.url.trim(),
    canonical_url: canonical,
    url_fingerprint: fp,
    domain,
    source: body.source,
    note: body.note ?? null,
    status: "inbox" as const,
    processing_status: "pending" as const,
    structured: (categoryHint ? { capture_category_hint: categoryHint } : {}) as Json,
  };

  const { data: createdRow, error: insertErr } = await db
    .from("items")
    .insert(insertRow)
    .select("*")
    .single();

  if (insertErr || !createdRow) {
    return jsonResponse({ code: "insert_failed", detail: insertErr?.message }, { status: 500 });
  }

  const tagNames = normalizeTagNames(body.tag_names);
  const tagIds: string[] = [];

  for (const name of tagNames) {
    const { data: tagRow, error: tagErr } = await admin
      .from("tags")
      .upsert({ user_id: userId, name }, { onConflict: "user_id,name" })
      .select("id")
      .single();

    if (tagErr || !tagRow) {
      return jsonResponse({ code: "tag_failed", detail: tagErr?.message }, { status: 500 });
    }
    tagIds.push(tagRow.id);
  }

  if (tagIds.length) {
    const rows = tagIds.map((tag_id) => ({ item_id: createdRow.id, tag_id }));
    const { error: linkErr } = await admin.from("item_tags").insert(rows);
    if (linkErr) {
      return jsonResponse({ code: "tag_link_failed", detail: linkErr.message }, { status: 500 });
    }
  }

  if (body.collection_ids?.length) {
    const ciRows = body.collection_ids.map((collection_id) => ({
      collection_id,
      item_id: createdRow.id,
    }));
    const { error: ciErr } = await admin.from("collection_items").insert(ciRows);
    if (ciErr) {
      return jsonResponse({ code: "collection_link_failed", detail: ciErr.message }, { status: 500 });
    }
  }

  after(() => {
    void enrichItem(createdRow.id);
  });

  const res: CaptureResponseBody = {
    created: true,
    item: mapCaptureItem(createdRow),
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
