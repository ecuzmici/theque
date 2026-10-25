import { beforeEach, describe, expect, it } from "vitest";

import type { LibraryItemRow } from "@/lib/types/library-item";

import {
  mergeFreshFirstPage,
  readStoredShelves,
  resetLibraryStore,
  storeScroll,
  storeShelves,
  takeScrollToRestore,
} from "./library-store";

function row(id: string, patch: Partial<LibraryItemRow> = {}): LibraryItemRow {
  return {
    id,
    title: `Title ${id}`,
    subtitle: null,
    image_url: null,
    image_storage_path: null,
    domain: "example.com",
    category: "books",
    status: "want",
    processing_status: "ready",
    created_at: "2026-10-01T00:00:00.000Z",
    display: {},
    canonical_url: `https://example.com/${id}`,
    dominant_color: null,
    dominant_hue: null,
    rating_personal: null,
    verdict: null,
    done_at: null,
    file_uploaded_at: null,
    pinned_at: null,
    ...patch,
  };
}

beforeEach(() => {
  resetLibraryStore();
});

describe("mergeFreshFirstPage", () => {
  it("replaces changed rows and keeps the object of unchanged rows", () => {
    const a = row("a");
    const b = row("b");
    const c = row("c");
    const merged = mergeFreshFirstPage([a, b, c], [row("a"), row("b", { status: "done" })], true);

    expect(merged.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(merged[0]).toBe(a);
    expect(merged[1].status).toBe("done");
    expect(merged[2]).toBe(c);
  });

  it("drops a cached row above the last fresh row that the fresh page lacks", () => {
    const merged = mergeFreshFirstPage(
      [row("a"), row("gone"), row("b"), row("c")],
      [row("new"), row("a"), row("b")],
      true,
    );

    expect(merged.map((r) => r.id)).toEqual(["new", "a", "b", "c"]);
  });

  it("keeps every cached row when the last fresh row is not cached", () => {
    const merged = mergeFreshFirstPage([row("a"), row("b")], [row("x"), row("y")], true);

    expect(merged.map((r) => r.id)).toEqual(["x", "y", "a", "b"]);
  });

  it("takes the fresh page as the whole shelf when it has no more pages", () => {
    const merged = mergeFreshFirstPage([row("a"), row("b"), row("c")], [row("b")], false);

    expect(merged.map((r) => r.id)).toEqual(["b"]);
  });
});

describe("library store", () => {
  it("clears the stored shelves for another user", () => {
    storeShelves("user-1", { all: { items: [row("a")], hasMore: false } });

    expect(readStoredShelves("user-1").all?.items).toHaveLength(1);
    expect(readStoredShelves("user-2")).toEqual({});
    expect(readStoredShelves("user-1")).toEqual({});
  });

  it("restores the scroll position only after a Back or Forward", () => {
    storeScroll("user-1", 1200);
    expect(takeScrollToRestore("user-1")).toBeNull();

    storeScroll("user-1", 1200);
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(takeScrollToRestore("user-1")).toBe(1200);
    expect(takeScrollToRestore("user-1")).toBeNull();
  });
});
