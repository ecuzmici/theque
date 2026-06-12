import { redirect } from "next/navigation";

import { CollectionsPageClient, type CollectionMosaicTile } from "@/components/collections/CollectionsPageClient";
import { PageHeader } from "@/components/layout/PageHeader";
import { getDisplayImageUrl } from "@/lib/item-display";
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
  const itemIdsByCollection = new Map<string, string[]>();

  if (ids.length) {
    const { data: links } = await supabase
      .from("collection_items")
      .select("collection_id, item_id")
      .in("collection_id", ids);

    for (const row of links ?? []) {
      countMap.set(row.collection_id, (countMap.get(row.collection_id) ?? 0) + 1);
      const list = itemIdsByCollection.get(row.collection_id) ?? [];
      if (list.length < 4) {
        list.push(row.item_id);
        itemIdsByCollection.set(row.collection_id, list);
      }
    }
  }

  // Cover mosaic: up to four item covers per collection.
  const mosaicItemIds = [...new Set([...itemIdsByCollection.values()].flat())];
  const mosaics: Record<string, CollectionMosaicTile[]> = {};
  if (mosaicItemIds.length) {
    const { data: mosaicItems } = await supabase
      .from("items")
      .select("id, image_url, image_storage_path, dominant_color")
      .in("id", mosaicItemIds);

    const byId = new Map((mosaicItems ?? []).map((i) => [i.id, i]));
    for (const [collectionId, itemIds] of itemIdsByCollection) {
      mosaics[collectionId] = itemIds
        .map((itemId) => byId.get(itemId))
        .filter((i) => i != null)
        .map((i) => ({
          src: getDisplayImageUrl(i.image_storage_path, i.image_url),
          color: i.dominant_color,
        }));
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
      <CollectionsPageClient initialCollections={initial} mosaics={mosaics} />
    </div>
  );
}
