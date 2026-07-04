import { Suspense } from "react";
import { redirect } from "next/navigation";

import { LibraryPageClient } from "@/components/library/LibraryPageClient";
import { LibraryPageSkeleton } from "@/components/library/LibraryPageSkeleton";
import { isRecommendEnabled, isWatchRecommendEnabled } from "@/lib/recommend/recommend-config";
import { createClient } from "@/lib/supabase/server";

export default async function LibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
