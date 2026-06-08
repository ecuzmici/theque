import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/PageHeader";
import { TagsPageClient } from "@/components/tags/TagsPageClient";
import { createClient } from "@/lib/supabase/server";
import type { TagListEntry } from "@/app/api/tags/route";

export default async function TagsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: tags } = await supabase
    .from("tags")
    .select("id, name")
    .eq("user_id", user.id)
    .order("name");

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

  const initialTags: TagListEntry[] = (tags ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    item_count: countMap.get(t.id) ?? 0,
  }));

  return (
    <div>
      <PageHeader
        title="Tags"
        description="Rename, merge, or delete your tags."
      />
      <TagsPageClient initialTags={initialTags} />
    </div>
  );
}
