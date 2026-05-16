import type { CaptureTokenCreateResponseBody } from "@/lib/types/api";

type ChromeRuntimeLike = {
  sendMessage: (
    extensionId: string,
    message: unknown,
    callback: (response?: unknown) => void,
  ) => void;
  lastError?: { message?: string };
};

type ConnectResult = { ok: true } | { ok: false; code: string };

function isSuccessResponse(response: unknown): response is { ok: true } {
  return Boolean(response && typeof response === "object" && (response as { ok?: unknown }).ok === true);
}

export async function connectChromeExtension({
  extensionId,
  baseUrl,
  email,
  fetchImpl = fetch,
  chromeRuntime,
}: {
  extensionId: string;
  baseUrl: string;
  email: string;
  fetchImpl?: typeof fetch;
  chromeRuntime: ChromeRuntimeLike;
}): Promise<ConnectResult> {
  const res = await fetchImpl("/api/capture-tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Chrome extension" }),
  });

  if (!res.ok) {
    return { ok: false, code: "token_create_failed" };
  }

  const body = (await res.json()) as Partial<CaptureTokenCreateResponseBody>;
  if (typeof body.token !== "string" || !body.token.startsWith("bmly_")) {
    return { ok: false, code: "invalid_token_response" };
  }

  return new Promise((resolve) => {
    chromeRuntime.sendMessage(
      extensionId,
      {
        type: "theque.captureToken.connected",
        token: body.token,
        baseUrl,
        email,
      },
      (response) => {
        const runtimeError = chromeRuntime.lastError;
        if (runtimeError) {
          resolve({ ok: false, code: "extension_unreachable" });
          return;
        }
        resolve(isSuccessResponse(response) ? { ok: true } : { ok: false, code: "extension_rejected" });
      },
    );
  });
}
