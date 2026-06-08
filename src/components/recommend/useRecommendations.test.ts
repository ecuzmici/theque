/**
 * Tests for useRecommendations hook state machine.
 * Uses plain React + react-dom (no @testing-library/react dependency).
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, useEffect } from "react";

import {
  useRecommendations,
  type RecommendState,
} from "@/components/recommend/useRecommendations";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const SAMPLE_ITEMS = Array.from({ length: 5 }, (_, i) => ({
  title: `Book ${i}`,
  creator: `Author ${i}`,
  year: 2000 + i,
}));

const SAMPLE_CARDS = [
  {
    id: "card-1",
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

// Capture state from hook for assertions
let capturedState: RecommendState = { status: "idle" };
let capturedFetch: (shelfId: "books" | "watch", items: typeof SAMPLE_ITEMS) => void = () => {};
let capturedReset: () => void = () => {};

function TestHarness() {
  const { state, fetch, reset } = useRecommendations();
  useEffect(() => {
    capturedState = state;
    capturedFetch = fetch;
    capturedReset = reset;
  });
  return null;
}

afterEach(() => {
  vi.unstubAllGlobals();
  capturedState = { status: "idle" };
});

describe("useRecommendations", () => {
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
  });

  it("starts in idle state", () => {
    setup();
    expect(capturedState.status).toBe("idle");
  });

  it("transitions idle → loading → done on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ cards: SAMPLE_CARDS }),
      }),
    );

    setup();
    expect(capturedState.status).toBe("idle");

    await act(async () => {
      capturedFetch("books", SAMPLE_ITEMS);
    });

    // Should be done after the await
    expect(capturedState.status).toBe("done");
    if (capturedState.status === "done") {
      expect(capturedState.cards).toEqual(SAMPLE_CARDS);
    }
  });

  it("transitions idle → loading → error on API failure", async () => {
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
      capturedFetch("books", SAMPLE_ITEMS);
    });

    expect(capturedState.status).toBe("error");
    if (capturedState.status === "error") {
      expect(capturedState.message).toBe("Could not generate recommendations");
    }
  });

  it("transitions idle → loading → error on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Failed to fetch")),
    );

    setup();

    await act(async () => {
      capturedFetch("books", SAMPLE_ITEMS);
    });

    expect(capturedState.status).toBe("error");
    if (capturedState.status === "error") {
      expect(capturedState.message).toContain("Network error");
    }
  });

  it("reset() returns to idle state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ cards: SAMPLE_CARDS }),
      }),
    );

    setup();

    await act(async () => {
      capturedFetch("books", SAMPLE_ITEMS);
    });

    expect(capturedState.status).toBe("done");

    act(() => {
      capturedReset();
    });

    expect(capturedState.status).toBe("idle");
  });
});
