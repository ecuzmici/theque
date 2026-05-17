import { beforeEach, describe, expect, it, vi } from "vitest";

function setPopupHtml() {
  document.body.innerHTML = `
    <main class="ks-popup">
      <header class="ks-header">
        <h1>thèque</h1>
        <button type="button" id="ks-open-theque" class="ks-link-btn">Open library</button>
      </header>
      <p id="ks-status" class="ks-status ks-status--muted" role="status"></p>
      <button type="button" id="ks-connect-session" class="ks-btn ks-btn-secondary" hidden>Connect your account</button>
      <label class="ks-label" for="ks-category">Shelf hint <span class="ks-optional">(optional)</span></label>
      <select id="ks-category" class="ks-input ks-select">
        <option value="">Auto detect</option>
        <option value="books">Books</option>
        <option value="movies_and_tv">Watch</option>
      </select>
      <label class="ks-label" for="ks-note">Note <span class="ks-optional">(optional)</span></label>
      <textarea id="ks-note" class="ks-input ks-textarea"></textarea>
      <button type="button" id="ks-save" class="ks-btn ks-btn-primary">Save to thèque</button>
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

  it("renders the simplified production copy without the current-tab card or settings", async () => {
    await loadPopup();

    expect(document.getElementById("ks-open-theque")?.textContent).toBe("Open library");
    expect(document.querySelector(".ks-tagline")).toBeNull();
    expect(document.querySelector(".ks-capture-card")).toBeNull();
    expect(document.querySelector(".ks-settings")).toBeNull();
    expect(document.body.textContent).not.toContain("Current tab");
    expect(document.querySelector("label[for='ks-category']")?.textContent).toContain("Shelf hint");
    expect((document.querySelector("#ks-category option") as HTMLOptionElement).textContent).toBe(
      "Auto detect",
    );
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

  it("sets restricted URL error when saving on a restricted page", async () => {
    tabsQuery.mockResolvedValue([{ url: "chrome://newtab/", title: "New Tab" }]);
    await loadPopup();

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
