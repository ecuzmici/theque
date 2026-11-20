import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/PageHeader";
import { getSessionUserOrNull } from "@/lib/auth/session-user";

/** Skeleton route. The diary feature branch replaces this page. */
export default async function ReadingDiaryPage() {
  const user = await getSessionUserOrNull();
  if (!user) redirect("/login?next=/diary");

  return (
    <div>
      <PageHeader title="Reading diary" description="The books you finished, day by day." />
    </div>
  );
}
