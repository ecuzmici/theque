import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

export async function loadItemExtras(
  supabase: SupabaseClient<Database>,
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
