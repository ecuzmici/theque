import { describe, expect, it } from "vitest";

import { applyItemPatch } from "./item-patch";
import type { LibraryItemRow } from "./types/library-item";

function harness(initial: Array<Pick<LibraryItemRow, "id" | "status">>) {
  let state = initial as LibraryItemRow[];
  const setItems = (next: LibraryItemRow[] | ((prev: LibraryItemRow[]) => LibraryItemRow[])) => {
    state = typeof next === "function" ? next(state) : next;
  };
  return { setItems, get: () => state.map((i) => `${i.id}:${i.status}`) };
}

describe("applyItemPatch", () => {
  it("patches a row and the undo restores it", () => {
    const h = harness([{ id: "a", status: "want" }, { id: "b", status: "want" }]);
    const undo = applyItemPatch(h.setItems, "b", { status: "done" });
    expect(h.get()).toEqual(["a:want", "b:done"]);
    undo();
    expect(h.get()).toEqual(["a:want", "b:want"]);
  });

  it("puts a removed row back at its old position", () => {
    const h = harness([{ id: "a", status: "want" }, { id: "b", status: "want" }, { id: "c", status: "want" }]);
    const undo = applyItemPatch(h.setItems, "b", { status: "dismissed" }, { remove: true });
    expect(h.get()).toEqual(["a:want", "c:want"]);
    undo();
    expect(h.get()).toEqual(["a:want", "b:want", "c:want"]);
  });

  it("does nothing for an unknown row", () => {
    const h = harness([{ id: "a", status: "want" }]);
    applyItemPatch(h.setItems, "zzz", { status: "done" })();
    expect(h.get()).toEqual(["a:want"]);
  });
});
