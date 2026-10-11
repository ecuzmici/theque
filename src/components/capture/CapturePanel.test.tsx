import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClipboardLink } from "./capture-link";
import { CapturePanel, type CapturePanelProps } from "./CapturePanel";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type CaptureCall = { url: string; source: string; note?: string };

function stubFetch(captureResponse: { status: number; body: unknown }) {
  const captures: CaptureCall[] = [];
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    if (input.startsWith("/api/items/check-url")) {
      return new Response(JSON.stringify({ existing: null }), { status: 200 });
    }
    captures.push(JSON.parse(String(init?.body)) as CaptureCall);
    return new Response(JSON.stringify(captureResponse.body), { status: captureResponse.status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return captures;
}

function findButton(text: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  );
}

function typeInto(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setValue?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("CapturePanel", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = undefined;
    container = undefined;
    vi.unstubAllGlobals();
  });

  async function render(props: Partial<CapturePanelProps>) {
    const onSaved = vi.fn();
    await act(async () => {
      root?.render(
        <CapturePanel source="manual" onSaved={onSaved} onNavigate={() => {}} {...props} />,
      );
    });
    return { onSaved };
  }

  it("offers a one-tap save for a clipboard link", async () => {
    const captures = stubFetch({ status: 200, body: { item: { id: "item-1" }, created: true } });
    const clipboard = Promise.resolve<ClipboardLink>({
      state: "found",
      url: "https://www.imdb.com/title/tt0111161/",
    });
    const { onSaved } = await render({ clipboard });

    const oneTap = findButton("Save imdb.com");
    expect(oneTap).toBeDefined();

    await act(async () => {
      oneTap?.click();
    });

    expect(captures).toEqual([{ url: "https://www.imdb.com/title/tt0111161/", source: "manual" }]);
    expect(onSaved).toHaveBeenCalledWith("item-1");
  });

  it("shows only the link field when the clipboard read fails", async () => {
    const captures = stubFetch({ status: 200, body: { item: { id: "item-2" }, created: true } });
    const clipboard = Promise.resolve<ClipboardLink>({ state: "denied" });
    const { onSaved } = await render({ clipboard });

    expect(document.body.textContent).toContain("Paste a link below.");
    expect(findButton("Save ")).toBeUndefined();

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Link"]');
    await act(async () => {
      typeInto(input!, "https://example.com/post");
    });
    await act(async () => {
      findButton("Save")?.click();
    });

    expect(captures).toEqual([{ url: "https://example.com/post", source: "manual" }]);
    expect(onSaved).toHaveBeenCalledWith("item-2");
  });

  it("uses a shared link and note without a clipboard read", async () => {
    const captures = stubFetch({ status: 200, body: { item: { id: "item-3" }, created: true } });
    await render({
      prefillUrl: "https://goodreads.com/book/show/1",
      prefillNote: "From Sam",
      source: "mobile_share_extension",
      clipboard: null,
    });

    await act(async () => {
      findButton("Save goodreads.com")?.click();
    });

    expect(captures).toEqual([
      { url: "https://goodreads.com/book/show/1", source: "mobile_share_extension", note: "From Sam" },
    ]);
  });

  it("shows the API error and keeps the sheet open", async () => {
    stubFetch({ status: 400, body: { code: "invalid_url" } });
    const clipboard = Promise.resolve<ClipboardLink>({ state: "found", url: "https://bad.example" });
    const { onSaved } = await render({ clipboard });

    await act(async () => {
      findButton("Save bad.example")?.click();
    });

    expect(document.querySelector('[role="alert"]')?.textContent).toBe("invalid_url");
    expect(onSaved).not.toHaveBeenCalled();
  });
});
