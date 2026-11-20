import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/layout/PageHeader";
import { RadarSkeleton } from "@/components/radar/RadarSkeleton";
import { RadarView } from "@/components/radar/RadarView";
import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { loadLibrarySnapshot } from "@/lib/library-snapshot/load";
import { loadRadar } from "@/lib/radar";

/** Reads the library through the session client (RLS), then asks Hardcover and TMDB. */
async function RadarSection() {
  const items = await loadLibrarySnapshot("/radar");
  const radar = await loadRadar(items);
  return <RadarView radar={radar} />;
}

export default async function ReleaseRadarPage() {
  const user = await getSessionUserOrNull();
  if (!user) redirect("/login?next=/radar");

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Release radar" description="New books and films from the people you already read and watch." />
      <Suspense fallback={<RadarSkeleton />}>
        <RadarSection />
      </Suspense>
    </div>
  );
}
