import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { decryptItemFields } from "@/lib/crypto/field-crypto";
import type { Database } from "@/lib/database.types";
import { hasMaxLength, MAX_SEARCH_QUERY_LENGTH } from "@/lib/input-limits";
import { fetchLibraryItemsForShelf, type LibrarySort } from "@/lib/library-items-for-shelf";
import { parseShelfParam } from "@/lib/shelves";
import type { ItemSummaryPayload, ItemsListResponseBody } from "@/lib/types/api";
import type { LibraryItemRow } from "@/lib/types/library-item";
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

/** Plain numeric `offset` takes priority over the opaque `cursor` — the
 * library client tracks offsets itself, so it doesn't need to round-trip the
 * cursor encoding for shelf/sort pagination. */
function resolveOffset(qp: URLSearchParams): number {
  const offsetRaw = qp.get("offset");
  if (offsetRaw != null) {
    const n = Number.parseInt(offsetRaw, 10);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }
  return decodeItemsCursor(qp.get("cursor"));
}

const LIBRARY_SORTS = new Set<LibrarySort>(["recent", "color", "title"]);

function parseSortParam(param: string | null): LibrarySort {
  return param && LIBRARY_SORTS.has(param as LibrarySort) ? (param as LibrarySort) : "recent";
}

function mapSummary(row: ItemRow): ItemSummaryPayload {
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
    display: row.display,
    dominant_color: row.dominant_color,
    dominant_hue: row.dominant_hue,
    rating_personal: row.rating_personal,
    verdict: row.verdict,
    done_at: row.done_at,
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

  const offset = resolveOffset(qp);

  const shelfParam = qp.get("shelf");

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

  const q = qp.get("q");

  const supabase = await createClient();

  // Shelf-aware library reads (initial shelf load, shelf switch, sort change,
  // infinite scroll, pending-item polling) go through `fetchLibraryItemsForShelf`
  // — the same shelf filter/sort logic the server-rendered paths use — so the
  // browser never queries `items` directly for library summaries and always
  // gets decrypted `note`/`verdict` (ADR 0013 / issue #68).
  if (shelfParam) {
    const shelfId = parseShelfParam(shelfParam);
    const sort = parseSortParam(qp.get("sort"));

    let shelfResult: { items: LibraryItemRow[]; hasMore: boolean };
    try {
      shelfResult = await fetchLibraryItemsForShelf(supabase, shelfId, offset, sort);
    } catch (err) {
      console.error(
        "[api/items] shelf_query_failed:",
        err instanceof Error ? err.message : "unknown_error",
      );
      return Response.json({ code: "query_failed" }, { status: 500 });
    }

    // Fail closed, same contract as the general list branch below.
    let shelfItems: ItemSummaryPayload[];
    try {
      shelfItems = shelfResult.items.map((row) => ({ ...decryptItemFields(row) }));
    } catch (err) {
      console.error(
        "[api/items] decrypt_failed:",
        err instanceof Error ? err.message : "unknown_error",
      );
      return Response.json({ code: "decrypt_failed" }, { status: 500 });
    }

    const shelfBody: ItemsListResponseBody = {
      items: shelfItems,
      next_cursor: shelfResult.hasMore ? encodeItemsCursor(offset + shelfResult.items.length) : null,
    };

    return Response.json(shelfBody);
  }

  let query = supabase
    .from("items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

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

  // Fail closed: a tampered/undecryptable enc.* value throws in
  // `decryptField`. For this list endpoint one bad row fails the whole
  // request (explicit 500) rather than rendering ciphertext or dropping the
  // row silently — see ADR 0013 / issue #66.
  let items: ItemSummaryPayload[];
  try {
    items = pageRows.map((row) => mapSummary(decryptItemFields(row)));
  } catch (err) {
    console.error(
      "[api/items] decrypt_failed:",
      err instanceof Error ? err.message : "unknown_error",
    );
    return Response.json({ code: "decrypt_failed" }, { status: 500 });
  }

  const body: ItemsListResponseBody = {
    items,
    next_cursor: hasMore ? encodeItemsCursor(offset + limit) : null,
  };

  return Response.json(body);
}
