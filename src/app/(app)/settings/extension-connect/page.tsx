import { ExtensionConnectClient } from "@/components/settings/ExtensionConnectClient";
import { PageHeader } from "@/components/layout/PageHeader";
import { isAllowedExtensionId } from "@/lib/extension-identity";
import { createClient } from "@/lib/supabase/server";

export default async function ExtensionConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ extensionId?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedId = typeof params.extensionId === "string" ? params.extensionId : "";
  // Never send a token to an extension id that a link supplied unless it is ours.
  const unknownExtension = requestedId !== "" && !isAllowedExtensionId(requestedId);
  const extensionId = unknownExtension ? "" : requestedId;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? "this account";

  return (
    <div>
      <PageHeader
        title="Connect Chrome"
        description="Use your signed-in thèque session to set up the extension."
      />
      <ExtensionConnectClient
        extensionId={extensionId}
        email={email}
        unknownExtension={unknownExtension}
      />
    </div>
  );
}
