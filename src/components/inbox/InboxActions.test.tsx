import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InboxActions } from "./InboxActions";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("InboxActions", () => {
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

  it("opens the triage menu without a Base UI group context error", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <InboxActions
          itemId="item_123"
          category={null}
          onOptimistic={vi.fn()}
        />,
      );
    });

    const trigger = document.querySelector("button");
    expect(trigger?.textContent).toContain("Triage");

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("Keep · Want");
  });
});
