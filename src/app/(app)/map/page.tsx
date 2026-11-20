import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/PageHeader";
import { getSessionUserOrNull } from "@/lib/auth/session-user";

/** Skeleton route. The map feature branch replaces this page. */
export default async function TasteMapPage() {
  const user = await getSessionUserOrNull();
  if (!user) redirect("/login?next=/map");

  return (
    <div>
      <PageHeader title="Taste map" description="Where your taste sits across genres and eras." />
    </div>
  );
}
