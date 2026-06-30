"use client";

/**
 * A calm, dismissible invitation to add thèque to the home screen.
 *
 * - Chromium / Android: captures `beforeinstallprompt` and offers a real "Add"
 *   button that fires the native installer.
 * - iOS Safari (which never fires `beforeinstallprompt`): shows the manual
 *   Share → "Add to Home Screen" instruction instead.
 * - Hidden entirely when already installed (standalone) or once dismissed
 *   (persisted in localStorage, so it never nags). Entrance motion is gated
 *   behind `motion-safe`.
 */

import { useEffect, useState } from "react";
import { Plus, Share, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  INSTALL_DISMISSED_KEY,
  shouldShowInstallPrompt,
} from "@/lib/pwa/install-prompt";
import { cn } from "@/lib/utils";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari exposes this non-standard flag for home-screen apps.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOSSafariBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  // Exclude in-app webviews / other browsers that aren't Safari proper.
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && safari;
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [dismissed, setDismissed] = useState(true); // assume hidden until mounted
  const [standalone, setStandalone] = useState(true);

  useEffect(() => {
    setStandalone(isStandaloneDisplay());
    setIsIOS(isIOSSafariBrowser());
    try {
      setDismissed(localStorage.getItem(INSTALL_DISMISSED_KEY) === "1");
    } catch {
      setDismissed(false);
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const visible = shouldShowInstallPrompt({
    dismissed,
    isStandalone: standalone,
    hasNativePrompt: deferred !== null,
    isIOSSafari: isIOS,
  });

  if (!visible) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    setDeferred(null);
    dismiss();
  };

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:left-auto sm:right-4 sm:max-w-sm",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-500",
      )}
      role="dialog"
      aria-label="Add thèque to your home screen"
    >
      <div className="overflow-hidden rounded-2xl border border-amber-300/40 bg-amber-50 px-4 py-3.5 shadow-lg backdrop-blur dark:border-amber-400/15 dark:bg-amber-500/10 sm:px-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-amber-100 ring-1 ring-amber-300/50 dark:bg-amber-500/15 dark:ring-amber-400/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" aria-hidden="true" className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-amber-950 dark:text-amber-100">
              Add thèque to your home screen
            </p>
            {isIOS && !deferred ? (
              <p className="mt-0.5 text-sm text-amber-900/80 dark:text-amber-100/70">
                Tap{" "}
                <Share className="inline size-3.5 -translate-y-px" aria-label="the Share button" />{" "}
                then <span className="font-medium">Add to Home Screen</span>.
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-amber-900/80 dark:text-amber-100/70">
                Open your library in one tap — no app store, no clutter.
              </p>
            )}
            {!isIOS && deferred ? (
              <div className="mt-2.5 flex items-center gap-2">
                <Button size="sm" onClick={install}>
                  <Plus data-icon="inline-start" />
                  Add to Home Screen
                </Button>
                <Button size="sm" variant="ghost" onClick={dismiss}>
                  Not now
                </Button>
              </div>
            ) : null}
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={dismiss}
            aria-label="Dismiss"
            className="-mr-1.5 -mt-1 shrink-0 text-amber-900/70 dark:text-amber-100/60"
          >
            <X />
          </Button>
        </div>
      </div>
    </div>
  );
}
