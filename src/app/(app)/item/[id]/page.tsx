import { notFound, redirect } from "next/navigation";

import { ItemDetail } from "@/components/items/ItemDetail";
import { decryptItemFields } from "@/lib/crypto/field-crypto";
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

  // Decrypt-on-read (ADR 0013): a tampered enc.* value throws, which surfaces
  // as this route segment's error boundary — never rendered ciphertext.
  const decryptedRow = decryptItemFields(row);

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
      .map((r) => decryptItemFields(r))
      .sort((a, b) => Number(b.domain === row.domain) - Number(a.domain === row.domain))
      .slice(0, 8);
  }

  return <ItemDetail key={id} initial={decryptedRow} related={related} />;
}
