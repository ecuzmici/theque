import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CaptureProvider } from "@/components/capture/CaptureProvider";

import AddPage from "./page";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
let query = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => query,
}));

vi.mock("@/components/layout/ExtensionNudge", () => ({
  ExtensionNudge: () => null,
}));

describe("/add", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ existing: null }), { status: 200 })),
    );
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("opens the capture sheet with the shared link and title", async () => {
    query = new URLSearchParams({ text: "Great film https://www.imdb.com/title/tt0113277/", title: "Heat" });
    const readText = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, clipboard: { readText } });

    await act(async () => {
      root?.render(
        <CaptureProvider>
          <AddPage />
        </CaptureProvider>,
      );
    });

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Save imdb.com");
    expect(dialog?.querySelector<HTMLInputElement>('input[aria-label="Note (optional)"]')?.value).toBe(
      "Heat",
    );
    expect(readText).not.toHaveBeenCalled();
  });

  it("goes to the library when the sheet closes without a save", async () => {
    query = new URLSearchParams({ url: "https://example.com/a" });

    await act(async () => {
      root?.render(
        <CaptureProvider>
          <AddPage />
        </CaptureProvider>,
      );
    });

    const close = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Close",
    );
    await act(async () => {
      close?.click();
    });

    expect(router.replace).toHaveBeenCalledWith("/library");
  });
});
