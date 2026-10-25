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
    file_uploaded_at: null,
    pinned_at: null,
    id: "item-1",
    title: "Goodreads",
    subtitle: null,
    image_url: null,
    image_storage_path: null,
    dominant_color: null,
    dominant_hue: null,
    rating_personal: null,
    verdict: null,
    done_at: null,
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
  async function renderSection(props: Partial<React.ComponentProps<typeof LibraryItemsSection>>) {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <LibraryItemsSection userId="user-1" shelfId="books" initialItems={[]} {...props} />,
      );
    });
  }

  it("passes the genre and mood to the pending refresh", async () => {
    mocks.fetchLibraryItemsPage.mockResolvedValue({ items: [makeItem()], hasMore: false });
    await renderSection({
      initialItems: [makeItem()],
      genre: "fantasy",
      mood: "epic",
    });
    expect(mocks.fetchLibraryItemsPage).toHaveBeenCalledWith("books", 0, "recent", {
      genre: "fantasy",
      mood: "epic",
    });
  });

  it("passes the genre and mood when it loads more", async () => {
    let onIntersect: IntersectionObserverCallback = () => {};
    class ObserverStub {
      constructor(cb: IntersectionObserverCallback) {
        onIntersect = cb;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("IntersectionObserver", ObserverStub);
    mocks.fetchLibraryItemsPage.mockResolvedValue({ items: [], hasMore: false });

    await renderSection({
      initialItems: [makeItem({ processing_status: "ready" })],
      initialHasMore: true,
      genre: "horror",
    });
    await act(async () => {
      onIntersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });

    expect(mocks.fetchLibraryItemsPage).toHaveBeenCalledWith("books", 1, "recent", {
      genre: "horror",
      mood: null,
    });
    vi.unstubAllGlobals();
  });

  it("shows an empty state with Clear filter when the filter matches nothing", async () => {
    const onClearFilter = vi.fn();
    await renderSection({ genre: "horror", onClearFilter });
    expect(container?.textContent).toContain("Nothing matches this filter");
    const clear = [...(container?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent === "Clear filter",
    );
    await act(async () => clear?.click());
    expect(onClearFilter).toHaveBeenCalledTimes(1);
  });
});
