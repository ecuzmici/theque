import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useLibrarySearch } from "./useLibrarySearch";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => nav.params }));

const state = { latest: undefined as unknown as ReturnType<typeof useLibrarySearch> };
function capture(value: ReturnType<typeof useLibrarySearch>) {
  state.latest = value;
}
function Harness() {
  capture(useLibrarySearch());
  return null;
}

describe("useLibrarySearch", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/library?shelf=books");
    nav.params = new URLSearchParams("shelf=books");
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
    vi.useRealTimers();
  });

  async function render() {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<Harness />));
  }

  it("starts from ?q= so a reload keeps the query", async () => {
    nav.params = new URLSearchParams("q=dune");
    await render();
    expect(state.latest.draft).toBe("dune");
    expect(state.latest.active).toBe(true);
  });

  it("writes the trimmed query to the URL after a pause and keeps other params", async () => {
    await render();
    await act(async () => state.latest.setDraft(" le guin "));
    expect(window.location.search).toBe("?shelf=books");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(window.location.search).toBe("?shelf=books&q=le+guin");
  });

  it("removes ?q= and the status chip when the query clears", async () => {
    nav.params = new URLSearchParams("shelf=books&q=dune");
    window.history.replaceState(null, "", "/library?shelf=books&q=dune");
    await render();
    await act(async () => state.latest.setStatus("done"));
    await act(async () => state.latest.clear());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(state.latest.status).toBeNull();
    expect(window.location.search).toBe("?shelf=books");
  });

  it("adopts a query change that comes from outside", async () => {
    nav.params = new URLSearchParams("q=dune");
    await render();
    nav.params = new URLSearchParams();
    await act(async () => root?.render(<Harness />));
    expect(state.latest.draft).toBe("");
  });
});
