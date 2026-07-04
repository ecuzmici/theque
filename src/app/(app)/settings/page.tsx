import { CaptureTokens } from "@/components/settings/CaptureTokens";
import { DangerZone } from "@/components/settings/DangerZone";
import { PageHeader } from "@/components/layout/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: tokens } = await supabase
    .from("capture_tokens")
    .select("id, name, token_prefix, created_at, last_used_at, revoked_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Capture tokens for Chrome and shortcuts."
      />
      <CaptureTokens initialTokens={tokens ?? []} userEmail={user.email ?? undefined} />
      <div className="mt-6">
        <DangerZone />
      </div>
    </div>
  );
}
