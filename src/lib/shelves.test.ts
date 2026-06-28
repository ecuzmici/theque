import { describe, expect, it } from "vitest";

import { resolveActiveShelf, visibleShelves, type ShelfId } from "./shelves";

const ALWAYS_VISIBLE: ShelfId[] = ["all", "books", "watch", "read", "done"];

describe("visibleShelves", () => {
  it("hides Other at zero items and shows it at one or more", () => {
    expect(visibleShelves({}).includes("other")).toBe(false);
    expect(visibleShelves({ other: 0 }).includes("other")).toBe(false);
    expect(visibleShelves({ other: 1 }).includes("other")).toBe(true);
    expect(visibleShelves({ other: 7 }).includes("other")).toBe(true);
  });

  it("hides Inbox at zero items and shows it at one or more", () => {
    expect(visibleShelves({}).includes("inbox")).toBe(false);
    expect(visibleShelves({ inbox: 0 }).includes("inbox")).toBe(false);
    expect(visibleShelves({ inbox: 1 }).includes("inbox")).toBe(true);
    expect(visibleShelves({ inbox: 3 }).includes("inbox")).toBe(true);
  });

  it("always shows the core shelves regardless of counts", () => {
    for (const counts of [{}, { other: 0, inbox: 0 }, { other: 5, inbox: 5 }]) {
      const visible = visibleShelves(counts);
      for (const id of ALWAYS_VISIBLE) {
        expect(visible.includes(id)).toBe(true);
      }
    }
  });

  it("never shows Forgotten as a tab", () => {
    expect(visibleShelves({}).includes("forgotten")).toBe(false);
    expect(visibleShelves({ forgotten: 99 }).includes("forgotten")).toBe(false);
  });

  it("preserves the shelf order", () => {
    expect(visibleShelves({ other: 1, inbox: 1 })).toEqual([
      "all",
      "books",
      "watch",
      "read",
      "other",
      "done",
      "inbox",
    ]);
    expect(visibleShelves({})).toEqual(["all", "books", "watch", "read", "done"]);
  });
});

describe("resolveActiveShelf", () => {
  it("keeps the requested shelf when it is visible", () => {
    const visible = visibleShelves({ other: 1, inbox: 1 });
    expect(resolveActiveShelf("other", visible)).toBe("other");
    expect(resolveActiveShelf("inbox", visible)).toBe("inbox");
    expect(resolveActiveShelf("books", visible)).toBe("books");
  });

  it("falls back to All when the requested shelf is hidden", () => {
    const visible = visibleShelves({});
    expect(resolveActiveShelf("other", visible)).toBe("all");
    expect(resolveActiveShelf("inbox", visible)).toBe("all");
  });

  it("falls back to All for an unknown requested id", () => {
    const visible = visibleShelves({});
    expect(resolveActiveShelf("nonsense" as ShelfId, visible)).toBe("all");
  });
});
