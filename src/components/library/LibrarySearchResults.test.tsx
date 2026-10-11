import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ItemSummaryPayload } from "@/lib/types/api";

import { LibrarySearchResults } from "./LibrarySearchResults";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/components/items/ItemGrid", () => ({
  ItemGrid: ({ items }: { items: { title: string }[] }) => (
    <ul data-testid="grid">
      {items.map((i) => (
        <li key={i.title}>{i.title}</li>
      ))}
    </ul>
  ),
}));

function summary(patch: Partial<ItemSummaryPayload>): ItemSummaryPayload {
  return {
    id: patch.title ?? "id",
    title: "Dune",
    subtitle: null,
    image_url: null,
    image_storage_path: null,
    domain: "example.com",
    category: "books",
    status: "want",
    processing_status: "ready",
    canonical_url: "https://example.com",
    created_at: "2026-05-17T12:00:00.000Z",
    display: {},
    dominant_color: null,
    dominant_hue: null,
    rating_personal: null,
    verdict: null,
    done_at: null,
    ...patch,
  } as ItemSummaryPayload;
}

describe("LibrarySearchResults", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function render(ui: React.ReactNode) {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(ui));
  }

  it("searches the active shelf and lists the hits", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [summary({ title: "Dune" }), summary({ title: "Dune Messiah", status: "done" })],
          next_cursor: null,
        }),
        { status: 200 },
      ),
    );

    await render(<LibrarySearchResults query="dune" shelfId="books" status={null} />);
    expect(container?.textContent).toContain("Searching…");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(320);
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/items?q=dune&category=books&status=inbox%2Cwant%2Cdone&limit=100",
      { signal: expect.any(AbortSignal) },
    );
    expect(container?.textContent).toContain("2 for “dune” in Books");
    expect(container?.querySelectorAll("li")).toHaveLength(2);
  });

  it("sends the status chip to the API", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: [], next_cursor: null }), { status: 200 }),
    );
    await render(<LibrarySearchResults query="dune" shelfId="all" status="done" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(320);
    });
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/items?q=dune&status=done&limit=100", {
      signal: expect.any(AbortSignal),
    });
    expect(container?.textContent).toContain("0 for “dune” · Done");
    expect(container?.textContent).toContain("Nothing matches");
  });

  it("does not fetch when the shelf and the status chip exclude each other", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await render(<LibrarySearchResults query="dune" shelfId="read" status="inbox" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(320);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(container?.textContent).toContain("Nothing matches");
  });
});
