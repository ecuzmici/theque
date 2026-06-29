import { beforeEach, describe, expect, it, vi } from "vitest";

function setPopupHtml() {
  // Mirrors popup.html — options are populated at runtime by popup.ts from category-hints.ts
  document.body.innerHTML = `
    <main class="ks-popup">
      <section id="ks-capture-view" class="ks-capture" hidden>
        <header class="ks-header">
          <h1 class="ks-brand">thèque</h1>
          <button type="button" id="ks-open-theque" class="ks-link-btn">Open library</button>
        </header>
        <p id="ks-status" class="ks-status ks-status--muted" role="status"></p>
        <div id="ks-page-card" class="ks-page-card" hidden>
          <div id="ks-page-favicon" class="ks-page-favicon" aria-hidden="true"></div>
          <div class="ks-page-meta">
            <div id="ks-page-title" class="ks-page-title"></div>
            <div id="ks-page-domain" class="ks-page-domain"></div>
          </div>
        </div>
        <div class="ks-field-group">
          <label class="ks-label" for="ks-category">Shelf hint <span class="ks-optional">(optional)</span></label>
          <select id="ks-category" class="ks-input ks-select">
            <option value="">Auto detect</option>
          </select>
        </div>
        <div class="ks-field-group">
          <label class="ks-label" for="ks-note">Note <span class="ks-optional">(optional)</span></label>
          <textarea id="ks-note" class="ks-input ks-textarea"></textarea>
        </div>
        <button type="button" id="ks-save" class="ks-btn ks-btn-primary">Save to thèque</button>
      </section>
      <section id="ks-connect-view" class="ks-connect" hidden>
        <h1 class="ks-brand ks-brand--lg">thèque</h1>
        <p class="ks-connect-copy">Your visual taste library. Connect your account to start saving pages from anywhere.</p>
        <button type="button" id="ks-connect-session" class="ks-btn ks-btn-primary">Connect your account</button>
      </section>
    </main>
  `;
}

async function loadPopup() {
  await import("./popup.ts");
  document.dispatchEvent(new Event("DOMContentLoaded"));
  await vi.waitFor(() => {
    expect(document.getElementById("ks-status")?.textContent).not.toBe("");
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
      { id: 42, url: "https://example.com/story", title: "Example Story" },
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
      scripting: { executeScript: vi.fn().mockResolvedValue([{ result: null }]) },
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

  it("renders the capture view with a populated page-context card", async () => {
    await loadPopup();

    expect(document.getElementById("ks-open-theque")?.textContent).toBe("Open library");
    expect((document.getElementById("ks-capture-view") as HTMLElement).hidden).toBe(false);
    expect((document.getElementById("ks-connect-view") as HTMLElement).hidden).toBe(true);
    expect(document.querySelector(".ks-settings")).toBeNull();

    // Page-context card shows what's about to be saved, not generic "Current tab" copy.
    const card = document.getElementById("ks-page-card") as HTMLElement;
    expect(card.hidden).toBe(false);
    expect(document.getElementById("ks-page-title")?.textContent).toBe("Example Story");
    expect(document.getElementById("ks-page-domain")?.textContent).toBe("example.com");
    expect(document.body.textContent).not.toContain("Current tab");

    expect(document.querySelector("label[for='ks-category']")?.textContent).toContain("Shelf hint");
    expect((document.querySelector("#ks-category option") as HTMLOptionElement).textContent).toBe(
      "Auto detect",
    );
  });

  it("shows the connect view and hides the capture view on first run", async () => {
    storageGet.mockResolvedValue({});
    await loadPopup();

    expect((document.getElementById("ks-connect-view") as HTMLElement).hidden).toBe(false);
    expect((document.getElementById("ks-capture-view") as HTMLElement).hidden).toBe(true);
  });

  it("hides the connect action while connected", async () => {
    await loadPopup();

    expect((document.getElementById("ks-connect-session") as HTMLButtonElement).hidden).toBe(true);
  });

  it("shows the connect action when disconnected", async () => {
    storageGet.mockResolvedValue({});
    await loadPopup();

    expect(document.getElementById("ks-status")?.textContent).toBe("Not connected yet.");
    const connectButton = document.getElementById("ks-connect-session") as HTMLButtonElement;
    expect(connectButton.hidden).toBe(false);
    expect(connectButton.textContent).toBe("Connect your account");
  });

  it("opens the library from Open library when connected", async () => {
    await loadPopup();

    document.getElementById("ks-open-theque")?.click();

    await vi.waitFor(() => {
      expect(tabsCreate).toHaveBeenCalledWith({ url: "https://theque.app/library" });
    });
  });

  it("opens extension connect from Open library when disconnected", async () => {
    storageGet.mockResolvedValue({});
    await loadPopup();

    document.getElementById("ks-open-theque")?.click();

    await vi.waitFor(() => {
      expect(tabsCreate).toHaveBeenCalledWith({
        url: "https://theque.app/settings/extension-connect?extensionId=extension-id",
      });
    });
  });

  it("shows restricted messaging when active tab URL is not capturable", async () => {
    tabsQuery.mockResolvedValue([{ url: "chrome://newtab/", title: "New Tab" }]);
    await loadPopup();

    expect(document.getElementById("ks-status")?.textContent).toBe("This page cannot be captured.");
  });

  it("disables saving on a restricted page", async () => {
    tabsQuery.mockResolvedValue([{ url: "chrome://newtab/", title: "New Tab" }]);
    await loadPopup();

    const saveBtn = document.getElementById("ks-save") as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
    // A disabled control never fires its click handler, so no capture is attempted.
    saveBtn.click();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses stored baseUrl for capture when set (enables localhost dev capture)", async () => {
    storageGet.mockResolvedValue({
      theque_capture_token: "bmly_test_secret",
      theque_api_base_url: "http://localhost:3000",
      theque_connected_email: "user@example.com",
    });
    await loadPopup();

    document.getElementById("ks-save")?.click();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:3000/api/capture",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("falls back to theque.app when no baseUrl is stored", async () => {
    storageGet.mockResolvedValue({
      theque_capture_token: "bmly_test_secret",
      theque_connected_email: "user@example.com",
      // no theque_api_base_url
    });
    await loadPopup();

    document.getElementById("ks-save")?.click();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "https://theque.app/api/capture",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("opens library using stored baseUrl when connected", async () => {
    storageGet.mockResolvedValue({
      theque_capture_token: "bmly_test_secret",
      theque_api_base_url: "http://localhost:3000",
      theque_connected_email: "user@example.com",
    });
    await loadPopup();

    document.getElementById("ks-open-theque")?.click();

    await vi.waitFor(() => {
      expect(tabsCreate).toHaveBeenCalledWith({ url: "http://localhost:3000/library" });
    });
  });

  it("populates shelf-hint dropdown from CATEGORY_HINT_OPTIONS", async () => {
    await loadPopup();

    const select = document.getElementById("ks-category") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    // First option is always "Auto detect" (empty value)
    expect(values[0]).toBe("");
    // Surviving category hints are present
    expect(values).toContain("books");
    expect(values).toContain("movies_and_tv");
    expect(values).toContain("articles");
    // gifts (Workstream A) and the retired music/videos/apps (ADR 0004) must not appear
    expect(values).not.toContain("gifts");
    expect(values).not.toContain("music");
    expect(values).not.toContain("videos");
    expect(values).not.toContain("apps");
    // Labels match shelf names
    const watchOption = Array.from(select.options).find((o) => o.value === "movies_and_tv");
    expect(watchOption?.textContent).toBe("Watch");
    const readOption = Array.from(select.options).find((o) => o.value === "articles");
    expect(readOption?.textContent).toBe("Read");
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
