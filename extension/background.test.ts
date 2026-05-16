import { beforeEach, describe, expect, it, vi } from "vitest";

type ExternalListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | void;

describe("extension connect messages", () => {
  let externalListener: ExternalListener | null;
  let storageSet: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    externalListener = null;
    storageSet = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal("chrome", {
      runtime: {
        onInstalled: { addListener: vi.fn() },
        onMessageExternal: {
          addListener: vi.fn((listener: ExternalListener) => {
            externalListener = listener;
          }),
        },
      },
      storage: {
        local: {
          set: storageSet,
        },
      },
    });

    await import("./background.ts");
  });

  it("stores a capture token received from the logged-in web app", () => {
    expect(externalListener).toBeTypeOf("function");

    const sendResponse = vi.fn();
    const keepChannelOpen = externalListener?.(
      {
        type: "theque.captureToken.connected",
        token: "bmly_test_secret",
        baseUrl: "https://theque.app",
        email: "user@example.com",
      },
      { url: "https://theque.app/settings/extension-connect" },
      sendResponse,
    );

    expect(keepChannelOpen).toBe(true);
    expect(storageSet).toHaveBeenCalledWith({
      theque_capture_token: "bmly_test_secret",
      theque_api_base_url: "https://theque.app",
      theque_connected_email: "user@example.com",
    });
  });

  it("rejects a base URL that does not match the sender origin", () => {
    const sendResponse = vi.fn();

    const keepChannelOpen = externalListener?.(
      {
        type: "theque.captureToken.connected",
        token: "bmly_test_secret",
        baseUrl: "https://evil.example",
      },
      { url: "https://theque.app/settings/extension-connect" },
      sendResponse,
    );

    expect(keepChannelOpen).toBe(false);
    expect(storageSet).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, code: "invalid_message" });
  });
});
