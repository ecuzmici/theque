import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ItemRatingCard, type RatingCardPatch } from "./ItemRatingCard";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type CardProps = Parameters<typeof ItemRatingCard>[0];

function props(patch: Partial<CardProps> = {}): CardProps {
  return {
    verb: "watched",
    isDone: false,
    rating: null,
    verdict: null,
    doneAt: null,
    onSave: vi.fn(async () => true),
    ...patch,
  };
}

function star(n: number): HTMLButtonElement {
  const el = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${n} star${n > 1 ? "s" : ""}"]`,
  );
  if (!el) throw new Error(`star ${n} not found`);
  return el;
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (el) => el.textContent?.trim() === text,
  );
}

/** Sets a textarea value the way React's onChange sees it. */
function typeInto(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("ItemRatingCard", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = undefined;
    container = undefined;
  });

  async function render(p: CardProps) {
    await act(async () => {
      root?.render(<ItemRatingCard {...p} />);
    });
  }

  it("asks the category question and hides the verdict field before the item is done", async () => {
    await render(props());

    expect(document.body.textContent).toContain("Watched it?");
    expect(document.body.textContent).toContain("Tap a star to rate it and mark it watched");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("marks the item done with the tapped rating", async () => {
    const onSave = vi.fn<(patch: RatingCardPatch) => Promise<boolean>>(async () => true);
    await render(props({ onSave }));

    await act(async () => {
      star(4).click();
    });

    expect(onSave).toHaveBeenCalledWith({ status: "done", rating_personal: 4 });
  });

  it("shows the verdict field once the parent reports the item done", async () => {
    await render(props());
    await render(props({ isDone: true, rating: 4, doneAt: "2026-10-01T12:00:00.000Z" }));

    expect(document.body.textContent).toContain("You watched it");
    expect(document.querySelector("textarea")).not.toBeNull();
    expect(star(4).getAttribute("aria-checked")).toBe("true");
  });

  it("marks the item done without a rating", async () => {
    const onSave = vi.fn<(patch: RatingCardPatch) => Promise<boolean>>(async () => true);
    await render(props({ onSave }));

    await act(async () => {
      buttonByText("Mark watched without a rating")?.click();
    });

    expect(onSave).toHaveBeenCalledWith({ status: "done" });
  });

  it("changes only the rating on a done item, and a tap on the same star clears it", async () => {
    const onSave = vi.fn<(patch: RatingCardPatch) => Promise<boolean>>(async () => true);
    await render(props({ isDone: true, rating: 3, onSave }));

    await act(async () => {
      star(5).click();
    });
    expect(onSave).toHaveBeenLastCalledWith({ rating_personal: 5 });

    await act(async () => {
      star(3).click();
    });
    expect(onSave).toHaveBeenLastCalledWith({ rating_personal: null });
  });

  it("shows an error and the old rating when the save fails", async () => {
    const onSave = vi.fn<(patch: RatingCardPatch) => Promise<boolean>>(async () => false);
    await render(props({ onSave }));

    await act(async () => {
      star(2).click();
    });

    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Could not save");
    expect(star(2).getAttribute("aria-checked")).toBe("false");
  });

  it("saves the trimmed verdict on blur, and only when it changed", async () => {
    const onSave = vi.fn<(patch: RatingCardPatch) => Promise<boolean>>(async () => true);
    await render(props({ isDone: true, rating: 4, verdict: "Old line", onSave }));
    const textarea = document.querySelector("textarea")!;

    await act(async () => {
      textarea.focus();
      textarea.blur();
    });
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      textarea.focus();
      typeInto(textarea, "  Stuck with me for weeks  ");
    });
    await act(async () => {
      textarea.blur();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ verdict: "Stuck with me for weeks" });
    expect(document.body.textContent).toContain("Saved");
  });

  it("clears the verdict with null when the field is emptied", async () => {
    const onSave = vi.fn<(patch: RatingCardPatch) => Promise<boolean>>(async () => true);
    await render(props({ isDone: true, verdict: "Old line", onSave }));
    const textarea = document.querySelector("textarea")!;

    await act(async () => {
      typeInto(textarea, "   ");
    });
    await act(async () => {
      buttonByText("Save verdict")?.click();
    });

    expect(onSave).toHaveBeenCalledWith({ verdict: null });
  });
});
