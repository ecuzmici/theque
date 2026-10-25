import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryItemRow } from "@/lib/types/library-item";

import { resetLibraryStore } from "./library-store";
import { UpNextRow } from "./UpNextRow";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const shelves = vi.hoisted(() => ({
  all: [] as LibraryItemRow[],
  books: [] as LibraryItemRow[],
  watch: [] as LibraryItemRow[],
  forgotten: [] as LibraryItemRow[],
}));

vi.mock("@/lib/library-items-client", () => ({
  fetchLibraryItemsPage: vi.fn(async (shelf: "all" | "books" | "watch" | "forgotten") => ({
    items: shelves[shelf],
    hasMore: false,
  })),
}));

vi.mock("@/components/library/MadeForYouTile", () => ({
  MadeForYouTile: () => <div data-testid="made-for-you">Made for you</div>,
}));

function item(id: string, patch: Partial<LibraryItemRow> = {}): LibraryItemRow {
  return {
    file_uploaded_at: null,
    pinned_at: null,
    id,
    title: `Title ${id}`,
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
    created_at: new Date().toISOString(),
    display: {},
    canonical_url: `https://example.com/${id}`,
    ...patch,
  };
}

describe("UpNextRow", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    resetLibraryStore();
    shelves.books = [item("b1")];
    shelves.watch = [item("w1", { category: "movies_and_tv" })];
    shelves.forgotten = [];
    shelves.all = [];
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = undefined;
    container = undefined;
    vi.unstubAllGlobals();
  });

  async function render(props: Partial<Parameters<typeof UpNextRow>[0]> = {}) {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<UpNextRow userId="user-1" {...props} />);
    });
  }

  function eyebrows() {
    return Array.from(container?.querySelectorAll("li a span.uppercase") ?? []).map(
      (el) => el.textContent,
    );
  }

  it("shows Tonight, Next read, and Next watch without a forgotten tile", async () => {
    shelves.books = [item("b1"), item("b2")];
    shelves.watch = [item("w1", { category: "movies_and_tv" }), item("w2", { category: "movies_and_tv" })];
    await render();
    expect(eyebrows()).toEqual(["Tonight", "Next read", "Next watch"]);
    expect(container?.querySelectorAll("li a")).toHaveLength(3);
  });

  it("shows a forgotten tile when an old wanted item exists", async () => {
    shelves.forgotten = [item("old", { created_at: "2020-01-01T00:00:00.000Z" })];
    shelves.books = [item("b1"), item("b2")];
    shelves.watch = [item("w1", { category: "movies_and_tv" }), item("w2", { category: "movies_and_tv" })];
    await render();
    expect(eyebrows()).toHaveLength(4);
    expect(eyebrows()[1]).toMatch(/mo waiting$/);
    expect(container?.textContent).toContain("Title old");
  });

  it("shows the Made for you tile only when recommendations are enabled", async () => {
    await render();
    expect(container?.querySelector('[data-testid="made-for-you"]')).toBeNull();
    act(() => root?.unmount());
    root = undefined;
    container?.remove();

    await render({ recommendWatchEnabled: true });
    expect(container?.querySelector('[data-testid="made-for-you"]')).not.toBeNull();
  });

  it("renders nothing for an empty library without recommendations", async () => {
    shelves.books = [];
    shelves.watch = [];
    await render();
    expect(container?.querySelector("section")).toBeNull();
  });

  it("replaces Tonight's pick with a random item on Shuffle", async () => {
    const random = item("r1", { category: "articles", title: "Random read" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ item: random }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await render();

    const shuffle = Array.from(container?.querySelectorAll("button") ?? []).find(
      (b) => b.textContent === "Shuffle",
    );
    expect(shuffle).toBeDefined();
    await act(async () => {
      shuffle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/items/random?shelf=all");
    const first = container?.querySelector("li a");
    expect(first?.getAttribute("href")).toBe("/item/r1");
    expect(first?.textContent).toContain("Random read");
  });

  it("shows the stored row at once when the library mounts again", async () => {
    await render();
    const first = eyebrows();
    expect(first.length).toBeGreaterThan(0);
    act(() => root?.unmount());
    root = undefined;
    container?.remove();
    shelves.books = [];
    shelves.watch = [];

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root?.render(<UpNextRow userId="user-1" />);
    });

    // The first render already has the tiles; the refresh comes after.
    expect(eyebrows()).toEqual(first);
  });
});
