import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Radar } from "@/lib/radar";

import { RadarView } from "./RadarView";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const OK = { books: "ok", films: "ok" } as const;

describe("RadarView", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
  });

  async function render(radar: Radar) {
    await act(async () => {
      root?.render(<RadarView radar={radar} />);
    });
    return container!.textContent ?? "";
  }

  it("asks for ratings when nobody is followed", async () => {
    const text = await render({ entries: [], watching: { authors: 0, directors: 0 }, sources: OK });
    expect(text).toContain("Nobody to follow yet");
    expect(container!.querySelector('a[href="/library"]')).not.toBeNull();
  });

  it("says the lookups are off when both keys are missing", async () => {
    const text = await render({
      entries: [],
      watching: { authors: 2, directors: 1 },
      sources: { books: "no_key", films: "no_key" },
    });
    expect(text).toContain("Release lookups are off");
    expect(text).toContain("no Hardcover API key");
    expect(text).toContain("no TMDB API key");
  });

  it("says nothing is new when the sources answer with no titles", async () => {
    const text = await render({ entries: [], watching: { authors: 2, directors: 1 }, sources: OK });
    expect(text).toContain("Nothing new");
  });

  it("does not say nothing is new when a source with people to follow did not answer", async () => {
    const text = await render({
      entries: [],
      watching: { authors: 3, directors: 0 },
      sources: { books: "error", films: "ok" },
    });
    expect(text).not.toContain("Nothing new");
    expect(text).toContain("No releases to show");
    expect(text).toContain("Hardcover did not answer");
  });

  it("notes the missing films when some director lookups fail", async () => {
    const text = await render({
      entries: [],
      watching: { authors: 0, directors: 3 },
      sources: { books: "ok", films: "partial" },
    });
    expect(text).toContain("some films are missing");
    expect(text).not.toContain("Nothing new");
  });
});

