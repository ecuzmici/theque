/**
 * MV3 service worker.
 */
const CONNECT_STORAGE_KEYS = {
  token: "theque_capture_token",
  baseUrl: "theque_api_base_url",
  email: "theque_connected_email",
} as const;

type ExtensionConnectMessage = {
  type: "theque.captureToken.connected";
  token: string;
  baseUrl: string;
  email: string;
};

function isPingMessage(message: unknown): boolean {
  return Boolean(
    message &&
      typeof message === "object" &&
      (message as { type?: unknown }).type === "theque.ping",
  );
}

function isValidConnectMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
): message is ExtensionConnectMessage {
  if (!message || typeof message !== "object") return false;
  const candidate = message as Partial<ExtensionConnectMessage>;
  if (candidate.type !== "theque.captureToken.connected") return false;
  if (typeof candidate.token !== "string" || !candidate.token.startsWith("bmly_")) return false;
  if (typeof candidate.baseUrl !== "string") return false;
  if (typeof candidate.email !== "string" || !candidate.email.trim()) return false;

  try {
    const parsed = new URL(candidate.baseUrl);
    const senderOrigin = sender.url ? new URL(sender.url).origin : "";
    const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    const allowedProtocol = parsed.protocol === "https:" || (parsed.protocol === "http:" && isLocalhost);
    return allowedProtocol && parsed.origin === senderOrigin;
  } catch {
    return false;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  /* no-op */
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  // Finish-setup nudge liveness probe. Reports whether a bmly_ capture token is
  // stored — no secret leaves the extension, only the boolean connect state.
  // externally_connectable already restricts which origins can reach us.
  if (isPingMessage(message)) {
    void chrome.storage.local.get(CONNECT_STORAGE_KEYS.token).then(
      (stored) => {
        const token = stored?.[CONNECT_STORAGE_KEYS.token];
        const connected = typeof token === "string" && token.startsWith("bmly_");
        sendResponse({ ok: true, type: "theque.pong", connected });
      },
      () => sendResponse({ ok: true, type: "theque.pong", connected: false }),
    );
    return true;
  }

  if (!isValidConnectMessage(message, sender)) {
    sendResponse({ ok: false, code: "invalid_message" });
    return false;
  }

  void chrome.storage.local
    .set({
      [CONNECT_STORAGE_KEYS.token]: message.token.trim(),
      [CONNECT_STORAGE_KEYS.baseUrl]: new URL(message.baseUrl).origin,
      [CONNECT_STORAGE_KEYS.email]: message.email.trim(),
    })
    .then(
      () => sendResponse({ ok: true }),
      () => sendResponse({ ok: false, code: "storage_failed" }),
    );

  return true;
});
