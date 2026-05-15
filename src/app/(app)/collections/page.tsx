import { redirect } from "next/navigation";

import { CollectionsPageClient } from "@/components/collections/CollectionsPageClient";
import { PageHeader } from "@/components/layout/PageHeader";
import { createClient } from "@/lib/supabase/server";
import type { CollectionListEntry } from "@/lib/types/api";

export default async function CollectionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: collections } = await supabase
    .from("collections")
    .select("id, name, description, cover_image_url, created_at, updated_at")
    .eq("user_id", user.id)
    .order("name");

  const ids = collections?.map((c) => c.id) ?? [];
  const countMap = new Map<string, number>();

  if (ids.length) {
    const { data: links } = await supabase
      .from("collection_items")
      .select("collection_id")
      .in("collection_id", ids);

    for (const row of links ?? []) {
      countMap.set(row.collection_id, (countMap.get(row.collection_id) ?? 0) + 1);
    }
  }

  const initial: CollectionListEntry[] = (collections ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    cover_image_url: c.cover_image_url,
    created_at: c.created_at,
    updated_at: c.updated_at,
    item_count: countMap.get(c.id) ?? 0,
  }));

  return (
    <div>
      <PageHeader
        title="Collections"
        description="Group saves by trip, project, or mood — separate from category shelves."
      />
      <CollectionsPageClient initialCollections={initial} />
    </div>
  );
}
