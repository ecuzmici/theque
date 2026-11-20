import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/PageHeader";
import { WrappedNoFinishes } from "@/components/wrapped/WrappedNoFinishes";
import { WrappedStory } from "@/components/wrapped/WrappedStory";
import { loadLibrarySnapshot } from "@/lib/library-snapshot/load";
import {
  computeWrapped,
  currentWrappedYear,
  finishedYears,
  planSlides,
  resolveWrappedYear,
} from "@/lib/wrapped/wrapped";

/**
 * Your year, as story slides. The loader reads the items through the session
 * client, so RLS limits them to the signed-in user. The page computes the
 * recap on the server and gives the client only the aggregates.
 */
export default async function YourYearPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [items, params] = await Promise.all([loadLibrarySnapshot("/wrapped"), searchParams]);
  const now = new Date();
  const currentYear = currentWrappedYear(now);
  const years = finishedYears(items);

  const year = resolveWrappedYear(params.year, years, currentYear);
  if (year == null) redirect("/wrapped");

  if (years.length === 0) {
    return (
      <div>
        <PageHeader title="Your year" description="What you finished this year, slide by slide." />
        <WrappedNoFinishes />
      </div>
    );
  }

  const wrapped = computeWrapped(items, year, { now });
  const switchYears = years.includes(year) ? years : [year, ...years].sort((a, b) => b - a);

  return (
    <WrappedStory
      key={year}
      wrapped={wrapped}
      slides={planSlides(wrapped)}
      years={switchYears}
      currentYear={currentYear}
    />
  );
}
