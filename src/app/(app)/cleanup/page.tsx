import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/PageHeader";
import { getSessionUserOrNull } from "@/lib/auth/session-user";

/** Skeleton route. The cleanup feature branch replaces this page. */
export default async function SpringCleaningPage() {
  const user = await getSessionUserOrNull();
  if (!user) redirect("/login?next=/cleanup");

  return (
    <div>
      <PageHeader title="Spring cleaning" description="Keep it or let it go, one forgotten save at a time." />
    </div>
  );
}
