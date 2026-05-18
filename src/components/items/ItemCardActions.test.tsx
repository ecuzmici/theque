import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

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
});
