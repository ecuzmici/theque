import { describe, expect, it } from "vitest";

import {
  FORGOTTEN_AFTER_DAYS,
  applyOlderThan,
  isForgotten,
  resolveActiveShelf,
  resolveRequestedShelf,
  visibleShelves,
  type ShelfId,
} from "./shelves";

const ALWAYS_VISIBLE: ShelfId[] = ["all", "books", "watch", "read"];

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
      "inbox",
    ]);
    expect(visibleShelves({})).toEqual(["all", "books", "watch", "read"]);
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

  it("never resolves to forgotten, since it is not a visible tab", () => {
    const visible = visibleShelves({ other: 1, inbox: 1 });
    expect(visible.includes("forgotten")).toBe(false);
    expect(resolveActiveShelf("forgotten", visible)).toBe("all");
  });
});

describe("resolveRequestedShelf", () => {
  it("keeps forgotten reachable when explicitly requested, despite no tab", () => {
    const visible = visibleShelves({ other: 1, inbox: 1 });
    expect(visible.includes("forgotten")).toBe(false);
    expect(resolveRequestedShelf("forgotten", visible)).toBe("forgotten");
  });

  it("defers to resolveActiveShelf for every other shelf", () => {
    const visible = visibleShelves({});
    expect(resolveRequestedShelf("books", visible)).toBe("books");
    expect(resolveRequestedShelf("other", visible)).toBe("all");
    expect(resolveRequestedShelf("nonsense" as ShelfId, visible)).toBe("all");
  });
});

describe("isForgotten", () => {
  const NOW = Date.parse("2026-11-20T12:00:00.000Z");
  const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();
  const want = (created: number, kept: number | null = null) => ({
    status: "want" as const,
    created_at: daysAgo(created),
    kept_at: kept === null ? null : daysAgo(kept),
  });

  it("counts a want item saved before the cutoff and never kept", () => {
    expect(isForgotten(want(FORGOTTEN_AFTER_DAYS + 1), FORGOTTEN_AFTER_DAYS, NOW)).toBe(true);
    expect(isForgotten(want(FORGOTTEN_AFTER_DAYS - 1), FORGOTTEN_AFTER_DAYS, NOW)).toBe(false);
  });

  it("counts only want items", () => {
    const old = want(400);
    expect(isForgotten({ ...old, status: "done" }, FORGOTTEN_AFTER_DAYS, NOW)).toBe(false);
    expect(isForgotten({ ...old, status: "dismissed" }, FORGOTTEN_AFTER_DAYS, NOW)).toBe(false);
    expect(isForgotten({ ...old, status: "inbox" }, FORGOTTEN_AFTER_DAYS, NOW)).toBe(false);
  });

  it("starts the age again when the user keeps the item", () => {
    expect(isForgotten(want(400, 10), FORGOTTEN_AFTER_DAYS, NOW)).toBe(false);
    expect(isForgotten(want(400, FORGOTTEN_AFTER_DAYS + 1), FORGOTTEN_AFTER_DAYS, NOW)).toBe(true);
  });

  it("treats a missing kept_at as never kept", () => {
    expect(isForgotten({ status: "want", created_at: daysAgo(400) }, FORGOTTEN_AFTER_DAYS, NOW)).toBe(true);
  });

  it("uses the given age instead of the default", () => {
    expect(isForgotten(want(400), 365, NOW)).toBe(true);
    expect(isForgotten(want(300), 365, NOW)).toBe(false);
    expect(isForgotten(want(400, 300), 365, NOW)).toBe(false);
  });

  it("is false without a created_at", () => {
    expect(isForgotten({ status: "want" }, FORGOTTEN_AFTER_DAYS, NOW)).toBe(false);
  });
});

describe("applyOlderThan", () => {
  it("filters on created_at and on kept_at with the same cutoff", () => {
    const calls: string[] = [];
    const query = {
      lt(column: string, value: string) {
        calls.push(`lt ${column} ${value}`);
        return query;
      },
      or(filter: string) {
        calls.push(`or ${filter}`);
        return query;
      },
    };
    const now = Date.parse("2026-11-20T00:00:00.000Z");
    applyOlderThan(query, 10, now);
    expect(calls).toEqual([
      "lt created_at 2026-11-10T00:00:00.000Z",
      'or kept_at.is.null,kept_at.lt."2026-11-10T00:00:00.000Z"',
    ]);
  });
});
