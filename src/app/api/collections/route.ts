import { getSessionUserOrNull } from "@/lib/auth/session-user";
import type { CollectionsListResponseBody } from "@/lib/types/api";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const user = await getSessionUserOrNull();
  if (!user) return Response.json({ code: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: collections, error } = await supabase
    .from("collections")
    .select("*")
    .eq("user_id", user.id)
    .order("name");

  if (error) {
    return Response.json({ code: "query_failed", detail: error.message }, { status: 500 });
  }

  const ids = collections?.map((c) => c.id) ?? [];
  const countMap = new Map<string, number>();

  if (ids.length) {
    const { data: links } = await supabase.from("collection_items").select("collection_id").in("collection_id", ids);

    for (const row of links ?? []) {
      countMap.set(row.collection_id, (countMap.get(row.collection_id) ?? 0) + 1);
    }
  }

  const body: CollectionsListResponseBody = {
    collections: (collections ?? []).map((c) => ({
      ...c,
      item_count: countMap.get(c.id) ?? 0,
    })),
  };

  return Response.json(body);
}

export async function POST(req: Request) {
  const user = await getSessionUserOrNull();
  if (!user) return Response.json({ code: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ code: "invalid_body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return Response.json({ code: "invalid_name" }, { status: 400 });
  }

  const description =
    typeof body.description === "string"
      ? body.description
      : body.description === null
        ? null
        : null;

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("collections")
    .insert({
      user_id: user.id,
      name,
      description,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return Response.json({ code: "duplicate_name" }, { status: 409 });
    }
    return Response.json({ code: "insert_failed", detail: error.message }, { status: 500 });
  }

  return Response.json(row, { status: 201 });
}
