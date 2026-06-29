/**
 * Tests for the recommendation run state machine — the single test seam for the
 * minimizable-recommendation feature (see issue #26 / ADR 0005).
 *
 * Uses plain React + react-dom (no @testing-library/react dependency), mirroring
 * the prior `useRecommendations.test.ts`.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, useEffect } from "react";

import {
  useRecommendationRun,
  type RecommendationRunApi,
} from "@/components/recommend/useRecommendationRun";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const SAMPLE_CARDS = [
  {
    id: "card-1",
    outcome_id: "outcome-1",
    title: "Piranesi",
    subtitle: "Susanna Clarke · 2020",
    description: "A magical story",
    reason: "Similar tone",
    canonical_url: "https://openlibrary.org/works/OL12345W",
    cover_url: null,
    search_query: "Piranesi Susanna Clarke book",
    source: "open_library" as const,
  },
];

// Latest hook value captured for assertions.
let api: RecommendationRunApi;

function TestHarness() {
  const value = useRecommendationRun();
  useEffect(() => {
    api = value;
  });
  return null;
}

function okFetch(cards = SAMPLE_CARDS) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ cards }),
  });
}

describe("useRecommendationRun", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  function setup() {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root!.render(createElement(TestHarness));
    });
  }

  afterEach(() => {
    if (root) {
      act(() => root!.unmount());
    }
    container?.remove();
    root = undefined;
    container = undefined;
    vi.unstubAllGlobals();
  });

  it("starts in the empty state", () => {
    setup();
    expect(api.runStatus).toBe("empty");
    expect(api.shelf).toBeNull();
  });

  it("transitions empty → loading → ready on success", async () => {
    vi.stubGlobal("fetch", okFetch());
    setup();

    await act(async () => {
      api.start("books");
    });

    expect(api.runStatus).toBe("ready");
    expect(api.shelf).toBe("books");
    expect(api.cards).toEqual(SAMPLE_CARDS);
  });

  it("transitions empty → loading → error on API failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({ error: "Could not generate recommendations" }),
      }),
    );
    setup();

    await act(async () => {
      api.start("books");
    });

    expect(api.runStatus).toBe("error");
    expect(api.errorMessage).toBe("Could not generate recommendations");
  });

  it("transitions empty → loading → error on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));
    setup();

    await act(async () => {
      api.start("books");
    });

    expect(api.runStatus).toBe("error");
    expect(api.errorMessage).toContain("Network error");
  });

  it("dismiss() returns to the empty state", async () => {
    vi.stubGlobal("fetch", okFetch());
    setup();

    await act(async () => {
      api.start("books");
    });
    expect(api.runStatus).toBe("ready");

    act(() => {
      api.dismiss();
    });

    expect(api.runStatus).toBe("empty");
    expect(api.shelf).toBeNull();
    expect(api.cards).toEqual([]);
  });

  it("retry() re-runs the current shelf", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    setup();

    await act(async () => {
      api.start("watch");
    });
    expect(api.shelf).toBe("watch");

    await act(async () => {
      api.retry();
    });

    expect(api.runStatus).toBe("ready");
    expect(api.shelf).toBe("watch");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Both calls targeted the same shelf.
    for (const call of fetchMock.mock.calls) {
      expect(JSON.parse(call[1].body)).toEqual({ shelfId: "watch" });
    }
  });
});
