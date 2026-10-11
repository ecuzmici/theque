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
});

