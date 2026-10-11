import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryItemRow } from "@/lib/types/library-item";

import { ItemCard, LONG_PRESS_MS } from "./ItemCard";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), prefetch: vi.fn(), push: vi.fn() }),
}));

function makeItem(patch: Partial<LibraryItemRow> = {}): LibraryItemRow {
  return {
    id: "item-1",
    title: "Twin Peaks (TV Series 1990–1991) ⭐ 8.7 | Crime, Drama",
    subtitle: "David Lynch · 1990",
    image_url: null,
    image_storage_path: null,
    dominant_color: null,
    dominant_hue: null,
    rating_personal: null,
    verdict: null,
    done_at: null,
    domain: "www.imdb.com",
    category: "movies_and_tv",
    status: "want",
    processing_status: "ready",
    created_at: "2026-05-17T12:00:00.000Z",
    display: {},
    canonical_url: "https://www.imdb.com/title/tt0098936/",
    ...patch,
  };
}

function pointer(type: string, init: { pointerType?: string; clientX?: number; clientY?: number } = {}) {
  // jsdom has no PointerEvent constructor; a MouseEvent with pointerType works for React.
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: init.clientX ?? 0, clientY: init.clientY ?? 0 });
  Object.defineProperty(e, "pointerType", { value: init.pointerType ?? "touch" });
  return e;
}

describe("ItemCard", () => {
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
    root = undefined;
    container = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function render(item: LibraryItemRow, props: Partial<Parameters<typeof ItemCard>[0]> = {}) {
    await act(async () => {
      root?.render(<ItemCard item={item} shelfId="all" itemActionsEnabled {...props} />);
    });
    return container!;
  }

  it("shows the cleaned title and the first byline part under the cover", async () => {
    const el = await render(makeItem());
    const link = el.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("/item/item-1");
    const captions = [...link.querySelectorAll("p")].map((p) => p.textContent);
    expect(captions).toContain("Twin Peaks");
    expect(captions).toContain("David Lynch");
    expect(el.textContent).not.toContain("⭐");
  });

  it("falls back to the bare domain when there is no subtitle", async () => {
    const el = await render(makeItem({ subtitle: null }));
    expect(el.textContent).toContain("imdb.com");
    expect(el.textContent).not.toContain("www.imdb.com");
  });

  it("draws a tinted typographic cover when there is no image", async () => {
    const el = await render(makeItem({ dominant_color: "#f0e6d0" }));
    const cover = el.querySelector<HTMLElement>('[data-testid="type-cover"]');
    expect(cover).not.toBeNull();
    expect(cover!.style.backgroundColor).toBe("rgb(240, 230, 208)");
    // A light tint gets dark text.
    expect(cover!.className).toContain("text-stone-900");
  });

  it("crops a portrait image to fill the cover", async () => {
    const el = await render(makeItem({ image_url: "https://img.example/poster.jpg" }));
    expect(el.querySelectorAll("img")).toHaveLength(1);
    expect(el.querySelector("img")!.className).toContain("object-cover");
  });

  it("sets a landscape image on a blurred copy of itself", async () => {
    const el = await render(
      makeItem({ category: "articles", image_url: "https://img.example/hero.jpg" }),
    );
    expect(el.querySelector('[data-testid="cover-backdrop"]')).not.toBeNull();
    const imgs = el.querySelectorAll("img");
    expect(imgs).toHaveLength(2);
    expect(imgs[1].className).toContain("object-contain");
  });

  it("switches to the blurred backdrop when a book image loads as landscape", async () => {
    const el = await render(makeItem({ category: "books", image_url: "https://img.example/shot.png" }));
    const img = el.querySelector("img")!;
    Object.defineProperty(img, "complete", { value: true });
    Object.defineProperty(img, "naturalWidth", { value: 1200 });
    Object.defineProperty(img, "naturalHeight", { value: 630 });
    await act(async () => {
      img.dispatchEvent(new Event("load"));
    });
    expect(el.querySelector('[data-testid="cover-backdrop"]')).not.toBeNull();
  });

  it("marks a done item with a check and its stars, and names the status", async () => {
    const el = await render(makeItem({ status: "done", rating_personal: 4 }));
    const mark = el.querySelector('[data-testid="done-mark"]');
    expect(mark).not.toBeNull();
    expect(mark!.querySelectorAll("svg.fill-current")).toHaveLength(4);
    expect(el.querySelector("a")!.textContent).toContain("Done, 4 of 5 stars");
  });

  it("marks an inbox item with an amber dot", async () => {
    const el = await render(makeItem({ status: "inbox" }));
    expect(el.querySelector('[data-testid="inbox-dot"]')?.className).toContain("bg-amber-500");
    expect(el.textContent).toContain("In inbox");
    expect(el.querySelector('[data-testid="done-mark"]')).toBeNull();
  });

  it("shows no visible button: the only control is the hidden actions trigger", async () => {
    const el = await render(makeItem());
    const buttons = el.querySelectorAll("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute("aria-label")).toBe("Item actions");
    expect(buttons[0].className).toContain("opacity-0");
    expect(buttons[0].className).toContain("group-hover:opacity-100");
    expect(buttons[0].className).toContain("focus-visible:opacity-100");
    expect(el.textContent).not.toMatch(/Mark watched|Edit verdict/);
  });

  it("renders no actions trigger when actions are off", async () => {
    const el = await render(makeItem(), { itemActionsEnabled: false });
    expect(el.querySelector("button")).toBeNull();
  });

  it("opens the quick actions on a touch long-press and swallows the follow-up click", async () => {
    vi.useFakeTimers();
    const el = await render(makeItem());
    const link = el.querySelector("a")!;
    const onClick = vi.fn();
    document.addEventListener("click", onClick);

    await act(async () => {
      link.dispatchEvent(pointer("pointerdown"));
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    });
    expect(document.body.textContent).toContain("Open original");

    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => {
      link.dispatchEvent(pointer("pointerup"));
      link.dispatchEvent(click);
    });
    expect(click.defaultPrevented).toBe(true);
    expect(onClick).not.toHaveBeenCalled();
    document.removeEventListener("click", onClick);
  });

  it("does not open the quick actions when the finger moves to scroll", async () => {
    vi.useFakeTimers();
    const el = await render(makeItem());
    const link = el.querySelector("a")!;
    await act(async () => {
      link.dispatchEvent(pointer("pointerdown", { clientX: 10, clientY: 10 }));
      link.dispatchEvent(pointer("pointermove", { clientX: 10, clientY: 40 }));
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    });
    expect(document.body.textContent).not.toContain("Open original");
  });

  it("ignores a long mouse press", async () => {
    vi.useFakeTimers();
    const el = await render(makeItem());
    await act(async () => {
      el.querySelector("a")!.dispatchEvent(pointer("pointerdown", { pointerType: "mouse" }));
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    });
    expect(document.body.textContent).not.toContain("Open original");
  });

  it("opens the quick actions from the keyboard context-menu key", async () => {
    const el = await render(makeItem());
    await act(async () => {
      el.querySelector("a")!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true, cancelable: true }),
      );
    });
    expect(document.body.textContent).toContain("Open original");
  });

  it("passes the item to the mark-done handler from the menu", async () => {
    const onOpenMarkDone = vi.fn();
    const item = makeItem();
    const el = await render(item, { onOpenMarkDone });
    await act(async () => {
      el.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const entry = [...document.querySelectorAll('[role="menuitem"]')].find((n) =>
      n.textContent?.includes("Mark watched"),
    );
    expect(entry).toBeDefined();
    await act(async () => {
      entry!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onOpenMarkDone).toHaveBeenCalledWith(item);
  });
});
