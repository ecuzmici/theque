import { Suspense } from "react";
import { redirect } from "next/navigation";

import { LibraryPageClient } from "@/components/library/LibraryPageClient";
import { LibraryPageSkeleton } from "@/components/library/LibraryPageSkeleton";
import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { isRecommendEnabled, isWatchRecommendEnabled } from "@/lib/recommend/recommend-config";

export default async function LibraryPage() {
  const user = await getSessionUserOrNull();

  if (!user) {
    redirect("/login");
  }

  return (
    <Suspense fallback={<LibraryPageSkeleton />}>
      <LibraryPageClient
        userId={user.id}
        recommendBooksEnabled={isRecommendEnabled()}
        recommendWatchEnabled={isWatchRecommendEnabled()}
      />
    </Suspense>
  );
}
