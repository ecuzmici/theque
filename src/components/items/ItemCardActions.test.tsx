import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SAVE_ERROR_EVENT } from "@/lib/save-error";
import type { LibraryItemRow } from "@/lib/types/library-item";

import { ItemCardActions } from "./ItemCardActions";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function makeItem(patch: Partial<LibraryItemRow> = {}): LibraryItemRow {
  return {
    id: "item-1",
    title: "Dune",
    subtitle: null,
    image_url: null,
    image_storage_path: null,
    dominant_color: null,
    dominant_hue: null,
    rating_personal: null,
    verdict: null,
    done_at: null,
    domain: "example.com",
    category: "books",
    status: "want",
    processing_status: "ready",
    created_at: "2026-05-17T12:00:00.000Z",
    display: {},
    canonical_url: "https://example.com/dune",
    ...patch,
  };
}

describe("ItemCardActions", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = undefined;
    container = undefined;
    vi.restoreAllMocks();
  });

  it("opens a phone-friendly action menu", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ItemCardActions item={makeItem()} shelfId="all" onItemPatch={vi.fn()} />);
    });

    const trigger = document.querySelector("button");
    expect(trigger?.getAttribute("aria-label")).toBe("Item actions");

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("Open original");
    expect(document.body.textContent).toContain("Change status");
    expect(document.body.textContent).toContain("Delete item");
  });

  it("undoes the optimistic status change and reports the error when the save fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const undo = vi.fn();
    const onItemPatch = vi.fn(() => undo);
    const onSaveError = vi.fn();
    window.addEventListener(SAVE_ERROR_EVENT, onSaveError);

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<ItemCardActions item={makeItem()} shelfId="all" onItemPatch={onItemPatch} />);
    });
    await act(async () => {
      document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const dismiss = [...document.querySelectorAll('[role="menuitem"]')].find(
      (el) => el.textContent === "Dismissed",
    );
    expect(dismiss).toBeDefined();
    await act(async () => {
      dismiss?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });

    expect(onItemPatch).toHaveBeenCalledWith("item-1", { status: "dismissed" }, expect.anything());
    expect(undo).toHaveBeenCalledTimes(1);
    expect(onSaveError).toHaveBeenCalledTimes(1);
    window.removeEventListener(SAVE_ERROR_EVENT, onSaveError);
    vi.unstubAllGlobals();
  });

  async function openMenu(element: React.ReactElement) {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(element);
    });
    await act(async () => {
      document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    return [...document.querySelectorAll('[role="menuitem"]')];
  }

  it("offers mark done with the category verb, or edit verdict when done", async () => {
    const onOpenMarkDone = vi.fn();
    let items = await openMenu(
      <ItemCardActions item={makeItem()} shelfId="all" onOpenMarkDone={onOpenMarkDone} />,
    );
    expect(items.some((el) => el.textContent === "Mark read")).toBe(true);
    act(() => root?.unmount());
    container?.remove();

    items = await openMenu(
      <ItemCardActions item={makeItem({ status: "done" })} shelfId="all" onOpenMarkDone={onOpenMarkDone} />,
    );
    expect(items.some((el) => el.textContent === "Edit verdict")).toBe(true);
  });

  it("shows the cleaned title as the menu label", async () => {
    await openMenu(
      <ItemCardActions item={makeItem({ title: "Tremors (1990) - IMDb" })} shelfId="all" />,
    );
    expect(document.body.textContent).toContain("Tremors");
    expect(document.body.textContent).not.toContain("IMDb");
  });

  it("offers inbox triage for an inbox item and drops it from the inbox shelf on keep", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const onItemPatch = vi.fn();
    const onOpenMarkDone = vi.fn();
    const items = await openMenu(
      <ItemCardActions
        item={makeItem({ status: "inbox" })}
        shelfId="inbox"
        onItemPatch={onItemPatch}
        onOpenMarkDone={onOpenMarkDone}
      />,
    );
    expect(document.body.textContent).toContain("Wrong type…");
    expect(document.body.textContent).not.toContain("Change status");
    expect(items.some((el) => el.textContent?.startsWith("Mark"))).toBe(false);

    const keep = items.find((el) => el.textContent === "Keep · Want");
    await act(async () => {
      keep?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
    expect(onItemPatch).toHaveBeenCalledWith("item-1", { status: "want" }, { remove: true });
    vi.unstubAllGlobals();
  });
});

