import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/PageHeader";
import { LibraryStatsView } from "@/components/stats/LibraryStatsView";
import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { loadTopTens } from "@/lib/rank/load-top-ten";
import { fetchLibraryStats } from "@/lib/stats/library-stats";
import { createClient } from "@/lib/supabase/server";

export default async function StatsPage() {
  const [supabase, user] = await Promise.all([createClient(), getSessionUserOrNull()]);

  if (!user) {
    redirect("/login");
  }

  // The top 10 block is extra: when it fails to load, the rest of the page still shows.
  const [stats, topTens] = await Promise.all([
    fetchLibraryStats(supabase),
    loadTopTens(supabase).catch(() => undefined),
  ]);

  return (
    <div>
      <PageHeader
        title="Your taste in numbers"
        description="A private look at what you've collected — only you can see this."
      />
      <LibraryStatsView stats={stats} topTens={topTens} />
    </div>
  );
}
