/**
 * Live, client-side detection for the finish-setup nudge (ADR 0009).
 *
 * Pure and dependency-injected: it pings a list of known published extension ids
 * via an injected `chromeRuntime` and decides whether the capture extension is
 * absent, installed-but-not-connected, or connected. No dependency on a real
 * `chrome` global or the DOM, so the whole funnel decision is unit-testable.
 */

export type ExtensionState = "absent" | "installed" | "connected";

export type DetectionResult = {
  state: ExtensionState;
  /**
   * The known id that answered the ping — the id the connect handshake targets.
   * Null only when every id was unreachable (`absent`).
   */
  reachableId: string | null;
};

/** ~14 days. Dismissing the nudge snoozes it for this long. */
export const NUDGE_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

type ChromeRuntimeLike = {
  sendMessage: (
    extensionId: string,
    message: unknown,
    callback: (response?: unknown) => void,
  ) => void;
  lastError?: { message?: string };
};

type PingOutcome = "connected" | "installed" | "unreachable";

/**
 * Classify a pong from a *reachable* extension. The current build answers
 * `{ ok: true, type: "theque.pong", connected }`. The published v1.0.0 predates
 * `theque.ping` and answers without a `connected` field — treat that as
 * connected so the existing install base is never false-nagged (ADR 0009).
 */
function classifyReachable(response: unknown): "connected" | "installed" {
  if (
    response &&
    typeof response === "object" &&
    "connected" in response &&
    (response as { connected?: unknown }).connected === false
  ) {
    return "installed";
  }
  return "connected";
}

function pingExtension(
  chromeRuntime: ChromeRuntimeLike,
  extensionId: string,
): Promise<PingOutcome> {
  return new Promise((resolve) => {
    try {
      chromeRuntime.sendMessage(extensionId, { type: "theque.ping" }, (response) => {
        // chrome.runtime.lastError is only valid inside this callback; read it first.
        if (chromeRuntime.lastError) {
          resolve("unreachable");
          return;
        }
        resolve(classifyReachable(response));
      });
    } catch {
      resolve("unreachable");
    }
  });
}

/**
 * Ping every known id and fold the outcomes into one state. Any answer beats
 * "unreachable" (a reachable build counts as installed), and `connected` beats
 * `installed` so a working setup is never nagged.
 */
export async function detectExtensionState({
  chromeRuntime,
  knownIds,
}: {
  chromeRuntime: ChromeRuntimeLike;
  knownIds: readonly string[];
}): Promise<DetectionResult> {
  const outcomes = await Promise.all(
    knownIds.map(async (id) => ({ id, outcome: await pingExtension(chromeRuntime, id) })),
  );

  const connected = outcomes.find((o) => o.outcome === "connected");
  if (connected) return { state: "connected", reachableId: connected.id };

  const installed = outcomes.find((o) => o.outcome === "installed");
  if (installed) return { state: "installed", reachableId: installed.id };

  return { state: "absent", reachableId: null };
}

/**
 * The nudge shows whenever setup is unfinished and no active snooze suppresses
 * it. `connected` is done; a snooze hides any other state until it elapses.
 */
export function shouldShowNudge({
  state,
  snoozedAt,
  now,
}: {
  state: ExtensionState;
  snoozedAt: number | null;
  now: number;
}): boolean {
  if (state === "connected") return false;
  if (snoozedAt != null && now - snoozedAt < NUDGE_SNOOZE_MS) return false;
  return true;
}

/**
 * Only Chromium-family desktop browsers can install the extension and do
 * website→extension messaging. Nagging Firefox, Safari, or any mobile user to
 * install something they physically cannot is the worst outcome — they see
 * nothing.
 */
export function isNudgeEligibleBrowser({
  userAgent,
  chromeRuntime,
}: {
  userAgent: string;
  chromeRuntime: ChromeRuntimeLike | null | undefined;
}): boolean {
  if (!userAgent) return false;
  // No mobile browser can install a desktop Chromium extension.
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(userAgent)) return false;
  // Firefox / Safari can't message a Chrome build from a web page.
  if (/Firefox\//i.test(userAgent)) return false;
  if (!/Chrome\/|Chromium\/|Edg\//i.test(userAgent)) return false;
  // The live ping needs the external-messaging API to actually exist.
  return typeof chromeRuntime?.sendMessage === "function";
}
