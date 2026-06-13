import { notFound, redirect } from "next/navigation";

import { ItemDetail } from "@/components/items/ItemDetail";
import { loadItemExtras } from "@/lib/items/extras";
import { LIBRARY_ITEM_COLUMNS } from "@/lib/library-items-for-shelf";
import { createClient } from "@/lib/supabase/server";
import type { LibraryItemRow } from "@/lib/types/library-item";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ItemPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: row } = await supabase.from("items").select("*").eq("id", id).maybeSingle();

  if (!row || row.user_id !== user.id) {
    notFound();
  }

  const extras = await loadItemExtras(supabase, id);

  const { data: collections } = await supabase.from("collections").select("id, name").order("name");

  // "More from your shelves": same category, same-domain items surfacing first.
  let related: LibraryItemRow[] = [];
  if (row.category) {
    const { data: relatedRows } = await supabase
      .from("items")
      .select(LIBRARY_ITEM_COLUMNS)
      .eq("category", row.category)
      .neq("status", "dismissed")
      .neq("id", id)
      .order("created_at", { ascending: false })
      .limit(12);
    related = ((relatedRows ?? []) as LibraryItemRow[])
      .sort((a, b) => Number(b.domain === row.domain) - Number(a.domain === row.domain))
      .slice(0, 8);
  }

  return (
    <ItemDetail
      key={id}
      initial={{ ...row, ...extras }}
      collections={collections ?? []}
      related={related}
    />
  );
}
