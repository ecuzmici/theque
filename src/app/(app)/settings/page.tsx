import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Tag } from "lucide-react";

import { CaptureTokens } from "@/components/settings/CaptureTokens";
import { PageHeader } from "@/components/layout/PageHeader";
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
      <PageHeader
        title="Settings"
        description="Capture tokens for Chrome and shortcuts."
      />
      <CaptureTokens initialTokens={tokens ?? []} userEmail={user.email ?? undefined} />

      <section className="mt-10" aria-labelledby="settings-library-heading">
        <h2 id="settings-library-heading" className="font-serif text-lg text-foreground">
          Library
        </h2>
        <Link
          href="/tags"
          className="mt-3 flex min-h-11 items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition hover:bg-muted/50"
        >
          <span className="flex items-start gap-3">
            <Tag className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              <span className="block text-sm font-medium text-foreground">Manage tags</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                Rename, merge, or delete the tags across your library.
              </span>
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      </section>
    </div>
  );
}
