import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryItemRow } from "@/lib/types/library-item";

import { ItemCardVerdictControl } from "./ItemCardVerdictControl";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const fetchMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function makeItem(patch: Partial<LibraryItemRow> = {}): LibraryItemRow {
  return {
    id: "item-1",
    title: "Dune",
    subtitle: null,
    image_url: null,
    image_storage_path: null,
    domain: "example.com",
    category: "books",
    status: "want",
    processing_status: "ready",
    created_at: "2026-05-17T12:00:00.000Z",
    display: {},
    canonical_url: "https://example.com/dune",
    dominant_color: null,
    dominant_hue: null,
    rating_personal: null,
    verdict: null,
    done_at: null,
    ...patch,
  };
}

describe("ItemCardVerdictControl", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("marks a backlog item done and opens the verdict dialog", async () => {
    const onItemPatch = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <ItemCardVerdictControl item={makeItem()} shelfId="books" onItemPatch={onItemPatch} />,
      );
    });

    const button = Array.from(document.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("Mark read"),
    );
    expect(button).toBeTruthy();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(onItemPatch).toHaveBeenCalledWith(
      "item-1",
      expect.objectContaining({ status: "done" }),
      expect.objectContaining({ remove: false }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/items/item-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "done" }),
      }),
    );
    expect(document.body.textContent).toContain("You read it");
  });

  it("saves a verdict without re-marking done", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <ItemCardVerdictControl
          item={makeItem({ status: "done", rating_personal: 4, verdict: "Epic" })}
          shelfId="done"
        />,
      );
    });

    const button = Array.from(document.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("Edit verdict"),
    );

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const saveButton = Array.from(document.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("Save verdict"),
    );

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/items/item-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ rating_personal: 4, verdict: "Epic" }),
      }),
    );
  });

  it("skips the verdict while leaving the item done", async () => {
    const onItemPatch = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <ItemCardVerdictControl item={makeItem()} shelfId="books" onItemPatch={onItemPatch} />,
      );
    });

    const markButton = Array.from(document.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("Mark read"),
    );

    await act(async () => {
      markButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const skipButton = Array.from(document.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("Skip"),
    );

    await act(async () => {
      skipButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const verdictSaveCalls = fetchMock.mock.calls.filter((call) => {
      const init = call[1] as RequestInit | undefined;
      return typeof init?.body === "string" && init.body.includes("rating_personal");
    });
    expect(verdictSaveCalls).toHaveLength(0);
    expect(onItemPatch).toHaveBeenCalledWith(
      "item-1",
      expect.objectContaining({ status: "done" }),
      expect.any(Object),
    );
  });
});
