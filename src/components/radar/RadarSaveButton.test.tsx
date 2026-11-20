import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RadarSaveButton } from "./RadarSaveButton";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("RadarSaveButton", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    vi.unstubAllGlobals();
  });

  function stubCapture(status: number, body: unknown) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  async function renderAndClick(url = "https://hardcover.app/books/scion-2026") {
    await act(async () => {
      root?.render(<RadarSaveButton url={url} title="Scion" />);
    });
    const button = container!.querySelector("button")!;
    expect(button.textContent).toBe("Save");
    await act(async () => {
      button.click();
    });
  }

  it("saves the release page through the capture API", async () => {
    const fetchMock = stubCapture(200, { item: { id: "item-9" }, created: true });
    await renderAndClick();

    expect(fetchMock).toHaveBeenCalledWith("/api/capture", expect.objectContaining({ method: "POST" }));
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(init.body))).toMatchObject({
      url: "https://hardcover.app/books/scion-2026",
      source: "manual",
    });
    const link = container!.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/item/item-9");
    expect(container!.textContent).toContain("Saved");
  });

  it("says the title is in the library when capture finds a duplicate", async () => {
    stubCapture(200, { item: { id: "item-3" }, created: false });
    await renderAndClick();
    expect(container!.textContent).toContain("In your library");
    expect(container!.querySelector("a")?.getAttribute("href")).toBe("/item/item-3");
  });

  it("shows an error and lets you try again", async () => {
    stubCapture(500, { code: "server_error" });
    await renderAndClick();
    expect(container!.textContent).toContain("Could not save");
    expect(container!.querySelector("button")?.textContent).toBe("Try again");
  });
});
