import Link from "next/link";
import { BarChart3, ChevronRight, FileUp } from "lucide-react";

import { CaptureTokens } from "@/components/settings/CaptureTokens";
import { DangerZone } from "@/components/settings/DangerZone";
import { EmailPreferences } from "@/components/settings/EmailPreferences";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchDigestPreferences } from "@/lib/profiles/profiles";
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

  const digestPreferences = await fetchDigestPreferences(supabase, user.id);

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Capture tokens for Chrome and shortcuts."
      />
      <Link
        href="/stats"
        className="mb-6 flex items-center gap-3 rounded-[var(--ks-radius-card)] border border-border bg-card p-4 shadow-[var(--ks-shadow)] transition hover:bg-muted"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <BarChart3 className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">Your taste in numbers</span>
          <span className="block text-xs text-muted-foreground">
            Totals, categories, colors and verdicts across your library
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
      <Link
        href="/settings/import"
        className="mb-6 flex items-center gap-3 rounded-[var(--ks-radius-card)] border border-border bg-card p-4 shadow-[var(--ks-shadow)] transition hover:bg-muted"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <FileUp className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">Import a file</span>
          <span className="block text-xs text-muted-foreground">
            Pocket, browser bookmarks or any CSV — brought in with titles, ratings and verdicts
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
      <CaptureTokens initialTokens={tokens ?? []} userEmail={user.email ?? undefined} />
      <div className="mt-6">
        <EmailPreferences
          initialPreferences={digestPreferences}
          userEmail={user.email ?? undefined}
        />
      </div>
      <div className="mt-6">
        <DangerZone />
      </div>
    </div>
  );
}
