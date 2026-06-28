import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryItemRow } from "@/lib/types/library-item";

import { ItemCardVerdictControl } from "./ItemCardVerdictControl";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function makeItem(patch: Partial<LibraryItemRow> = {}): LibraryItemRow {
  return {
    id: "item-1",
    title: "Dune",
    subtitle: null,
    image_url: null,
    image_storage_path: null,
    domain: "example.com",
    category: "books",
    status: "want",
    processing_status: "ready",
    created_at: "2026-05-17T12:00:00.000Z",
    display: {},
    canonical_url: "https://example.com/dune",
    dominant_color: null,
    dominant_hue: null,
    rating_personal: null,
    verdict: null,
    done_at: null,
    ...patch,
  };
}

describe("ItemCardVerdictControl", () => {
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
  });

  it("renders 'Mark read' for a backlog item and calls onOpenMarkDone on click", async () => {
    const onOpenMarkDone = vi.fn();

    await act(async () => {
      root?.render(<ItemCardVerdictControl item={makeItem()} onOpenMarkDone={onOpenMarkDone} />);
    });

    const button = Array.from(document.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("Mark read"),
    );
    expect(button).toBeTruthy();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onOpenMarkDone).toHaveBeenCalledWith(expect.objectContaining({ id: "item-1" }));
  });

  it("renders 'Edit verdict' for a done item and calls onOpenMarkDone on click", async () => {
    const onOpenMarkDone = vi.fn();

    await act(async () => {
      root?.render(
        <ItemCardVerdictControl
          item={makeItem({ status: "done", rating_personal: 4, verdict: "Epic" })}
          onOpenMarkDone={onOpenMarkDone}
        />,
      );
    });

    const button = Array.from(document.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("Edit verdict"),
    );
    expect(button).toBeTruthy();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onOpenMarkDone).toHaveBeenCalledWith(
      expect.objectContaining({ id: "item-1", status: "done" }),
    );
  });
});
