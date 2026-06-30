import { Suspense } from "react";
import { redirect } from "next/navigation";

import { ItemCardSkeleton } from "@/components/items/ItemCardSkeleton";
import { LibraryPageClient } from "@/components/library/LibraryPageClient";
import { isRecommendEnabled, isWatchRecommendEnabled } from "@/lib/recommend/recommend-config";
import { createClient } from "@/lib/supabase/server";

function LibrarySuspenseFallback() {
  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-none">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="ks-shimmer h-9 w-20 shrink-0 rounded-full bg-[color:var(--ks-bg-muted)]"
          />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i}>
            <ItemCardSkeleton />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function LibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Cheap head counts (RLS-scoped to this user) so the client can decide between
  // the cold-start onboarding and the normal library without a flash or a wait.
  const [{ count: totalCount }, { count: doneCount }] = await Promise.all([
    supabase.from("items").select("id", { count: "exact", head: true }),
    supabase.from("items").select("id", { count: "exact", head: true }).eq("status", "done"),
  ]);

  return (
    <Suspense fallback={<LibrarySuspenseFallback />}>
      <LibraryPageClient
        userId={user.id}
        recommendBooksEnabled={isRecommendEnabled()}
        recommendWatchEnabled={isWatchRecommendEnabled()}
        initialTotalCount={totalCount ?? 0}
        initialDoneCount={doneCount ?? 0}
      />
    </Suspense>
  );
}
