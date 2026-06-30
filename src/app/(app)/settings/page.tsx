import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

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
        href="/wrapped"
        className="mb-6 flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-[var(--ks-shadow)] transition hover:border-primary/40 hover:bg-accent/40"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Sparkles className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Your Wrapped</span>
          <span className="block text-sm text-muted-foreground">
            A look back at your taste — palette, top shelves, standouts.
          </span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
      <CaptureTokens initialTokens={tokens ?? []} userEmail={user.email ?? undefined} />
    </div>
  );
}
