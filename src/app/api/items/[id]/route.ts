import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { decryptItemFields, encryptField } from "@/lib/crypto/field-crypto";
import type { Database, ItemCategory, ItemStatus, Json } from "@/lib/database.types";
import {
  hasMaxLength,
  MAX_NOTE_LENGTH,
  MAX_TITLE_LENGTH,
} from "@/lib/input-limits";
import { deleteDriveFile, isDriveConfigured } from "@/lib/drive/client";
import { deleteItemFiles } from "@/lib/items/delete-item-files";
import { PINS_PER_CATEGORY } from "@/lib/items/pins";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Only non-null, non-empty strings are ciphertext candidates — mirrors
// `decryptField`'s passthrough for `null`/`""` (never store `enc.` of an
// empty string; see ADR 0013).
function encryptIfPresent(value: string | null): string | null {
  return value ? encryptField(value) : value;
}

// A person never types ciphertext. A value with this prefix means a client
// echoed back a raw row, and encrypting it again would lose the original text.
function looksEncrypted(value: string): boolean {
  return value.startsWith("enc.v");
}

const STATUSES = new Set<ItemStatus>(["inbox", "want", "done", "dismissed"]);

const CATEGORIES = new Set<ItemCategory>([
  "books",
  "movies_and_tv",
  "restaurants",
  "products",
  "travel",
  "recipes",
  "articles",
]);

const BLOCKED_JSON_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function mergeJsonRecord(existing: Json, patch: unknown): Json {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  const p =
    patch && typeof patch === "object" && !Array.isArray(patch)
      ? Object.fromEntries(
          Object.entries(patch as Record<string, unknown>).filter(([key]) => !BLOCKED_JSON_KEYS.has(key)),
        )
      : {};
  return { ...base, ...p } as Json;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUserOrNull();
  if (!user) return Response.json({ code: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: row, error } = await supabase.from("items").select("*").eq("id", id).maybeSingle();

  if (error || !row || row.user_id !== user.id) {
    return Response.json({ code: "not_found" }, { status: 404 });
  }

  return Response.json(decryptItemFields(row));
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUserOrNull();
  if (!user) return Response.json({ code: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: row, error: loadErr } = await supabase
    .from("items")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !row || row.user_id !== user.id) {
    return Response.json({ code: "not_found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ code: "invalid_body" }, { status: 400 });
  }

  const patch: Database["public"]["Tables"]["items"]["Update"] = {};

  if (typeof body.status === "string") {
    if (!STATUSES.has(body.status as ItemStatus)) {
      return Response.json({ code: "invalid_status" }, { status: 400 });
    }
    patch.status = body.status as ItemStatus;
  }

  if (typeof body.note === "string" || body.note === null) {
    if (
      typeof body.note === "string" &&
      (!hasMaxLength(body.note, MAX_NOTE_LENGTH) || looksEncrypted(body.note))
    ) {
      return Response.json({ code: "invalid_note" }, { status: 400 });
    }
    // Encrypt at rest (ADR 0013); the PATCH response decrypts before returning.
    patch.note = encryptIfPresent(body.note === null ? null : body.note);
  }

  if (typeof body.title === "string" || body.title === null) {
    if (typeof body.title === "string" && !hasMaxLength(body.title, MAX_TITLE_LENGTH)) {
      return Response.json({ code: "invalid_title" }, { status: 400 });
    }
    patch.title = body.title === null ? null : body.title;
  }

  if (body.category !== undefined) {
    if (body.category === null) {
      patch.category = null;
      patch.category_confidence = null;
      patch.category_source = null;
    } else if (typeof body.category === "string" && CATEGORIES.has(body.category as ItemCategory)) {
      // An unchanged category is not a manual choice: keep the provenance.
      if (body.category !== row.category) {
        patch.category = body.category as ItemCategory;
        patch.category_source = "manual";
        patch.category_confidence = 1;
      }
    } else {
      return Response.json({ code: "invalid_category" }, { status: 400 });
    }
  }

  if (body.rating_personal !== undefined) {
    if (body.rating_personal === null) {
      patch.rating_personal = null;
    } else if (
      typeof body.rating_personal === "number" &&
      Number.isInteger(body.rating_personal) &&
      body.rating_personal >= 1 &&
      body.rating_personal <= 5
    ) {
      patch.rating_personal = body.rating_personal;
    } else {
      return Response.json({ code: "invalid_rating" }, { status: 400 });
    }
  }

  if (typeof body.verdict === "string" || body.verdict === null) {
    if (
      typeof body.verdict === "string" &&
      (!hasMaxLength(body.verdict, MAX_NOTE_LENGTH) || looksEncrypted(body.verdict))
    ) {
      return Response.json({ code: "invalid_verdict" }, { status: 400 });
    }
    // Encrypt at rest (ADR 0013); the PATCH response decrypts before returning.
    patch.verdict = encryptIfPresent(body.verdict === null ? null : body.verdict);
  }

  if (patch.status && patch.status !== row.status) {
    if (patch.status === "done") {
      patch.done_at = new Date().toISOString();
    } else if (row.status === "done") {
      patch.done_at = null;
    }
  }

  if (body.pinned !== undefined) {
    if (typeof body.pinned !== "boolean") {
      return Response.json({ code: "invalid_pinned" }, { status: 400 });
    }
    if (!body.pinned) {
      patch.pinned_at = null;
    } else if (!row.pinned_at) {
      patch.pinned_at = new Date().toISOString();
    }
  }

  // A pin marks an item to do next, so a done or dismissed item loses it.
  if (patch.status === "done" || patch.status === "dismissed") {
    patch.pinned_at = null;
  }

  if (body.display !== undefined) {
    patch.display = mergeJsonRecord(row.display, body.display);
  }

  if (Object.keys(patch).length) {
    const { error: upErr } = await supabase.from("items").update(patch).eq("id", id);
    if (upErr) {
      console.error("[api/items/:id] update_failed:", upErr.message);
      return Response.json({ code: "update_failed" }, { status: 500 });
    }
  }

  // A new pin replaces the oldest pins of its category past the limit.
  let unpinnedIds: string[] = [];
  if (patch.pinned_at) {
    const category = patch.category !== undefined ? patch.category : row.category;
    let pinsQuery = supabase
      .from("items")
      .select("id")
      .eq("user_id", user.id)
      .neq("id", id)
      .not("pinned_at", "is", null);
    pinsQuery = category ? pinsQuery.eq("category", category) : pinsQuery.is("category", null);
    const { data: pins, error: pinsErr } = await pinsQuery.order("pinned_at", { ascending: true });
    const excess = (pins?.length ?? 0) - (PINS_PER_CATEGORY - 1);
    if (pinsErr) {
      console.error("[api/items/:id] pin_list_failed:", pinsErr.message);
    } else if (pins && excess > 0) {
      unpinnedIds = pins.slice(0, excess).map((p) => p.id);
      const { error: unpinErr } = await supabase
        .from("items")
        .update({ pinned_at: null })
        .in("id", unpinnedIds);
      if (unpinErr) {
        console.error("[api/items/:id] unpin_failed:", unpinErr.message);
        unpinnedIds = [];
      }
    }
  }

  const { data: updated } = await supabase.from("items").select("*").eq("id", id).single();

  if (!updated) {
    return Response.json({ code: "not_found" }, { status: 404 });
  }

  const item = decryptItemFields(updated);
  return Response.json(unpinnedIds.length ? { ...item, unpinned_item_ids: unpinnedIds } : item);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUserOrNull();
  if (!user) return Response.json({ code: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: deleted, error } = await supabase
    .from("items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, file_drive_id");

  if (error) {
    console.error("[api/items/:id] delete_failed:", error.message);
    return Response.json({ code: "delete_failed" }, { status: 500 });
  }

  if (!deleted?.length) {
    return Response.json({ code: "not_found" }, { status: 404 });
  }

  // No row points at the cover or the book file now, so remove them here.
  // Deleting the item also removes its book file from Drive and the Kobo.
  await deleteItemFiles(
    { userId: user.id, itemId: id, driveId: deleted[0].file_drive_id ?? null },
    {
      storage: createAdminClient().storage,
      deleteDriveFile: isDriveConfigured() ? deleteDriveFile : undefined,
    },
  );

  return new Response(null, { status: 204 });
}
