import { redirect } from "next/navigation";

import { CaptureTokens } from "@/components/settings/CaptureTokens";
import { createClient } from "@/lib/supabase/server";

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
      <h1 className="font-serif text-3xl tracking-tight text-[color:var(--ks-fg)]">Settings</h1>
      <p className="mt-2 text-sm text-[color:var(--ks-fg-muted)]">
        Manage how links arrive in Theque from extensions and shortcuts.
      </p>
      <CaptureTokens initialTokens={tokens ?? []} />
    </div>
  );
}
