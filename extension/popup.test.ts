import { beforeEach, describe, expect, it, vi } from "vitest";

function setPopupHtml() {
  document.body.innerHTML = `
    <main class="ks-popup">
      <header class="ks-header">
        <div>
          <h1>thèque</h1>
          <p class="ks-tagline">Save this page</p>
        </div>
        <button type="button" id="ks-open-theque" class="ks-link-btn">Open thèque</button>
      </header>
      <section class="ks-capture-card">
        <div>
          <p id="ks-tab-title" class="ks-tab-title">Current tab</p>
          <p id="ks-tab-url" class="ks-tab-url"></p>
        </div>
        <p id="ks-status" class="ks-status ks-status--muted" role="status"></p>
        <button type="button" id="ks-connect-session" class="ks-btn ks-btn-secondary">Connect to thèque</button>
      </section>
      <label class="ks-label" for="ks-category">Category hint <span class="ks-optional">(optional)</span></label>
      <select id="ks-category" class="ks-input ks-select">
        <option value="">Auto</option>
        <option value="books">Books</option>
        <option value="movies_and_tv">Watch</option>
      </select>
      <label class="ks-label" for="ks-note">Note <span class="ks-optional">(optional)</span></label>
      <textarea id="ks-note" class="ks-input ks-textarea"></textarea>
      <button type="button" id="ks-save" class="ks-btn ks-btn-primary">Save to thèque</button>
      <details class="ks-settings"><summary>Settings</summary></details>
    </main>
  `;
}

type LoadPopupOptions = { expectRestrictedCard?: boolean };

async function loadPopup(options?: LoadPopupOptions) {
  await import("./popup.ts");
  document.dispatchEvent(new Event("DOMContentLoaded"));
  await vi.waitFor(() => {
    const title = document.getElementById("ks-tab-title")?.textContent ?? "";
    if (options?.expectRestrictedCard) {
      expect(title).toBe("Restricted page");
    } else {
      expect(title).toBe("Example Story");
    }
  });
}

describe("extension popup", () => {
  let storageGet: ReturnType<typeof vi.fn>;
  let storageSet: ReturnType<typeof vi.fn>;
  let tabsCreate: ReturnType<typeof vi.fn>;
  let tabsQuery: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    setPopupHtml();
    storageGet = vi.fn().mockResolvedValue({
      theque_capture_token: "bmly_test_secret",
      theque_connected_email: "user@example.com",
    });
    storageSet = vi.fn().mockResolvedValue(undefined);
    tabsCreate = vi.fn().mockResolvedValue(undefined);
    tabsQuery = vi.fn().mockResolvedValue([
      { url: "https://example.com/story", title: "Example Story" },
    ]);
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue({ created: true }),
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("chrome", {
      runtime: { id: "extension-id" },
      storage: { local: { get: storageGet, set: storageSet } },
      tabs: { create: tabsCreate, query: tabsQuery },
    });
  });

  it("posts category_hint when a shelf category is selected", async () => {
    await loadPopup();

    const category = document.getElementById("ks-category") as HTMLSelectElement;
    category.value = "movies_and_tv";
    document.getElementById("ks-save")?.click();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "https://theque.app/api/capture",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            url: "https://example.com/story",
            category_hint: "movies_and_tv",
            source: "chrome_extension",
          }),
        }),
      );
    });
  });

  it("omits category_hint when Auto is selected", async () => {
    await loadPopup();

    document.getElementById("ks-save")?.click();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "https://theque.app/api/capture",
        expect.objectContaining({
          body: JSON.stringify({
            url: "https://example.com/story",
            source: "chrome_extension",
          }),
        }),
      );
    });
  });

  it("includes note in capture body when provided", async () => {
    await loadPopup();

    const note = document.getElementById("ks-note") as HTMLTextAreaElement;
    note.value = "  remember this  ";
    document.getElementById("ks-save")?.click();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "https://theque.app/api/capture",
        expect.objectContaining({
          body: JSON.stringify({
            url: "https://example.com/story",
            note: "remember this",
            source: "chrome_extension",
          }),
        }),
      );
    });
  });

  it("opens the library from Open thèque when connected", async () => {
    await loadPopup();

    document.getElementById("ks-open-theque")?.click();

    await vi.waitFor(() => {
      expect(tabsCreate).toHaveBeenCalledWith({ url: "https://theque.app/library" });
    });
  });

  it("opens extension connect from Open thèque when disconnected", async () => {
    storageGet.mockResolvedValue({});
    await loadPopup();

    document.getElementById("ks-open-theque")?.click();

    await vi.waitFor(() => {
      expect(tabsCreate).toHaveBeenCalledWith({
        url: "https://theque.app/settings/extension-connect?extensionId=extension-id",
      });
    });
  });

  it("hydrates capture card with hostname for active tab", async () => {
    await loadPopup();

    const title = document.getElementById("ks-tab-title");
    const urlLine = document.getElementById("ks-tab-url");

    expect(title?.textContent).toBe("Example Story");
    expect(urlLine?.textContent).toBe("example.com");
  });

  it("shows restricted messaging when active tab URL is not capturable", async () => {
    tabsQuery.mockResolvedValue([{ url: "chrome://newtab/", title: "New Tab" }]);
    await loadPopup({ expectRestrictedCard: true });

    expect(document.getElementById("ks-tab-title")?.textContent).toBe("Restricted page");
    expect(document.getElementById("ks-tab-url")?.textContent).toBe("This page cannot be captured.");
  });

  it("sets restricted URL error when saving on a restricted page", async () => {
    tabsQuery.mockResolvedValue([{ url: "chrome://newtab/", title: "New Tab" }]);
    await loadPopup({ expectRestrictedCard: true });

    document.getElementById("ks-save")?.click();

    await vi.waitFor(() => {
      expect(fetchMock).not.toHaveBeenCalled();
      expect(document.getElementById("ks-status")?.textContent).toBe(
        "This page cannot be captured (restricted URL).",
      );
    });
  });

  it("shows saving state while capture fetch is pending, then restores label and aria", async () => {
    let settlePending!: (value: Awaited<ReturnType<typeof fetchMock>>) => void;
    const pending = new Promise<Awaited<ReturnType<typeof fetchMock>>>((resolve) => {
      settlePending = resolve;
    });
    fetchMock.mockReturnValue(pending);

    await loadPopup();
    document.getElementById("ks-save")?.click();

    const saveBtn = document.getElementById("ks-save") as HTMLButtonElement;

    await vi.waitFor(() => {
      expect(saveBtn.textContent).toBe("Saving…");
      expect(saveBtn.disabled).toBe(true);
      expect(saveBtn.getAttribute("aria-busy")).toBe("true");
    });

    settlePending({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue({ created: true }),
    });

    await vi.waitFor(() => {
      expect(saveBtn.textContent).toBe("Save to thèque");
      expect(saveBtn.disabled).toBe(false);
      expect(saveBtn.hasAttribute("aria-busy")).toBe(false);
    });

    await vi.waitFor(() => {
      expect(document.getElementById("ks-status")?.textContent).toBe("Saved to thèque.");
    });
  });
});
