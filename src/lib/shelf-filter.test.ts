import { describe, expect, it } from "vitest";

import type { ItemCategory, ItemStatus } from "@/lib/database.types";

import { parseShelfParam } from "./shelves";

import { itemMatchesShelf } from "./shelf-filter";

function item(
  patch: Partial<{
    status: ItemStatus;
    category: ItemCategory | null;
    created_at: string;
  }> = {},
) {
  return {
    status: "want" as ItemStatus,
    category: "movies_and_tv" as ItemCategory,
    created_at: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

describe("itemMatchesShelf", () => {
  it("keeps done items on their category shelf (no separate Done shelf)", () => {
    expect(itemMatchesShelf(item({ status: "done", category: "movies_and_tv" }), "watch")).toBe(
      true,
    );
    expect(itemMatchesShelf(item({ status: "done", category: "books" }), "books")).toBe(true);
    expect(itemMatchesShelf(item({ status: "done", category: "articles" }), "read")).toBe(true);
  });

  it("includes want items on their category shelf", () => {
    expect(itemMatchesShelf(item({ status: "want", category: "movies_and_tv" }), "watch")).toBe(
      true,
    );
    expect(itemMatchesShelf(item({ status: "want", category: "books" }), "books")).toBe(true);
    expect(itemMatchesShelf(item({ status: "want", category: "articles" }), "read")).toBe(true);
  });

  it("groups the long tail onto the Other shelf", () => {
    for (const category of ["restaurants", "products", "travel", "recipes"] as const) {
      expect(itemMatchesShelf(item({ status: "want", category }), "other")).toBe(true);
    }
  });

  it("excludes non-grouped categories from Other but keeps its done items", () => {
    expect(itemMatchesShelf(item({ status: "want", category: "books" }), "other")).toBe(false);
    expect(itemMatchesShelf(item({ status: "want", category: "movies_and_tv" }), "other")).toBe(
      false,
    );
    expect(itemMatchesShelf(item({ status: "want", category: "articles" }), "other")).toBe(false);
    expect(itemMatchesShelf(item({ status: "done", category: "restaurants" }), "other")).toBe(true);
  });

  it("keeps All showing done items", () => {
    expect(itemMatchesShelf(item({ status: "done" }), "all")).toBe(true);
    expect(itemMatchesShelf(item({ status: "want" }), "all")).toBe(true);
  });

  it("keeps Inbox limited to inbox status", () => {
    expect(itemMatchesShelf(item({ status: "inbox" }), "inbox")).toBe(true);
    expect(itemMatchesShelf(item({ status: "want" }), "inbox")).toBe(false);
    expect(itemMatchesShelf(item({ status: "done" }), "inbox")).toBe(false);
  });

  it("keeps Forgotten as want items older than the cutoff", () => {
    const old = item({
      status: "want",
      created_at: "2020-01-01T00:00:00.000Z",
    });
    const recent = item({
      status: "want",
      created_at: new Date().toISOString(),
    });
    expect(itemMatchesShelf(old, "forgotten")).toBe(true);
    expect(itemMatchesShelf(recent, "forgotten")).toBe(false);
    expect(itemMatchesShelf({ ...old, status: "done" }, "forgotten")).toBe(false);
  });
});

describe("parseShelfParam", () => {
  it("falls back to All for removed or unknown shelf ids", () => {
    expect(parseShelfParam("cook")).toBe("all");
    expect(parseShelfParam("tools")).toBe("all");
    expect(parseShelfParam("nonsense")).toBe("all");
    expect(parseShelfParam(null)).toBe("all");
  });

  it("resolves known shelf ids", () => {
    expect(parseShelfParam("read")).toBe("read");
    expect(parseShelfParam("other")).toBe("other");
  });
});
