import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LibraryItemRow } from "@/lib/types/library-item";

import { useItemRealtime } from "./useItemRealtime";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type RealtimeHandler = (payload: { new: Record<string, unknown> }) => void;

const mocks = vi.hoisted(() => ({
  removeChannel: vi.fn(),
  subscribe: vi.fn(),
  on: vi.fn(),
  channel: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    channel: mocks.channel,
    removeChannel: mocks.removeChannel,
  })),
}));

function makeItem(patch: Partial<LibraryItemRow> = {}): LibraryItemRow {
  return {
    id: "item-1",
    title: "Some Title",
    subtitle: null,
    image_url: null,
    image_storage_path: null,
    domain: "example.com",
    category: "books",
    status: "done",
    processing_status: "ready",
    created_at: "2026-05-01T00:00:00.000Z",
    display: null,
    canonical_url: "https://example.com/a",
    dominant_color: null,
    dominant_hue: null,
    rating_personal: 5,
    verdict: "original plaintext verdict",
    done_at: "2026-05-02T00:00:00.000Z",
    ...patch,
  };
}

function RealtimeHarness({ initialItems }: { initialItems: LibraryItemRow[] }) {
  const [items, setItems] = useState(initialItems);
  useItemRealtime("user-1", "all", items, setItems);
  return <div data-testid="verdict">{items[0]?.verdict ?? ""}</div>;
}

describe("useItemRealtime", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;
  let capturedHandler: RealtimeHandler | undefined;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = undefined;
    container = undefined;
    capturedHandler = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not crash the library when realtime websockets are unavailable", async () => {
    mocks.subscribe.mockImplementation(() => {
      throw new Error("WebSocket not available: The operation is insecure.");
    });
    mocks.on.mockReturnValue({ subscribe: mocks.subscribe });
    mocks.channel.mockReturnValue({ on: mocks.on });

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<RealtimeHarness initialItems={[]} />);
    });

    expect(container.textContent).toBe("");
  });

  it("never renders note/verdict from a realtime payload — refetches the decrypted row instead", async () => {
    mocks.subscribe.mockReturnValue({});
    mocks.on.mockImplementation((_event: string, _filter: unknown, handler: RealtimeHandler) => {
      capturedHandler = handler;
      return { subscribe: mocks.subscribe };
    });
    mocks.channel.mockReturnValue({ on: mocks.on });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeItem({ verdict: "decrypted fresh verdict" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<RealtimeHarness initialItems={[makeItem()]} />);
    });

    expect(capturedHandler).toBeDefined();

    await act(async () => {
      // Simulate a Realtime UPDATE payload row straight off the wire — its
      // `verdict` is ciphertext-shaped and must never reach the render.
      capturedHandler?.({
        new: {
          id: "item-1",
          status: "done",
          category: "books",
          verdict: "enc.v1.tampered.payload.value",
        },
      });
      // Flush the fetch()->json()->setItems microtask chain.
      for (let i = 0; i < 6; i++) {
        await Promise.resolve();
      }
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/items/item-1");
    expect(container.textContent).toBe("decrypted fresh verdict");
    expect(container.textContent).not.toContain("enc.v1");
  });
});
