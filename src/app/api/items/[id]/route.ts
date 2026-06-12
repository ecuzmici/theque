import { getSessionUserOrNull } from "@/lib/auth/session-user";
import type { Database, ItemCategory, ItemStatus, Json } from "@/lib/database.types";
import { loadItemExtras } from "@/lib/items/extras";
import {
  hasMaxItems,
  hasMaxLength,
  MAX_COLLECTION_IDS_PER_ITEM,
  MAX_NOTE_LENGTH,
  MAX_TAGS_PER_ITEM,
  MAX_TITLE_LENGTH,
  normalizeLimitedTagNames,
} from "@/lib/input-limits";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const STATUSES = new Set<ItemStatus>(["inbox", "want", "planned", "done", "dismissed"]);

const CATEGORIES = new Set<ItemCategory>([
  "books",
  "movies_and_tv",
  "restaurants",
  "products",
  "travel",
  "recipes",
  "articles",
  "music",
  "videos",
  "apps",
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

  const extras = await loadItemExtras(supabase, id);

  return Response.json({
    ...row,
    tags: extras.tags,
    collection_ids: extras.collection_ids,
  });
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
    if (typeof body.note === "string" && !hasMaxLength(body.note, MAX_NOTE_LENGTH)) {
      return Response.json({ code: "invalid_note" }, { status: 400 });
    }
    patch.note = body.note === null ? null : body.note;
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
      patch.category = body.category as ItemCategory;
      patch.category_source = "manual";
      patch.category_confidence = 1;
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
    if (typeof body.verdict === "string" && !hasMaxLength(body.verdict, MAX_NOTE_LENGTH)) {
      return Response.json({ code: "invalid_verdict" }, { status: 400 });
    }
    patch.verdict = body.verdict === null ? null : body.verdict;
  }

  // done_at tracks the lifecycle: stamped on entering done, cleared on leaving.
  if (patch.status && patch.status !== row.status) {
    if (patch.status === "done") {
      patch.done_at = new Date().toISOString();
    } else if (row.status === "done") {
      patch.done_at = null;
    }
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

  const admin = createAdminClient();

  if (Array.isArray(body.tag_names)) {
    if (
      !hasMaxItems(body.tag_names, MAX_TAGS_PER_ITEM) ||
      body.tag_names.some((name) => typeof name !== "string")
    ) {
      return Response.json({ code: "invalid_tags" }, { status: 400 });
    }

    const names = normalizeLimitedTagNames(body.tag_names);
    if (!names) {
      return Response.json({ code: "invalid_tags" }, { status: 400 });
    }

    await admin.from("item_tags").delete().eq("item_id", id);

    const tagIds: string[] = [];
    for (const name of names) {
      const { data: tagRow, error: tagErr } = await admin
        .from("tags")
        .upsert({ user_id: user.id, name }, { onConflict: "user_id,name" })
        .select("id")
        .single();

      if (tagErr || !tagRow) {
        console.error("[api/items/:id] tag_failed:", tagErr?.message);
        return Response.json({ code: "tag_failed" }, { status: 500 });
      }
      tagIds.push(tagRow.id);
    }

    if (tagIds.length) {
      const rows = tagIds.map((tag_id) => ({ item_id: id, tag_id }));
      const { error: linkErr } = await admin.from("item_tags").insert(rows);
      if (linkErr) {
        console.error("[api/items/:id] tag_link_failed:", linkErr.message);
        return Response.json({ code: "tag_link_failed" }, { status: 500 });
      }
    }
  }

  if (Array.isArray(body.collection_ids)) {
    if (
      !hasMaxItems(body.collection_ids, MAX_COLLECTION_IDS_PER_ITEM) ||
      body.collection_ids.some((collectionId) => typeof collectionId !== "string")
    ) {
      return Response.json({ code: "invalid_collections" }, { status: 400 });
    }

    const collection_ids = [...new Set(body.collection_ids)];

    if (collection_ids.length) {
      const { data: owned } = await admin
        .from("collections")
        .select("id")
        .eq("user_id", user.id)
        .in("id", collection_ids);

      if (!owned || owned.length !== collection_ids.length) {
        return Response.json({ code: "forbidden" }, { status: 403 });
      }
    }

    await admin.from("collection_items").delete().eq("item_id", id);

    if (collection_ids.length) {
      const ciRows = collection_ids.map((collection_id) => ({
        collection_id,
        item_id: id,
      }));
      const { error: ciErr } = await admin.from("collection_items").insert(ciRows);
      if (ciErr) {
        console.error("[api/items/:id] collection_link_failed:", ciErr.message);
        return Response.json({ code: "collection_link_failed" }, { status: 500 });
      }
    }
  }

  const { data: updated } = await supabase.from("items").select("*").eq("id", id).single();

  if (!updated) {
    return Response.json({ code: "not_found" }, { status: 404 });
  }

  const extras = await loadItemExtras(supabase, id);

  return Response.json({
    ...updated,
    tags: extras.tags,
    collection_ids: extras.collection_ids,
  });
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
    .select("id");

  if (error) {
    console.error("[api/items/:id] delete_failed:", error.message);
    return Response.json({ code: "delete_failed" }, { status: 500 });
  }

  if (!deleted?.length) {
    return Response.json({ code: "not_found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
