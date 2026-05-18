import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryItemRow } from "@/lib/types/library-item";

import { LibraryItemsSection } from "./LibraryItemsSection";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(() => ({}) as never),
  fetchLibraryItemsForShelf: vi.fn(),
  useItemRealtime: vi.fn(),
}));

vi.mock("@/hooks/useItemRealtime", () => ({
  useItemRealtime: mocks.useItemRealtime,
}));

vi.mock("@/lib/library-items-for-shelf", () => ({
  fetchLibraryItemsForShelf: mocks.fetchLibraryItemsForShelf,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: mocks.createClient,
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
    const pendingItem = makeItem();
    const readyItem = makeItem({
      title: "Artificial Wisdom",
      subtitle: "Thomas R. Weaver · 2023",
      processing_status: "ready",
    });
    let resolveRefresh: (items: LibraryItemRow[]) => void = () => {};
    const refreshPromise = new Promise<LibraryItemRow[]>((resolve) => {
      resolveRefresh = resolve;
    });

    mocks.fetchLibraryItemsForShelf.mockReturnValueOnce(refreshPromise);

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
      resolveRefresh([readyItem]);
      await refreshPromise;
    });

    expect(mocks.fetchLibraryItemsForShelf).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Artificial Wisdom");
    expect(container.textContent).not.toContain("Gathering details");
  });
});
