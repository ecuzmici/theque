import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useItemRealtime } from "./useItemRealtime";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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

function RealtimeHarness() {
  useItemRealtime("user-1", "all", () => undefined);
  return <div>Library loaded</div>;
}

describe("useItemRealtime", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = undefined;
    container = undefined;
    vi.restoreAllMocks();
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
      root?.render(<RealtimeHarness />);
    });

    expect(container.textContent).toBe("Library loaded");
  });
});
