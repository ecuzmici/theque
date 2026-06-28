import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import SearchPage from "./page";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Return a stable reference: SearchPage has `useEffect(..., [items])`, so a fresh
// `items` array on every render would loop forever inside `act`.
vi.mock("@/hooks/useItems", () => {
  const result = { items: [], loading: false, hasQuery: false };
  return { useDebouncedItemSearch: () => result };
});

describe("SearchPage", () => {
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

  it("renders friendly filter values instead of internal sentinel tokens", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<SearchPage />);
    });

    expect(container.textContent).toContain("Any category");
    expect(container.textContent).toContain("Any status");
    expect(container.textContent).not.toContain("__any__");
  });
});
