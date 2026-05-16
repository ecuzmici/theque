import { describe, expect, it, vi } from "vitest";

import { connectChromeExtension } from "./extension-connect-client";

describe("connectChromeExtension", () => {
  it("mints a capture token and sends it to the requested extension", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: "bmly_from_session" }),
    });
    const sendMessage = vi.fn((_extensionId, _message, callback) => {
      callback({ ok: true });
    });

    const result = await connectChromeExtension({
      extensionId: "abc123",
      baseUrl: "https://theque.app",
      email: "user@example.com",
      fetchImpl,
      chromeRuntime: { sendMessage },
    });

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith("/api/capture-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Chrome extension" }),
    });
    expect(sendMessage).toHaveBeenCalledWith(
      "abc123",
      {
        type: "theque.captureToken.connected",
        token: "bmly_from_session",
        baseUrl: "https://theque.app",
        email: "user@example.com",
      },
      expect.any(Function),
    );
  });
});
