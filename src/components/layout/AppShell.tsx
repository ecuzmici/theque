"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { CaptureProvider, useCapture } from "@/components/capture/CaptureProvider";
import { SaveErrorRegion } from "@/components/feedback/SaveErrorRegion";
import { NotchHeader } from "@/components/layout/NotchHeader";
import { ShellSheet } from "@/components/layout/ShellSheet";
import { YouPanel } from "@/components/layout/YouPanel";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/** Signed-in email from the local session. Display only, so no network check. */
function useSessionEmail(): string | null {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    try {
      void createClient()
        .auth.getSession()
        .then(({ data }) => {
          if (!cancelled) setEmail(data.session?.user.email ?? null);
        })
        .catch(() => {});
    } catch {
      // Missing Supabase env: keep the placeholder avatar.
    }
    return () => {
      cancelled = true;
    };
  }, []);
  return email;
}

function CaptureButton() {
  const { open, openCapture } = useCapture();
  return (
    <button
      type="button"
      aria-label="Save a link"
      aria-haspopup="dialog"
      onClick={() => openCapture({ readClipboard: true })}
      className={cn(
        "fixed z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring",
        "bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-[calc(1.25rem+env(safe-area-inset-right))]",
        "lg:bottom-8 lg:right-8",
      )}
      style={{ viewTransitionName: "app-fab" }}
    >
      <Plus className={cn("size-7 transition-transform duration-200", open && "rotate-45")} aria-hidden />
    </button>
  );
}

/**
 * App chrome (ADR 0019, decision 4): a notch header with the wordmark and a "You"
 * avatar, and a floating + that opens the capture sheet. No sidebar, no bottom bar.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [youOpen, setYouOpen] = useState(false);
  const email = useSessionEmail();
  const initial = email?.[0]?.toUpperCase() ?? "·";

  return (
    <CaptureProvider>
      <div className="flex min-h-full flex-col">
        <NotchHeader
          trailing={
            <button
              type="button"
              aria-label="You"
              aria-haspopup="dialog"
              onClick={() => setYouOpen(true)}
              className={cn(
                "ks-pointer-coarse-min-hit -mr-1 flex size-11 items-center justify-center rounded-full",
                "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring",
              )}
            >
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-full bg-muted font-heading text-base text-foreground ring-1 ring-border transition",
                  youOpen ? "ring-2 ring-foreground" : "hover:ring-foreground/40",
                )}
              >
                {initial}
              </span>
            </button>
          }
        />

        {/* Bottom padding keeps the last row of content clear of the floating +. */}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-6 lg:pb-32">
          {children}
        </main>

        <SaveErrorRegion />
        <CaptureButton />

        <ShellSheet
          open={youOpen}
          onOpenChange={setYouOpen}
          title="You"
          showTitle={false}
          desktopClassName="lg:top-16 lg:bottom-auto lg:right-[max(1rem,calc((100vw-72rem)/2+1rem))]"
        >
          <YouPanel email={email} initial={initial} onNavigate={() => setYouOpen(false)} />
        </ShellSheet>
      </div>
    </CaptureProvider>
  );
}
