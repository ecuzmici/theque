import { describe, expect, it } from "vitest";

import { pinnedFirst } from "./pins";

describe("pinnedFirst", () => {
  it("puts pinned items first, newest pin first, and keeps the other order", () => {
    const items = [
      { id: "a", pinned_at: null },
      { id: "b", pinned_at: "2026-10-01T00:00:00Z" },
      { id: "c", pinned_at: null },
      { id: "d", pinned_at: "2026-10-05T00:00:00Z" },
    ];
    expect(pinnedFirst(items).map((i) => i.id)).toEqual(["d", "b", "a", "c"]);
  });

  it("returns the same list when nothing is pinned", () => {
    const items = [{ id: "a", pinned_at: null }];
    expect(pinnedFirst(items)).toBe(items);
  });
});
