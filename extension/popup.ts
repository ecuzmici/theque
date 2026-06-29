import { CATEGORY_HINT_OPTIONS } from "./category-hints.js";
import { collectPageSnapshot, type PageSnapshot } from "./page-snapshot.js";

const STORAGE_KEYS = {
  token: "theque_capture_token",
  baseUrl: "theque_api_base_url",
  email: "theque_connected_email",
} as const;

/** Default production URL — used when no baseUrl is stored (first run, or connect not yet done). */
const THEQUE_APP_URL = "https://theque.app";
const SAVE_BUTTON_LABEL_DEFAULT = "Save to thèque";

type ActiveTab = {
  id: number | undefined;
  url: string;
  title: string;
  domain: string;
  favIconUrl: string;
  /** false for chrome:// and extension pages we can't capture. */
  capturable: boolean;
};

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
  // Honor the stored baseUrl (set by background.ts when the user connects) so localhost
  // dev capture works. Fall back to the default production URL on first run.
  const storedBase = stored[STORAGE_KEYS.baseUrl];
  const baseUrl = typeof storedBase === "string" && storedBase ? storedBase : THEQUE_APP_URL;
  return { token, baseUrl, email };
}

async function getActiveTab(): Promise<ActiveTab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url;
  if (!url) return null;
  let domain = "";
  try {
    domain = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    domain = "";
  }
  const capturable = !url.startsWith("chrome://") && !url.startsWith("chrome-extension://");
  return {
    id: tab.id,
    url,
    title: tab.title?.trim() || domain || "Untitled",
    domain: domain || url,
    favIconUrl: typeof tab.favIconUrl === "string" ? tab.favIconUrl : "",
    capturable,
  };
}

function monogram(tab: ActiveTab): string {
  return (tab.domain || tab.title || "?").charAt(0).toUpperCase();
}

/** Fill the page-context card (favicon + title + domain) for the tab being saved. */
function renderPageCard(tab: ActiveTab | null) {
  const card = $("ks-page-card");
  if (!tab) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  card.classList.toggle("ks-page-card--disabled", !tab.capturable);
  $("ks-page-title").textContent = tab.title;
  $("ks-page-domain").textContent = tab.domain;

  const fav = $("ks-page-favicon");
  fav.innerHTML = "";
  if (tab.capturable && tab.favIconUrl) {
    const img = document.createElement("img");
    img.src = tab.favIconUrl;
    img.alt = "";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    img.addEventListener("error", () => {
      fav.textContent = monogram(tab);
    });
    fav.appendChild(img);
  } else {
    fav.textContent = tab.capturable ? monogram(tab) : "—";
  }
}

async function openConnectPage() {
  await chrome.storage.local.set({ [STORAGE_KEYS.baseUrl]: THEQUE_APP_URL });
  const url = new URL("/settings/extension-connect", THEQUE_APP_URL);
  url.searchParams.set("extensionId", chrome.runtime.id);
  await chrome.tabs.create({ url: url.toString() });
}

document.addEventListener("DOMContentLoaded", async () => {
  const noteEl = $("ks-note") as HTMLTextAreaElement;
  const categoryEl = $("ks-category") as HTMLSelectElement;
  const connectBtn = $("ks-connect-session") as HTMLButtonElement;
  const captureView = $("ks-capture-view");
  const connectView = $("ks-connect-view");
  const saveBtn = $("ks-save") as HTMLButtonElement;

  // Populate shelf-hint dropdown from the shared CATEGORY_HINT_OPTIONS constant
  // so the list here always matches what the capture API validates against.
  categoryEl.innerHTML = '<option value="">Auto detect</option>';
  for (const { value, label } of CATEGORY_HINT_OPTIONS) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    categoryEl.appendChild(opt);
  }

  const activeTab = await getActiveTab();

  const { token, email } = await loadSettings();
  const isConnected = token.startsWith("bmly_");

  // Connected → capture view; first run → focused connect prompt.
  connectBtn.hidden = isConnected;
  captureView.hidden = !isConnected;
  connectView.hidden = isConnected;

  renderPageCard(activeTab);
  if (activeTab && !activeTab.capturable) {
    saveBtn.disabled = true;
  }

  if (!activeTab || !activeTab.capturable) {
    setStatus("This page cannot be captured.", "err");
  } else {
    setStatus(isConnected ? `Connected${email ? ` as ${email}` : ""}.` : "Not connected yet.", "muted");
  }

  connectBtn.addEventListener("click", async () => {
    try {
      await openConnectPage();
      setStatus("Opened thèque to connect this extension.", "muted");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not open connect page.", "err");
    }
  });

  $("ks-open-theque").addEventListener("click", async () => {
    try {
      const { token: tok, baseUrl } = await loadSettings();
      if (tok.startsWith("bmly_")) {
        await chrome.tabs.create({ url: `${baseUrl}/library` });
      } else {
        await openConnectPage();
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not open thèque.", "err");
    }
  });

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    saveBtn.setAttribute("aria-busy", "true");
    try {
      const { token: tok, baseUrl: apiBase } = await loadSettings();
      if (!tok.startsWith("bmly_")) {
        setStatus("Connect your account before saving pages.", "err");
        return;
      }

      const tab = await getActiveTab();
      if (!tab || !tab.capturable) {
        setStatus("This page cannot be captured (restricted URL).", "err");
        return;
      }

      let captureSnapshot: PageSnapshot | null = null;
      if (typeof tab.id === "number") {
        try {
          const [injection] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: collectPageSnapshot,
          });
          captureSnapshot = (injection?.result as PageSnapshot | undefined) ?? null;
        } catch {
          captureSnapshot = null;
        }
      }

      const note = noteEl.value.trim();
      const categoryHint = categoryEl.value.trim();
      const res = await fetch(`${apiBase}/api/capture`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tok}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: tab.url,
          ...(note ? { note } : {}),
          ...(categoryHint ? { category_hint: categoryHint } : {}),
          ...(captureSnapshot ? { capture_snapshot: captureSnapshot } : {}),
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
      setStatus("Network error. Check the API URL and your connection.", "err");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = SAVE_BUTTON_LABEL_DEFAULT;
      saveBtn.removeAttribute("aria-busy");
    }
  });
});
