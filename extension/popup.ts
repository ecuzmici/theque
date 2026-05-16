const STORAGE_KEYS = {
  token: "theque_capture_token",
  baseUrl: "theque_api_base_url",
  email: "theque_connected_email",
} as const;

const THEQUE_APP_URL = "https://theque.app";

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

function setStatus(msg: string, kind: "muted" | "ok" | "err") {
  const el = $("ks-status") as HTMLParagraphElement;
  el.textContent = msg;
  el.classList.remove("ks-status--muted", "ks-status--ok", "ks-status--err");
  el.classList.add(
    kind === "ok" ? "ks-status--ok" : kind === "err" ? "ks-status--err" : "ks-status--muted",
  );
}

async function loadSettings(): Promise<{ token: string; baseUrl: string; email: string }> {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.token,
    STORAGE_KEYS.baseUrl,
    STORAGE_KEYS.email,
  ]);
  const token = typeof stored[STORAGE_KEYS.token] === "string" ? stored[STORAGE_KEYS.token] : "";
  const email = typeof stored[STORAGE_KEYS.email] === "string" ? stored[STORAGE_KEYS.email] : "";
  return { token, baseUrl: THEQUE_APP_URL, email };
}

async function getActiveTabUrl(): Promise<string | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url;
  if (!url || url.startsWith("chrome://") || url.startsWith("chrome-extension://")) {
    return null;
  }
  return url;
}

document.addEventListener("DOMContentLoaded", async () => {
  const noteEl = $("ks-note") as HTMLTextAreaElement;

  const { token, email } = await loadSettings();
  setStatus(token ? `Connected${email ? ` as ${email}` : ""}.` : "Connect to thèque to save pages.", token ? "ok" : "muted");

  $("ks-connect-session").addEventListener("click", async () => {
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.baseUrl]: THEQUE_APP_URL });
      const url = new URL("/settings/extension-connect", THEQUE_APP_URL);
      url.searchParams.set("extensionId", chrome.runtime.id);
      await chrome.tabs.create({ url: url.toString() });
      setStatus("Opened thèque to connect this extension.", "muted");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not open connect page.", "err");
    }
  });

  $("ks-save").addEventListener("click", async () => {
    const saveBtn = $("ks-save") as HTMLButtonElement;
    saveBtn.disabled = true;
    try {
      const { token: tok, baseUrl: apiBase } = await loadSettings();
      if (!tok.startsWith("bmly_")) {
        setStatus("Connect to thèque before saving pages.", "err");
        return;
      }

      const tabUrl = await getActiveTabUrl();
      if (!tabUrl) {
        setStatus("This page cannot be captured (restricted URL).", "err");
        return;
      }

      const note = noteEl.value.trim();
      const res = await fetch(`${apiBase}/api/capture`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tok}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: tabUrl,
          ...(note ? { note } : {}),
          source: "chrome_extension",
        }),
      });

      const body = (await res.json().catch(() => null)) as { code?: string; created?: boolean } | null;

      if (!res.ok) {
        const code = body && typeof body.code === "string" ? body.code : res.statusText;
        if (res.status === 401) {
          setStatus("Connection expired or revoked. Reconnect to thèque.", "err");
          return;
        }
        setStatus(`Save failed (${res.status}): ${code}`, "err");
        return;
      }

      const created = body?.created !== false;
      setStatus(created ? "Saved to thèque." : "Already in your library.", "ok");
    } catch {
      setStatus("Network error — check API URL and connection.", "err");
    } finally {
      saveBtn.disabled = false;
    }
  });
});
