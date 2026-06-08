import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { createClient } from "@/lib/supabase/server";

export type TagListEntry = {
  id: string;
  name: string;
  item_count: number;
};

export type TagsListResponseBody = {
  tags: TagListEntry[];
};

export async function GET() {
  const user = await getSessionUserOrNull();
  if (!user) return Response.json({ code: "unauthorized" }, { status: 401 });

  const supabase = await createClient();

  const { data: tags, error } = await supabase
    .from("tags")
    .select("id, name")
    .eq("user_id", user.id)
    .order("name");

  if (error) {
    console.error("[api/tags] query_failed:", error.message);
    return Response.json({ code: "query_failed" }, { status: 500 });
  }

  const tagIds = (tags ?? []).map((t) => t.id);
  const countMap = new Map<string, number>();

  if (tagIds.length > 0) {
    const { data: links } = await supabase
      .from("item_tags")
      .select("tag_id")
      .in("tag_id", tagIds);

    for (const row of links ?? []) {
      countMap.set(row.tag_id, (countMap.get(row.tag_id) ?? 0) + 1);
    }
  }

  const body: TagsListResponseBody = {
    tags: (tags ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      item_count: countMap.get(t.id) ?? 0,
    })),
  };

  return Response.json(body);
}
