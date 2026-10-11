import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MadeForYouTile } from "./MadeForYouTile";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const start = vi.fn();
const savedCount = vi.hoisted(() => ({ value: 0 }));

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

  it("starts the picks for the only ready category", async () => {
    savedCount.value = 50;
    await render();
    const button = container?.querySelector("button");
    expect(button?.textContent).toContain("Made for you");
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(start).toHaveBeenCalledWith("books");
  });

  it("opens a menu with the unlock goal while the category is locked", async () => {
    savedCount.value = 0;
    await render();
    expect(container?.textContent).toContain("to unlock");
    const button = container?.querySelector("button");
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(start).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Recommend from…");
  });
});
