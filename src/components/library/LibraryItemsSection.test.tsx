import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryItemRow } from "@/lib/types/library-item";

import { LibraryItemsSection } from "./LibraryItemsSection";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  fetchLibraryItemsPage: vi.fn(),
  useItemRealtime: vi.fn(),
}));

vi.mock("@/hooks/useItemRealtime", () => ({
  useItemRealtime: mocks.useItemRealtime,
}));

vi.mock("@/lib/library-items-client", () => ({
  fetchLibraryItemsPage: mocks.fetchLibraryItemsPage,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function makeItem(patch: Partial<LibraryItemRow> = {}): LibraryItemRow {
  return {
    id: "item-1",
    title: "Goodreads",
    subtitle: null,
    image_url: null,
    domain: "goodreads.com",
    category: "books",
    status: "want",
    processing_status: "pending",
    created_at: "2026-05-17T12:00:00.000Z",
    display: {},
    canonical_url: "https://www.goodreads.com/book/show/123",
    ...patch,
  };
}

describe("LibraryItemsSection", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
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
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("refreshes visible pending items to their enriched state", async () => {
    // Titleless: a pending row with nothing to show is the one that gets the
    // "Gathering details…" placeholder (see the imported-row case below).
    const pendingItem = makeItem({ title: null });
    const readyItem = makeItem({
      title: "Artificial Wisdom",
      subtitle: "Thomas R. Weaver · 2023",
      processing_status: "ready",
    });
    let resolveRefresh: (result: { items: LibraryItemRow[]; hasMore: boolean }) => void = () => {};
    const refreshPromise = new Promise<{ items: LibraryItemRow[]; hasMore: boolean }>((resolve) => {
      resolveRefresh = resolve;
    });

    mocks.fetchLibraryItemsPage.mockReturnValueOnce(refreshPromise);

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <LibraryItemsSection userId="user-1" shelfId="all" initialItems={[pendingItem]} />,
      );
    });

    expect(container.textContent).toContain("Gathering details");

    await act(async () => {
      resolveRefresh({ items: [readyItem], hasMore: false });
      await refreshPromise;
    });

    expect(mocks.fetchLibraryItemsPage).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Artificial Wisdom");
    expect(container.textContent).not.toContain("Gathering details");
  });

  it("renders a pending item that already has a title as a real card", async () => {
    // Bulk-imported rows land `pending` (so enrichment still claims them) but
    // carry the export's title. They must read as items, not as a wall of
    // placeholders waiting on a crawl.
    const importedItem = makeItem({ title: "Piranesi", processing_status: "pending" });
    mocks.fetchLibraryItemsPage.mockReturnValueOnce(new Promise(() => {}));

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <LibraryItemsSection userId="user-1" shelfId="all" initialItems={[importedItem]} />,
      );
    });

    expect(container.textContent).toContain("Piranesi");
    expect(container.textContent).not.toContain("Gathering details");
  });
});
