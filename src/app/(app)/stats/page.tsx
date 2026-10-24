import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/PageHeader";
import { LibraryStatsView } from "@/components/stats/LibraryStatsView";
import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { fetchLibraryStats } from "@/lib/stats/library-stats";
import { createClient } from "@/lib/supabase/server";

export default async function StatsPage() {
  const [supabase, user] = await Promise.all([createClient(), getSessionUserOrNull()]);

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
