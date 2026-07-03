import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";

import { ItemDetail } from "@/components/items/ItemDetail";
import { ItemDetailSkeleton } from "@/components/items/ItemDetailSkeleton";
import { LIBRARY_ITEM_COLUMNS } from "@/lib/library-items-for-shelf";
import { createClient } from "@/lib/supabase/server";
import type { LibraryItemRow } from "@/lib/types/library-item";

type PageProps = {
  params: Promise<{ id: string }>;
};

// Suspense (not a route-level loading.tsx) so the fallback can carry the cover's
// view-transition-name — the library cover morphs into the skeleton box and then
// into the loaded hero, one continuous shared element (see next-view-transitions
// wiring in RootLayout + ItemCard/ItemDetail).
export default async function ItemPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <Suspense fallback={<ItemDetailSkeleton />}>
      <ItemDetailContent id={id} />
    </Suspense>
  );
}

async function ItemDetailContent({ id }: { id: string }) {
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

  return <ItemDetail key={id} initial={row} related={related} />;
}
