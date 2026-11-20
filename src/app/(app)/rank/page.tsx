import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/PageHeader";
import { getSessionUserOrNull } from "@/lib/auth/session-user";

/** Skeleton route. The rank feature branch replaces this page. */
export default async function HeadToHeadPage() {
  const user = await getSessionUserOrNull();
  if (!user) redirect("/login?next=/rank");

  return (
    <div>
      <PageHeader title="Head to head" description="Pick the better of two. Your top ten in each category follows." />
    </div>
  );
}
