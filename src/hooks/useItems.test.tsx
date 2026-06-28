import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDebouncedItemSearch } from "./useItems";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function SearchHarness() {
  useDebouncedItemSearch({ q: "", category: "books", status: "" });
  return null;
}

describe("useDebouncedItemSearch", () => {
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

  it("does not refetch on its own rerender when filter values are unchanged", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: [], next_cursor: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<SearchHarness />);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(320);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/items?category=books&limit=48");
  });
});
