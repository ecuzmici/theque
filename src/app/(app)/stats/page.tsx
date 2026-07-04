import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/PageHeader";
import { LibraryStatsView } from "@/components/stats/LibraryStatsView";
import { fetchLibraryStats } from "@/lib/stats/library-stats";
import { createClient } from "@/lib/supabase/server";

export default async function StatsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const stats = await fetchLibraryStats(supabase);

  return (
    <div>
      <PageHeader
        title="Your taste in numbers"
        description="A private look at what you've collected — only you can see this."
      />
      <LibraryStatsView stats={stats} />
    </div>
  );
}
