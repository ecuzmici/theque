import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ItemDetailResponseBody } from "@/lib/types/api";

import { useItemStatusRealtime } from "./useItemStatusRealtime";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type RealtimeHandler = (payload: { new: Record<string, unknown> }) => void;

const mocks = vi.hoisted(() => ({
  removeChannel: vi.fn(),
  subscribe: vi.fn(),
  on: vi.fn(),
  channel: vi.fn(),
  setAuth: vi.fn(async () => {}),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    channel: mocks.channel,
    removeChannel: mocks.removeChannel,
    auth: { getSession: async () => ({ data: { session: { access_token: "token-1" } } }) },
    realtime: { setAuth: mocks.setAuth },
  })),
}));

function Harness() {
  const [note, setNote] = useState("original note");
  useItemStatusRealtime("item-1", "user-1", (row) => setNote(row.note ?? ""));
  return <div>{note}</div>;
}

describe("useItemStatusRealtime", () => {
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

  it("never passes a realtime payload to onUpdate: it fetches the decrypted row", async () => {
    mocks.subscribe.mockReturnValue({});
    mocks.on.mockImplementation((_event: string, _filter: unknown, handler: RealtimeHandler) => {
      capturedHandler = handler;
      return { subscribe: mocks.subscribe };
    });
    mocks.channel.mockReturnValue({ on: mocks.on });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "item-1", note: "decrypted note" }) as ItemDetailResponseBody,
    });
    vi.stubGlobal("fetch", fetchMock);

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Harness />);
      // Flush the getSession()->setAuth()->channel() chain.
      for (let i = 0; i < 6; i++) {
        await Promise.resolve();
      }
    });
    expect(capturedHandler).toBeDefined();

    await act(async () => {
      capturedHandler?.({ new: { id: "item-1", note: "enc.v1.a.b.c" } });
      for (let i = 0; i < 6; i++) {
        await Promise.resolve();
      }
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/items/item-1");
    expect(container.textContent).toBe("decrypted note");
    expect(container.textContent).not.toContain("enc.v1");
  });

  it("ignores an update event for another item of the same user", async () => {
    mocks.subscribe.mockReturnValue({});
    let filter: unknown;
    mocks.on.mockImplementation((_event: string, f: unknown, handler: RealtimeHandler) => {
      filter = f;
      capturedHandler = handler;
      return { subscribe: mocks.subscribe };
    });
    mocks.channel.mockReturnValue({ on: mocks.on });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<Harness />);
      // Flush the getSession()->setAuth()->channel() chain.
      for (let i = 0; i < 6; i++) {
        await Promise.resolve();
      }
    });

    expect(filter).toMatchObject({ filter: "user_id=eq.user-1" });
    await act(async () => {
      capturedHandler?.({ new: { id: "item-2", note: "enc.v1.a.b.c" } });
      await Promise.resolve();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
