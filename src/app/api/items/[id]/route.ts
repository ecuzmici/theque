import { getSessionUserOrNull } from "@/lib/auth/session-user";
import type { Database, ItemCategory, ItemStatus, Json } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const STATUSES = new Set<ItemStatus>(["inbox", "want", "planned", "done", "dismissed"]);

const CATEGORIES = new Set<ItemCategory>([
  "books",
  "movies_and_tv",
  "restaurants",
  "products",
  "gifts",
  "travel",
  "recipes",
  "articles",
]);

function mergeJsonRecord(existing: Json, patch: unknown): Json {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  const p =
    patch && typeof patch === "object" && !Array.isArray(patch)
      ? { ...(patch as Record<string, unknown>) }
      : {};
  return { ...base, ...p } as Json;
}

function normalizeTagNames(names: string[]): string[] {
  const set = new Set<string>();
  for (const raw of names) {
    const n = raw.trim().toLowerCase();
    if (n) set.add(n);
  }
  return [...set];
}

async function loadItemExtras(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string,
): Promise<{ tags: string[]; collection_ids: string[] }> {
  const { data: tagLinks } = await supabase
    .from("item_tags")
    .select("tag_id")
    .eq("item_id", itemId);

  const tagIds = tagLinks?.map((l) => l.tag_id) ?? [];
  const { data: tagRows } =
    tagIds.length > 0
      ? await supabase.from("tags").select("name").in("id", tagIds)
      : { data: [] as { name: string }[] };

  const tags = (tagRows?.map((t) => t.name) ?? []).sort();

  const { data: colLinks } = await supabase
    .from("collection_items")
    .select("collection_id")
    .eq("item_id", itemId);

  const collection_ids = colLinks?.map((c) => c.collection_id) ?? [];

  return { tags, collection_ids };
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
    patch.note = body.note === null ? null : body.note;
  }

  if (typeof body.title === "string" || body.title === null) {
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

  if (body.display !== undefined) {
    patch.display = mergeJsonRecord(row.display, body.display);
  }

  if (Object.keys(patch).length) {
    const { error: upErr } = await supabase.from("items").update(patch).eq("id", id);
    if (upErr) {
      return Response.json({ code: "update_failed", detail: upErr.message }, { status: 500 });
    }
  }

  const admin = createAdminClient();

  if (Array.isArray(body.tag_names)) {
    const names = normalizeTagNames(body.tag_names.filter((x): x is string => typeof x === "string"));

    await admin.from("item_tags").delete().eq("item_id", id);

    const tagIds: string[] = [];
    for (const name of names) {
      const { data: tagRow, error: tagErr } = await admin
        .from("tags")
        .upsert({ user_id: user.id, name }, { onConflict: "user_id,name" })
        .select("id")
        .single();

      if (tagErr || !tagRow) {
        return Response.json({ code: "tag_failed", detail: tagErr?.message }, { status: 500 });
      }
      tagIds.push(tagRow.id);
    }

    if (tagIds.length) {
      const rows = tagIds.map((tag_id) => ({ item_id: id, tag_id }));
      const { error: linkErr } = await admin.from("item_tags").insert(rows);
      if (linkErr) {
        return Response.json({ code: "tag_link_failed", detail: linkErr.message }, { status: 500 });
      }
    }
  }

  if (Array.isArray(body.collection_ids)) {
    const collection_ids = body.collection_ids.filter((x): x is string => typeof x === "string");

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
        return Response.json({ code: "collection_link_failed", detail: ciErr.message }, { status: 500 });
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
    return Response.json({ code: "delete_failed", detail: error.message }, { status: 500 });
  }

  if (!deleted?.length) {
    return Response.json({ code: "not_found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
