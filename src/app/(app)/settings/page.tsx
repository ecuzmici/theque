import Link from "next/link";
import { Sparkles } from "lucide-react";

import { CaptureTokens } from "@/components/settings/CaptureTokens";
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
      <Link
        href="/taste-card"
        className="mb-6 flex items-center gap-3 rounded-xl border border-[color:var(--ks-border)] bg-[color:var(--ks-surface)] p-4 shadow-[var(--ks-shadow)] transition-colors hover:border-[color:var(--ks-accent)]"
      >
        <span className="flex size-9 items-center justify-center rounded-lg bg-[color:var(--ks-accent-soft)] text-[color:var(--ks-accent)]">
          <Sparkles className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">Your taste card</span>
          <span className="block text-xs text-muted-foreground">
            A snapshot of your library to keep or share.
          </span>
        </span>
      </Link>
      <CaptureTokens initialTokens={tokens ?? []} userEmail={user.email ?? undefined} />
    </div>
  );
}
