import { CaptureTokens } from "@/components/settings/CaptureTokens";
import { PageHeader } from "@/components/layout/PageHeader";
import { BindingPicker } from "@/components/theme/BindingPicker";
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

      <section className="mt-10 border-t border-border pt-8">
        <h2 className="font-heading text-xl tracking-tight text-foreground">Binding</h2>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Choose the cloth your library is bound in. It re-tints the accent across thèque and is
          saved on this device.
        </p>
        <div className="mt-4">
          <BindingPicker />
        </div>
      </section>
    </div>
  );
}
