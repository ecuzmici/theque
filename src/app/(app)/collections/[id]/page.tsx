import { notFound, redirect } from "next/navigation";

import { CollectionDetailClient } from "@/components/collections/CollectionDetailClient";
import { createClient } from "@/lib/supabase/server";

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: collection } = await supabase
    .from("collections")
    .select("id, name, description, share_token")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!collection) notFound();

  return <CollectionDetailClient collection={collection} />;
}
