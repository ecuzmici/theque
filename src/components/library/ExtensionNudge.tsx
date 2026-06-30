"use client";

/**
 * Finish-setup nudge (ADR 0009). A self-clearing banner at the top of the
 * Library that walks the user through the two-stage funnel:
 *   absent    → "Add to Chrome" (install)
 *   installed → "Connect" (mint + link a capture token, in place)
 *   connected → nothing
 *
 * Detection is a live client-side ping to the known published extension ids,
 * re-run on focus / visibility change so the banner clears the instant the user
 * returns from installing or connecting — no reload. Only Chromium-family
 * desktop browsers see it; dismissing snoozes it for ~14 days.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { Puzzle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { connectChromeExtension } from "@/lib/extension-connect-client";
import {
  detectExtensionState,
  isNudgeEligibleBrowser,
  shouldShowNudge,
  type ExtensionState,
} from "@/lib/extension-detect";
import { CHROME_STORE_URL, KNOWN_EXTENSION_IDS } from "@/lib/extension-identity";
import { createClient } from "@/lib/supabase/client";

const SNOOZE_STORAGE_KEY = "theque_nudge_snoozed_at";

type ChromeRuntimeLike = {
  sendMessage: (
    extensionId: string,
    message: unknown,
    callback: (response?: unknown) => void,
  ) => void;
  lastError?: { message?: string };
};

function getChromeRuntime(): ChromeRuntimeLike | null {
  return (globalThis as { chrome?: { runtime?: ChromeRuntimeLike } }).chrome?.runtime ?? null;
}

function readSnoozedAt(): number | null {
  try {
    const raw = window.localStorage.getItem(SNOOZE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

type ConnectStatus = "idle" | "connecting" | "error";

export function ExtensionNudge() {
  const [state, setState] = useState<ExtensionState | null>(null);
  const [reachableId, setReachableId] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [connectStatus, setConnectStatus] = useState<ConnectStatus>("idle");
  const [connectError, setConnectError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  const runDetect = useCallback(async () => {
    const chromeRuntime = getChromeRuntime();
    if (!chromeRuntime) return;
    // Non-Chromium / mobile users can't install the extension — show nothing.
    if (!isNudgeEligibleBrowser({ userAgent: navigator.userAgent, chromeRuntime })) return;

    const result = await detectExtensionState({ chromeRuntime, knownIds: KNOWN_EXTENSION_IDS });
    if (!mountedRef.current) return;
    setState(result.state);
    setReachableId(result.reachableId);
    // Read the snooze fresh (localStorage is its source of truth) and decide
    // visibility here rather than during render, keeping render pure.
    setVisible(
      shouldShowNudge({ state: result.state, snoozedAt: readSnoozedAt(), now: Date.now() }),
    );
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void runDetect();

    // Re-detect whenever the user comes back to the tab, so installing or
    // connecting clears the banner without a manual reload.
    const onFocus = () => void runDetect();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void runDetect();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [runDetect]);

  const handleDismiss = useCallback(() => {
    try {
      window.localStorage.setItem(SNOOZE_STORAGE_KEY, String(Date.now()));
    } catch {
      /* best-effort: if storage is unavailable the banner simply stays */
    }
    setVisible(false);
  }, []);

  const handleConnect = useCallback(async () => {
    const chromeRuntime = getChromeRuntime();
    if (!chromeRuntime || !reachableId) {
      setConnectStatus("error");
      setConnectError("Couldn't reach the extension. Reload it in Chrome and try again.");
      return;
    }
    setConnectStatus("connecting");
    setConnectError(null);

    // The signed-in Profile's email, read client-side from the Supabase session.
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!mountedRef.current) return;
    const email = user?.email;
    if (!email) {
      setConnectStatus("error");
      setConnectError("Couldn't read your account email. Refresh the page and try again.");
      return;
    }

    const result = await connectChromeExtension({
      extensionId: reachableId,
      baseUrl: window.location.origin,
      email,
      chromeRuntime,
    });
    if (!mountedRef.current) return;

    if (result.ok) {
      await runDetect(); // flips state to "connected" → banner clears
      if (mountedRef.current) setConnectStatus("idle");
      return;
    }

    setConnectStatus("error");
    setConnectError(
      result.code === "extension_unreachable"
        ? "Couldn't reach the extension. Reload it in Chrome and try again."
        : "Couldn't connect the extension. Please try again.",
    );
  }, [reachableId, runDetect]);

  if (state === null || !visible) return null;

  const connecting = connectStatus === "connecting";

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-accent/50 px-4 py-3">
      <div className="flex items-center gap-3">
        <Puzzle className="size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <div className="text-sm text-foreground">
          {state === "installed" ? (
            <p>
              <span className="font-semibold">Almost there</span> — connect the extension to
              start capturing.
            </p>
          ) : (
            <p>
              <span className="font-semibold">Finish setting up thèque.</span> One click on any
              tab files it on the right shelf — your library fills itself.
            </p>
          )}
          {connectStatus === "error" && connectError ? (
            <p className="mt-1 text-destructive" role="status">
              {connectError}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {state === "installed" ? (
          <Button
            type="button"
            size="sm"
            disabled={connecting}
            onClick={() => void handleConnect()}
          >
            {connecting ? "Connecting…" : connectStatus === "error" ? "Retry" : "Connect"}
          </Button>
        ) : (
          <Button
            nativeButton={false}
            size="sm"
            render={<Link href={CHROME_STORE_URL} target="_blank" rel="noreferrer" />}
          >
            Add to Chrome
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="Dismiss"
          onClick={handleDismiss}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
