import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MadeForYouTile } from "./MadeForYouTile";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const start = vi.fn();
const savedCount = vi.hoisted(() => ({ value: 0 }));
const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock("next/navigation", () => ({ useSearchParams: () => nav.params }));

vi.mock("@/components/recommend/RecommendationProvider", () => ({
  useRecommendationContext: () => ({ start }),
}));

vi.mock("@/lib/supabase/client", () => {
  const query = {
    select: () => query,
    eq: () => query,
    not: () => query,
    neq: () => Promise.resolve({ count: savedCount.value }),
  };
  return { createClient: () => ({ from: () => query }) };
});

function recommendButton() {
  return Array.from(document.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "Recommend",
  );
}

describe("MadeForYouTile", () => {
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
    start.mockReset();
    nav.params = new URLSearchParams();
    window.localStorage.clear();
  });

  async function render() {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<MadeForYouTile booksEnabled watchEnabled={false} thumbs={[]} />);
    });
  }

  async function openSheet() {
    await act(async () => {
      container?.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  it("opens the sheet, and Recommend starts an unsteered run", async () => {
    savedCount.value = 50;
    await render();
    expect(container?.querySelector("button")?.textContent).toContain("Made for you");
    expect(start).not.toHaveBeenCalled();
    await openSheet();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => {
      recommendButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(start).toHaveBeenCalledWith("books", "");
  });

  it("passes the pre-filled mood to start", async () => {
    savedCount.value = 50;
    nav.params = new URLSearchParams("shelf=books&mood=eerie");
    await render();
    await openSheet();
    await act(async () => {
      recommendButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(start).toHaveBeenCalledWith("books", "eerie");
  });

  it("opens the sheet with Recommend disabled while the category is locked", async () => {
    savedCount.value = 0;
    await render();
    expect(container?.textContent).toContain("to unlock");
    await openSheet();
    expect(recommendButton()?.disabled).toBe(true);
    expect(start).not.toHaveBeenCalled();
  });
});
