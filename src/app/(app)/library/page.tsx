import { Suspense } from "react";
import { redirect } from "next/navigation";

import { ItemGridSkeleton } from "@/components/items/ItemCardSkeleton";
import { LibraryPageClient } from "@/components/library/LibraryPageClient";
import { isRecommendEnabled, isWatchRecommendEnabled } from "@/lib/recommend/recommend-config";
import { createClient } from "@/lib/supabase/server";

function LibrarySuspenseFallback() {
  return (
    <div>
      <div className="mb-6 flex gap-6 border-b border-border pb-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="ks-shimmer h-4 w-14 shrink-0 rounded bg-[color:var(--ks-bg-muted)]"
          />
        ))}
      </div>
      <ItemGridSkeleton />
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

  return (
    <Suspense fallback={<LibrarySuspenseFallback />}>
      <LibraryPageClient
        userId={user.id}
        recommendBooksEnabled={isRecommendEnabled()}
        recommendWatchEnabled={isWatchRecommendEnabled()}
      />
    </Suspense>
  );
}
