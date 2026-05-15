import { notFound, redirect } from "next/navigation";

import { ItemDetail } from "@/components/items/ItemDetail";
import { loadItemExtras } from "@/lib/items/extras";
import { createClient } from "@/lib/supabase/server";

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

  return (
    <ItemDetail key={id} initial={{ ...row, ...extras }} collections={collections ?? []} />
  );
}
