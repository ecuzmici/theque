import { ExtensionConnectClient } from "@/components/settings/ExtensionConnectClient";
import { PageHeader } from "@/components/layout/PageHeader";
import { createClient } from "@/lib/supabase/server";

export default async function ExtensionConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ extensionId?: string | string[] }>;
}) {
  const params = await searchParams;
  const extensionId = typeof params.extensionId === "string" ? params.extensionId : "";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? "this account";

  return (
    <div>
      <PageHeader
        title="Connect Chrome"
        description="Use your signed-in Theque session to configure the extension."
      />
      <ExtensionConnectClient extensionId={extensionId} email={email} />
    </div>
  );
}
