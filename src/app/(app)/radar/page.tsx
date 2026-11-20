import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/PageHeader";
import { getSessionUserOrNull } from "@/lib/auth/session-user";

/** Skeleton route. The radar feature branch replaces this page. */
export default async function ReleaseRadarPage() {
  const user = await getSessionUserOrNull();
  if (!user) redirect("/login?next=/radar");

  return (
    <div>
      <PageHeader title="Release radar" description="New books and films from the people you already read and watch." />
    </div>
  );
}
