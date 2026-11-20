import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/PageHeader";
import { getSessionUserOrNull } from "@/lib/auth/session-user";

/** Skeleton route. The wrapped feature branch replaces this page. */
export default async function YourYearPage() {
  const user = await getSessionUserOrNull();
  if (!user) redirect("/login?next=/wrapped");

  return (
    <div>
      <PageHeader title="Your year" description="What you finished this year, slide by slide." />
    </div>
  );
}
