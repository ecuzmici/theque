import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MadeForYouSheet, sheetDefaults } from "./MadeForYouSheet";
import type { RecommendOption } from "./up-next";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => nav.params }));

const BOTH_READY: RecommendOption[] = [
  { shelfId: "books", saved: 10, ready: true },
  { shelfId: "watch", saved: 10, ready: true },
];

describe("sheetDefaults", () => {
  it("starts on the shelf param when it is books or watch", () => {
    expect(sheetDefaults({ shelf: "watch" }, BOTH_READY).shelf).toBe("watch");
    expect(sheetDefaults({ shelf: "books" }, BOTH_READY).shelf).toBe("books");
  });

  it("starts on Books for any other shelf", () => {
    expect(sheetDefaults({ shelf: "articles" }, BOTH_READY).shelf).toBe("books");
    expect(sheetDefaults({}, BOTH_READY).shelf).toBe("books");
  });

  it("falls back to the first ready shelf when the wanted shelf is locked", () => {
    const options: RecommendOption[] = [
      { shelfId: "books", saved: 0, ready: false },
      { shelfId: "watch", saved: 9, ready: true },
    ];
    expect(sheetDefaults({ shelf: "books" }, options).shelf).toBe("watch");
  });

  it("builds the steer from the genre and mood chips", () => {
    expect(
      sheetDefaults({ shelf: "watch", genre: "horror", mood: "eerie" }, BOTH_READY).steer,
    ).toBe("eerie Horror");
  });

  it("gives an empty steer without chips", () => {
    expect(sheetDefaults({ shelf: "books" }, BOTH_READY).steer).toBe("");
  });
});

describe("MadeForYouSheet", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
    nav.params = new URLSearchParams();
  });

  async function render(options = BOTH_READY, onSubmit = vi.fn()) {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <MadeForYouSheet open onOpenChange={() => {}} options={options} onSubmit={onSubmit} />,
      );
    });
    return onSubmit;
  }

  const field = () => document.querySelector('input[type="text"]') as HTMLInputElement;
  const buttonByText = (text: string) =>
    Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === text);

  async function click(el: Element | undefined | null) {
    await act(async () => {
      el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  async function type(value: string) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    await act(async () => {
      setter?.call(field(), value);
      field().dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("is a dialog with a title and a labelled field", async () => {
    await render();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("Made for you");
    expect(document.querySelector(`label[for="${field().id}"]`)?.textContent).toBe(
      "In the mood for",
    );
  });

  it("pre-fills the field from the genre and mood params", async () => {
    nav.params = new URLSearchParams("shelf=watch&genre=horror&mood=eerie");
    await render();
    expect(field().value).toBe("eerie Horror");
  });

  it("does not pre-fill from the search text", async () => {
    nav.params = new URLSearchParams("shelf=books&q=piranesi");
    await render();
    expect(field().value).toBe("");
  });

  it("starts on the shelf param", async () => {
    nav.params = new URLSearchParams("shelf=watch");
    const onSubmit = await render();
    await click(buttonByText("Recommend"));
    expect(onSubmit).toHaveBeenCalledWith("watch", "");
  });

  it("fills the field from a mood chip and marks it pressed", async () => {
    await render();
    expect(buttonByText("Slow burn")?.getAttribute("aria-pressed")).toBe("false");
    await click(buttonByText("Slow burn"));
    expect(field().value).toBe("slow burn");
    expect(buttonByText("Slow burn")?.getAttribute("aria-pressed")).toBe("true");
    await click(buttonByText("Slow burn"));
    expect(field().value).toBe("");
  });

  it("shows all 10 mood chips", async () => {
    await render();
    expect(document.querySelectorAll("[aria-pressed]")).toHaveLength(10);
  });

  it("submits the shelf and the cleaned steer on Recommend", async () => {
    const onSubmit = await render();
    await click(document.querySelector('[role="radio"][aria-checked="false"]'));
    await type("  quiet  and eerie ");
    await click(buttonByText("Recommend"));
    expect(onSubmit).toHaveBeenCalledWith("watch", "quiet and eerie");
  });

  it("submits on Enter in the field", async () => {
    const onSubmit = await render();
    await type("cozy");
    await act(async () => {
      field().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onSubmit).toHaveBeenCalledWith("books", "cozy");
  });

  it("disables a locked shelf and shows its hint", async () => {
    await render([
      { shelfId: "books", saved: 1, ready: false },
      { shelfId: "watch", saved: 9, ready: true },
    ]);
    const radios = document.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    expect(radios[0].disabled).toBe(true);
    expect(radios[1].disabled).toBe(false);
    expect(radios[1].getAttribute("aria-checked")).toBe("true");
    expect(document.body.textContent).toContain("to unlock Books");
  });

  it("disables Recommend when every shelf is locked", async () => {
    const onSubmit = await render([{ shelfId: "books", saved: 0, ready: false }]);
    const button = buttonByText("Recommend") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
