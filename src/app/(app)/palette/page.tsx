import { redirect } from "next/navigation";

import { MoodBrowseView } from "@/components/palette/MoodBrowseView";
import { LIBRARY_ITEM_COLUMNS } from "@/lib/library-items-for-shelf";
import { createClient } from "@/lib/supabase/server";
import type { LibraryItemRow } from "@/lib/types/library-item";

export const dynamic = "force-dynamic";

/** Cap the colour walk so a large library stays a single fast page. */
const PALETTE_ITEM_CAP = 500;

export default async function PalettePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // The curated library (everything kept, minus the untriaged inbox), walked
  // around the hue wheel so each mood bucket reads as a smooth gradient.
  const { data, error } = await supabase
    .from("items")
    .select(LIBRARY_ITEM_COLUMNS)
    .neq("status", "dismissed")
    .neq("status", "inbox")
    .order("dominant_hue", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(PALETTE_ITEM_CAP);

  if (error) throw error;

  const items = (data ?? []) as LibraryItemRow[];

  return <MoodBrowseView items={items} capped={items.length >= PALETTE_ITEM_CAP} />;
}
