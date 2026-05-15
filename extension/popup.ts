const STORAGE_KEYS = {
  token: "keepswell_capture_token",
  baseUrl: "keepswell_api_base_url",
} as const;

const DEFAULT_BASE_URL = "http://localhost:3000";

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

function normalizeBaseUrl(raw: string): string {
  const t = raw.trim().replace(/\/+$/, "");
  if (!t) return DEFAULT_BASE_URL;
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error("invalid protocol");
    }
    return `${u.protocol}//${u.host}`;
  } catch {
    throw new Error("Enter a valid http(s) URL");
  }
}

async function loadSettings(): Promise<{ token: string; baseUrl: string }> {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.token, STORAGE_KEYS.baseUrl]);
  const token = typeof stored[STORAGE_KEYS.token] === "string" ? stored[STORAGE_KEYS.token] : "";
  let baseUrl = typeof stored[STORAGE_KEYS.baseUrl] === "string" ? stored[STORAGE_KEYS.baseUrl] : "";
  try {
    baseUrl = normalizeBaseUrl(baseUrl || DEFAULT_BASE_URL);
  } catch {
    baseUrl = DEFAULT_BASE_URL;
  }
  return { token, baseUrl };
}

async function persistSettings(token: string, baseUrlRaw: string) {
  const baseUrl = normalizeBaseUrl(baseUrlRaw);
  await chrome.storage.local.set({
    [STORAGE_KEYS.token]: token.trim(),
    [STORAGE_KEYS.baseUrl]: baseUrl,
  });
  return baseUrl;
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
  const baseEl = $("ks-base-url") as HTMLInputElement;
  const tokenEl = $("ks-token") as HTMLInputElement;

  const { token, baseUrl } = await loadSettings();
  baseEl.value = baseUrl;
  tokenEl.value = token;
  setStatus("Ready.", "muted");

  $("ks-save-settings").addEventListener("click", async () => {
    try {
      const nextBase = await persistSettings(tokenEl.value, baseEl.value);
      baseEl.value = nextBase;
      setStatus("Settings saved.", "ok");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not save settings.", "err");
    }
  });

  $("ks-save").addEventListener("click", async () => {
    const saveBtn = $("ks-save") as HTMLButtonElement;
    saveBtn.disabled = true;
    try {
      const { token: tok, baseUrl: apiBase } = await loadSettings();
      if (!tok.startsWith("bmly_")) {
        setStatus("Add your capture token in Settings (starts with bmly_).", "err");
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
        setStatus(`Save failed (${res.status}): ${code}`, "err");
        return;
      }

      const created = body?.created !== false;
      setStatus(created ? "Saved to Keepswell." : "Already in your library.", "ok");
    } catch {
      setStatus("Network error — check API URL and connection.", "err");
    } finally {
      saveBtn.disabled = false;
    }
  });
});
