import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/PageHeader";
import { TasteCard } from "@/components/taste-card/TasteCard";
import { buildTasteCardSummary, type TasteCardRow } from "@/lib/taste-card/taste-card-data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// A personal library is small; this cap protects the query without paging.
const MAX_ROWS = 2000;

export default async function TasteCardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("items")
    .select("category, status, dominant_color, dominant_hue, rating_personal, title")
    .neq("status", "dismissed")
    .limit(MAX_ROWS);

  if (error) throw error;

  const summary = buildTasteCardSummary((data ?? []) as TasteCardRow[]);

  return (
    <div>
      <PageHeader
        title="Your taste card"
        description="A snapshot of your library to keep — or screenshot and share. Stays private until you do."
      />
      <TasteCard summary={summary} />
    </div>
  );
}
