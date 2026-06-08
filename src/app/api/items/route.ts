import { getSessionUserOrNull } from "@/lib/auth/session-user";
import type { Database } from "@/lib/database.types";
import { hasMaxLength, MAX_SEARCH_QUERY_LENGTH } from "@/lib/input-limits";
import type { ItemSummaryPayload, ItemsListResponseBody } from "@/lib/types/api";
import { createClient } from "@/lib/supabase/server";

type ItemRow = Database["public"]["Tables"]["items"]["Row"];

function encodeItemsCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), "utf8").toString("base64url");
}

function decodeItemsCursor(cursor: string | null): number {
  if (!cursor) return 0;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const j = JSON.parse(raw) as { o?: unknown };
    return typeof j.o === "number" && j.o >= 0 ? Math.floor(j.o) : 0;
  } catch {
    return 0;
  }
}

function intersectIds(a: string[], b: string[]): string[] {
  const bs = new Set(b);
  return a.filter((x) => bs.has(x));
}


async function loadTagsAndCollections(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemIds: string[],
): Promise<{
  tagsByItem: Map<string, string[]>;
  collectionsByItem: Map<string, string[]>;
}> {
  const tagsByItem = new Map<string, string[]>();
  const collectionsByItem = new Map<string, string[]>();
  if (!itemIds.length) return { tagsByItem, collectionsByItem };

  const { data: tagLinks } = await supabase
    .from("item_tags")
    .select("item_id, tag_id")
    .in("item_id", itemIds);

  const tagIds = [...new Set(tagLinks?.map((l) => l.tag_id) ?? [])];
  const { data: tagRows } =
    tagIds.length > 0
      ? await supabase.from("tags").select("id, name").in("id", tagIds)
      : { data: [] as { id: string; name: string }[] };

  const tagNameById = new Map(tagRows?.map((t) => [t.id, t.name]) ?? []);

  for (const link of tagLinks ?? []) {
    const name = tagNameById.get(link.tag_id);
    if (!name) continue;
    const cur = tagsByItem.get(link.item_id) ?? [];
    cur.push(name);
    tagsByItem.set(link.item_id, cur);
  }

  const { data: colLinks } = await supabase
    .from("collection_items")
    .select("item_id, collection_id")
    .in("item_id", itemIds);

  for (const link of colLinks ?? []) {
    const cur = collectionsByItem.get(link.item_id) ?? [];
    cur.push(link.collection_id);
    collectionsByItem.set(link.item_id, cur);
  }

  return { tagsByItem, collectionsByItem };
}

function mapSummary(row: ItemRow, tags: string[], collection_ids: string[]): ItemSummaryPayload {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    image_url: row.image_url,
    image_storage_path: row.image_storage_path,
    domain: row.domain,
    category: row.category,
    status: row.status,
    processing_status: row.processing_status,
    canonical_url: row.canonical_url,
    created_at: row.created_at,
    tags,
    collection_ids,
    display: row.display,
  };
}

export async function GET(req: Request) {
  const user = await getSessionUserOrNull();
  if (!user) {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const qp = url.searchParams;

  const limitRaw = Number.parseInt(qp.get("limit") ?? "24", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 24;

  const offset = decodeItemsCursor(qp.get("cursor"));

  const statusCsv = qp.get("status");
  const statuses = statusCsv
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const categoryCsv = qp.get("category");
  const categories = categoryCsv
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const procCsv = qp.get("processing_status");
  const processingStatuses = procCsv
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const collectionId = qp.get("collection_id");
  const tagParam = qp.get("tag");
  const q = qp.get("q");

  const supabase = await createClient();

  let idRestrictions: string[] | null = null;

  if (collectionId) {
    const { data: ci } = await supabase
      .from("collection_items")
      .select("item_id")
      .eq("collection_id", collectionId);

    const ids = ci?.map((r) => r.item_id) ?? [];
    idRestrictions = ids;
    if (ids.length === 0) {
      const body: ItemsListResponseBody = { items: [], next_cursor: null };
      return Response.json(body);
    }
  }

  if (tagParam) {
    const normalizedTag = tagParam.trim().toLowerCase();
    const { data: tagRow } = await supabase
      .from("tags")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", normalizedTag)
      .maybeSingle();

    let tagIds: string[] = [];
    if (tagRow?.id) {
      const { data: links } = await supabase
        .from("item_tags")
        .select("item_id")
        .eq("tag_id", tagRow.id);

      tagIds = links?.map((l) => l.item_id) ?? [];
    }

    if (tagIds.length === 0) {
      const body: ItemsListResponseBody = { items: [], next_cursor: null };
      return Response.json(body);
    }

    idRestrictions =
      idRestrictions === null ? tagIds : intersectIds(idRestrictions, tagIds);

    if (idRestrictions.length === 0) {
      const body: ItemsListResponseBody = { items: [], next_cursor: null };
      return Response.json(body);
    }
  }

  let query = supabase
    .from("items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (idRestrictions) {
    query = query.in("id", idRestrictions);
  }

  if (statuses?.length) {
    query = query.in("status", statuses as ItemRow["status"][]);
  }

  if (categories?.length) {
    query = query.in("category", categories as NonNullable<ItemRow["category"]>[]);
  }

  if (processingStatuses?.length) {
    query = query.in(
      "processing_status",
      processingStatuses as ItemRow["processing_status"][],
    );
  }

  if (q && q.trim()) {
    const trimmedQuery = q.trim();
    if (!hasMaxLength(trimmedQuery, MAX_SEARCH_QUERY_LENGTH)) {
      return Response.json({ code: "invalid_query" }, { status: 400 });
    }

    query = query.textSearch("search_vector", trimmedQuery, { type: "websearch" });
  }

  const rangeEnd = offset + limit;
  const { data: rows, error } = await query.range(offset, rangeEnd);

  if (error) {
    console.error("[api/items] query_failed:", error.message);
    return Response.json({ code: "query_failed" }, { status: 500 });
  }

  const list = rows ?? [];
  const hasMore = list.length > limit;
  const pageRows = hasMore ? list.slice(0, limit) : list;

  const ids = pageRows.map((r) => r.id);
  const { tagsByItem, collectionsByItem } = await loadTagsAndCollections(supabase, ids);

  const items: ItemSummaryPayload[] = pageRows.map((row) =>
    mapSummary(
      row,
      (tagsByItem.get(row.id) ?? []).sort(),
      collectionsByItem.get(row.id) ?? [],
    ),
  );

  const body: ItemsListResponseBody = {
    items,
    next_cursor: hasMore ? encodeItemsCursor(offset + limit) : null,
  };

  return Response.json(body);
}
