import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDebouncedItemSearch } from "./useItems";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function SearchHarness({ q = "" }: { q?: string }) {
  const { items } = useDebouncedItemSearch({ q, category: "books", status: "" });
  return <output>{items.map((i) => i.title).join(",")}</output>;
}

function ListHarness() {
  useDebouncedItemSearch({
    q: "dune",
    category: ["restaurants", "travel"],
    status: ["want", "done"],
    limit: 100,
  });
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
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/items?category=books&limit=48", {
      signal: expect.any(AbortSignal),
    });
  });

  it("ignores a stale response that arrives after a newer one", async () => {
    const resolvers: Array<(res: Response) => void> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, init) =>
        new Promise<Response>((resolve, reject) => {
          resolvers.push(resolve);
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const body = (title: string) =>
      new Response(JSON.stringify({ items: [{ title }], next_cursor: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<SearchHarness q="old" />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(320);
    });
    await act(async () => {
      root?.render(<SearchHarness q="new" />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(320);
    });
    expect(resolvers).toHaveLength(2);

    await act(async () => {
      resolvers[1](body("new-result"));
    });
    await act(async () => {
      resolvers[0](body("old-result"));
    });

    expect(container.textContent).toBe("new-result");
  });

  it("sends list filters as CSV and honors the limit", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: [], next_cursor: null }), { status: 200 }),
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ListHarness />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(320);
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/items?q=dune&category=restaurants%2Ctravel&status=want%2Cdone&limit=100",
      { signal: expect.any(AbortSignal) },
    );
  });
});
