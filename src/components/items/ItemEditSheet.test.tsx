import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ItemDetailModel } from "@/components/items/ItemDetail";

import { ItemEditSheet } from "./ItemEditSheet";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function makeItem(): ItemDetailModel {
  return {
    id: "item-1",
    user_id: "user-1",
    status: "want",
    category: "books",
    note: "old note",
  } as ItemDetailModel;
}

describe("ItemEditSheet", () => {
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
    vi.useRealTimers();
  });

  it("sends only the changed field when Save follows a note change", async () => {
    const onSave = vi.fn().mockResolvedValue(null);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <ItemEditSheet open onOpenChange={() => {}} item={makeItem()} onSave={onSave} />,
      );
    });

    const textarea = document.getElementById("edit-note") as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();

    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setValue?.call(textarea, "new note");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const save = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Done",
    ) as HTMLButtonElement;
    await act(async () => {
      save.click();
    });

    expect(onSave).toHaveBeenCalledWith({ note: "new note" });
  });

  it("sends nothing when no field changed", async () => {
    const onSave = vi.fn().mockResolvedValue(null);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <ItemEditSheet open onOpenChange={() => {}} item={makeItem()} onSave={onSave} />,
      );
    });

    const save = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Done",
    ) as HTMLButtonElement;
    await act(async () => {
      save.click();
    });

    expect(onSave).not.toHaveBeenCalled();
  });
});
