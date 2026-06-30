import { describe, expect, it } from "vitest";

import {
  detectExtensionState,
  isNudgeEligibleBrowser,
  shouldShowNudge,
  NUDGE_SNOOZE_MS,
} from "./extension-detect";

const CHROME = "chrome_id";
const EDGE = "edge_id";

type Entry = { response?: unknown; lastError?: { message?: string } };

/**
 * A fake chrome.runtime whose external-message behaviour is keyed by id, mirroring
 * Chrome: lastError is set only for the duration of the matching callback.
 */
function fakeRuntime(byId: Record<string, Entry>) {
  const runtime = {
    lastError: undefined as { message?: string } | undefined,
    sendMessage(id: string, _message: unknown, cb: (response?: unknown) => void) {
      const entry = byId[id];
      runtime.lastError = entry?.lastError;
      cb(entry?.response);
      runtime.lastError = undefined;
    },
  };
  return runtime;
}

const UNREACHABLE: Entry = { lastError: { message: "Could not establish connection." } };
const pong = (connected: boolean): Entry => ({
  response: { ok: true, type: "theque.pong", connected },
});

describe("detectExtensionState", () => {
  it("resolves absent when every known id is unreachable", async () => {
    const result = await detectExtensionState({
      chromeRuntime: fakeRuntime({ [CHROME]: UNREACHABLE, [EDGE]: UNREACHABLE }),
      knownIds: [CHROME, EDGE],
    });
    expect(result).toEqual({ state: "absent", reachableId: null });
  });

  it("resolves installed when a reachable extension reports connected:false", async () => {
    const result = await detectExtensionState({
      chromeRuntime: fakeRuntime({ [CHROME]: pong(false) }),
      knownIds: [CHROME],
    });
    expect(result).toEqual({ state: "installed", reachableId: CHROME });
  });

  it("resolves connected when a reachable extension reports connected:true", async () => {
    const result = await detectExtensionState({
      chromeRuntime: fakeRuntime({ [CHROME]: pong(true) }),
      knownIds: [CHROME],
    });
    expect(result).toEqual({ state: "connected", reachableId: CHROME });
  });

  it("treats a reachable extension that answers without a connected field as connected", async () => {
    // The published v1.0.0 predates theque.ping and rejects it with this shape.
    const result = await detectExtensionState({
      chromeRuntime: fakeRuntime({
        [CHROME]: { response: { ok: false, code: "invalid_message" } },
      }),
      knownIds: [CHROME],
    });
    expect(result).toEqual({ state: "connected", reachableId: CHROME });
  });

  it("resolves present (installed) when only one of several ids answers", async () => {
    const result = await detectExtensionState({
      chromeRuntime: fakeRuntime({ [CHROME]: UNREACHABLE, [EDGE]: pong(false) }),
      knownIds: [CHROME, EDGE],
    });
    expect(result).toEqual({ state: "installed", reachableId: EDGE });
  });

  it("prefers connected over installed across ids", async () => {
    const result = await detectExtensionState({
      chromeRuntime: fakeRuntime({ [CHROME]: pong(false), [EDGE]: pong(true) }),
      knownIds: [CHROME, EDGE],
    });
    expect(result).toEqual({ state: "connected", reachableId: EDGE });
  });
});

describe("shouldShowNudge", () => {
  const now = 1_700_000_000_000;

  it("never shows once connected", () => {
    expect(shouldShowNudge({ state: "connected", snoozedAt: null, now })).toBe(false);
  });

  it("shows when absent and never snoozed", () => {
    expect(shouldShowNudge({ state: "absent", snoozedAt: null, now })).toBe(true);
  });

  it("shows when installed and never snoozed", () => {
    expect(shouldShowNudge({ state: "installed", snoozedAt: null, now })).toBe(true);
  });

  it("hides while a snooze is still active", () => {
    expect(
      shouldShowNudge({ state: "absent", snoozedAt: now - (NUDGE_SNOOZE_MS - 1), now }),
    ).toBe(false);
  });

  it("shows again once the snooze has elapsed", () => {
    expect(shouldShowNudge({ state: "absent", snoozedAt: now - NUDGE_SNOOZE_MS, now })).toBe(true);
  });

  it("a stale snooze never resurrects the connected state", () => {
    expect(
      shouldShowNudge({ state: "connected", snoozedAt: now - NUDGE_SNOOZE_MS, now }),
    ).toBe(false);
  });
});

describe("isNudgeEligibleBrowser", () => {
  const runtime = { sendMessage() {} };
  const CHROME_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const EDGE_UA = `${CHROME_UA} Edg/120.0.0.0`;
  const FIREFOX_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0";
  const SAFARI_UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
  const ANDROID_UA =
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
  const IPHONE_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

  it("allows Chromium desktop with external messaging", () => {
    expect(isNudgeEligibleBrowser({ userAgent: CHROME_UA, chromeRuntime: runtime })).toBe(true);
  });

  it("allows Edge desktop", () => {
    expect(isNudgeEligibleBrowser({ userAgent: EDGE_UA, chromeRuntime: runtime })).toBe(true);
  });

  it("rejects Firefox", () => {
    expect(isNudgeEligibleBrowser({ userAgent: FIREFOX_UA, chromeRuntime: runtime })).toBe(false);
  });

  it("rejects Safari", () => {
    expect(isNudgeEligibleBrowser({ userAgent: SAFARI_UA, chromeRuntime: runtime })).toBe(false);
  });

  it("rejects Android Chrome (mobile)", () => {
    expect(isNudgeEligibleBrowser({ userAgent: ANDROID_UA, chromeRuntime: runtime })).toBe(false);
  });

  it("rejects iPhone", () => {
    expect(isNudgeEligibleBrowser({ userAgent: IPHONE_UA, chromeRuntime: runtime })).toBe(false);
  });

  it("rejects Chromium desktop without the messaging API", () => {
    expect(isNudgeEligibleBrowser({ userAgent: CHROME_UA, chromeRuntime: null })).toBe(false);
  });
});
