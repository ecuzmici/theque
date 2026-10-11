import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TasteChipRow, visibleFacets } from "./TasteChipRow";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const facets = {
  genres: [
    { key: "horror", label: "Horror", count: 4 },
    { key: "comedy", label: "Comedy", count: 9 },
    { key: "family", label: "Family", count: 1 },
  ],
  moods: [
    { key: "eerie", label: "Eerie", count: 3 },
    { key: "cozy", label: "Cozy", count: 1 },
  ],
};

describe("visibleFacets", () => {
  it("drops chips under the minimum and orders by count", () => {
    expect(visibleFacets(facets.genres, null, () => null).map((f) => f.key)).toEqual([
      "comedy",
      "horror",
    ]);
  });

  it("keeps an active chip that is under the minimum", () => {
    expect(visibleFacets(facets.genres, "family", () => null).map((f) => f.key)).toContain(
      "family",
    );
  });

  it("adds an active key that the facets lack", () => {
    const out = visibleFacets([], "horror", () => "Horror");
    expect(out).toEqual([{ key: "horror", label: "Horror", count: 0 }]);
  });
});

describe("TasteChipRow", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
    document.body.innerHTML = "";
  });

  async function render(props: Partial<React.ComponentProps<typeof TasteChipRow>> = {}) {
    const onGenreChange = vi.fn();
    const onMoodChange = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root?.render(
        <TasteChipRow
          category="movies_and_tv"
          facets={facets}
          genre={null}
          mood={null}
          onGenreChange={onGenreChange}
          onMoodChange={onMoodChange}
          {...props}
        />,
      ),
    );
    return { onGenreChange, onMoodChange };
  }

  const button = (name: string) =>
    [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(name));

  it("shows the Mood chip first, then genre chips with counts", async () => {
    await render();
    const labels = [...document.querySelectorAll("button")].map((b) => b.textContent);
    expect(labels).toEqual(["Mood", "Comedy9", "Horror4"]);
    expect(
      document.querySelector('[role="group"][aria-label="Filter by genre and mood"]'),
    ).not.toBeNull();
  });

  it("toggles a genre with aria-pressed", async () => {
    const { onGenreChange } = await render({ genre: "horror" });
    expect(button("Horror")?.getAttribute("aria-pressed")).toBe("true");
    expect(button("Comedy")?.getAttribute("aria-pressed")).toBe("false");
    await act(async () => button("Horror")?.click());
    expect(onGenreChange).toHaveBeenCalledWith(null);
    await act(async () => button("Comedy")?.click());
    expect(onGenreChange).toHaveBeenCalledWith("comedy");
  });

  it("uses no amber class on any chip", async () => {
    await render({ genre: "horror", mood: "eerie" });
    expect(container?.innerHTML).not.toMatch(/amber/);
  });

  it("opens the mood popover and picks a mood", async () => {
    const { onMoodChange } = await render();
    await act(async () => button("Mood")?.click());
    expect(document.body.textContent).toContain("In the mood for…");
    await act(async () => button("Eerie")?.click());
    expect(onMoodChange).toHaveBeenCalledWith("eerie");
  });

  it("shows the active mood label with a clear button", async () => {
    const { onMoodChange } = await render({ mood: "eerie" });
    expect(button("Eerie")).toBeDefined();
    await act(async () =>
      (document.querySelector('[aria-label="Clear mood Eerie"]') as HTMLElement).click(),
    );
    expect(onMoodChange).toHaveBeenCalledWith(null);
  });

  it("renders nothing when no chip qualifies", async () => {
    await render({ facets: { genres: [], moods: [] } });
    expect(container?.innerHTML).toBe("");
  });

  it("renders nothing when the facets are missing and not loading", async () => {
    await render({ facets: null });
    expect(container?.innerHTML).toBe("");
  });
});
