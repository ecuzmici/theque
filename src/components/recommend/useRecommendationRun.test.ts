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
  {
    id: "card-2",
    outcome_id: "outcome-2",
    title: "The Buried Giant",
    subtitle: "Kazuo Ishiguro · 2015",
    description: "A misty quest",
    reason: "Dreamlike prose",
    canonical_url: "https://openlibrary.org/works/OL67890W",
    cover_url: null,
    search_query: "The Buried Giant Ishiguro book",
    source: "open_library" as const,
  },
];

/** A fetch stub whose single response is resolved manually, to control timing. */
function deferredFetch(cards = SAMPLE_CARDS) {
  let resolveResponse!: () => void;
  const gate = new Promise<void>((r) => {
    resolveResponse = r;
  });
  const fetchMock = vi.fn().mockImplementation(async () => {
    await gate;
    return { ok: true, json: async () => ({ cards }) };
  });
  return { fetchMock, resolveResponse };
}

const STALE_CARDS = [
  {
    ...SAMPLE_CARDS[0],
    id: "stale-1",
    outcome_id: "stale-outcome-1",
    title: "Stale pick from a replaced run",
  },
];

/** A fetch stub that queues every call so each can be resolved independently. */
function queuedFetch() {
  const calls: { shelfId: string; resolve: (cards: typeof SAMPLE_CARDS) => void }[] =
    [];
  const fetchMock = vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
    const shelfId = JSON.parse(opts.body as string).shelfId as string;
    return new Promise((resolve) => {
      calls.push({
        shelfId,
        resolve: (cards) => resolve({ ok: true, json: async () => ({ cards }) }),
      });
    });
  });
  return { fetchMock, calls };
}

/** Flush pending microtasks (fetch resolve + res.json()). */
function flush() {
  return new Promise((r) => setTimeout(r, 0));
}

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

  // ---- #28: minimize / reopen / same-shelf reopen ----

  it("starts a run in the open view", async () => {
    vi.stubGlobal("fetch", okFetch());
    setup();

    await act(async () => {
      api.start("books");
    });

    expect(api.view).toBe("open");
  });

  it("minimize keeps run status and flips the view; reopen flips it back", async () => {
    vi.stubGlobal("fetch", okFetch());
    setup();

    await act(async () => {
      api.start("books");
    });
    expect(api.runStatus).toBe("ready");

    act(() => {
      api.minimize();
    });
    expect(api.view).toBe("minimized");
    expect(api.runStatus).toBe("ready"); // unchanged

    act(() => {
      api.reopen();
    });
    expect(api.view).toBe("open");
    expect(api.runStatus).toBe("ready");
  });

  it("minimize keeps a still-loading run loading", async () => {
    const { fetchMock, resolveResponse } = deferredFetch();
    vi.stubGlobal("fetch", fetchMock);
    setup();

    act(() => {
      api.start("books");
    });
    expect(api.runStatus).toBe("loading");

    act(() => {
      api.minimize();
    });
    expect(api.view).toBe("minimized");
    expect(api.runStatus).toBe("loading");

    await act(async () => {
      resolveResponse();
      await Promise.resolve();
    });
    // Becomes ready while still minimized — no auto-reopen.
    expect(api.runStatus).toBe("ready");
    expect(api.view).toBe("minimized");
  });

  it("re-triggering the same shelf reopens without a second fetch", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    setup();

    await act(async () => {
      api.start("books");
    });
    act(() => {
      api.minimize();
    });
    expect(api.view).toBe("minimized");

    act(() => {
      api.start("books");
    });

    expect(api.view).toBe("open");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("deck cursor survives a minimize → reopen cycle", async () => {
    vi.stubGlobal("fetch", okFetch());
    setup();

    await act(async () => {
      api.start("books");
    });

    act(() => {
      api.saveCard();
    });
    expect(api.cursor.index).toBe(1);
    expect(api.cursor.outcomes).toEqual({ "outcome-1": "saved" });

    act(() => {
      api.minimize();
    });
    act(() => {
      api.reopen();
    });

    expect(api.cursor.index).toBe(1);
    expect(api.cursor.outcomes).toEqual({ "outcome-1": "saved" });
  });

  // ---- #29: single-slot replace across shelves + stale-response guard ----

  it("starting the other shelf replaces the run and reflects the new shelf", async () => {
    const { fetchMock, calls } = queuedFetch();
    vi.stubGlobal("fetch", fetchMock);
    setup();

    act(() => {
      api.start("books");
    });
    expect(api.shelf).toBe("books");
    expect(api.runStatus).toBe("loading");

    act(() => {
      api.start("watch");
    });
    expect(api.shelf).toBe("watch");
    expect(api.runStatus).toBe("loading");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The replaced (books) run resolves late — it must be ignored entirely.
    await act(async () => {
      calls[0].resolve(STALE_CARDS);
      await flush();
    });
    expect(api.shelf).toBe("watch");
    expect(api.runStatus).toBe("loading");
    expect(api.cards).toEqual([]);

    // The current (watch) run resolves — it wins the slot.
    await act(async () => {
      calls[1].resolve(SAMPLE_CARDS);
      await flush();
    });
    expect(api.runStatus).toBe("ready");
    expect(api.shelf).toBe("watch");
    expect(api.cards).toEqual(SAMPLE_CARDS);
  });

  it("ignores a response that resolves after the run was dismissed", async () => {
    const { fetchMock, calls } = queuedFetch();
    vi.stubGlobal("fetch", fetchMock);
    setup();

    act(() => {
      api.start("books");
    });
    expect(api.runStatus).toBe("loading");

    act(() => {
      api.dismiss();
    });
    expect(api.runStatus).toBe("empty");

    await act(async () => {
      calls[0].resolve(STALE_CARDS);
      await flush();
    });
    // The late response never repopulates the empty slot.
    expect(api.runStatus).toBe("empty");
    expect(api.shelf).toBeNull();
    expect(api.cards).toEqual([]);
  });

  // ---- #30: error & retry from the minimized pill ----

  it("errors while minimized, and retry returns to loading without reopening", async () => {
    let call = 0;
    let resolveRetry!: () => void;
    const fetchMock = vi.fn().mockImplementation(() => {
      call += 1;
      if (call === 1) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ error: "boom" }),
        });
      }
      return new Promise((resolve) => {
        resolveRetry = () => resolve({ ok: true, json: async () => ({ cards: SAMPLE_CARDS }) });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    setup();

    await act(async () => {
      api.start("books");
    });
    expect(api.runStatus).toBe("error");

    act(() => {
      api.minimize();
    });
    expect(api.view).toBe("minimized");
    expect(api.runStatus).toBe("error");

    act(() => {
      api.retry();
    });
    // Back to loading, still minimized (no auto-reopen of the deck).
    expect(api.runStatus).toBe("loading");
    expect(api.view).toBe("minimized");
    expect(api.shelf).toBe("books");

    await act(async () => {
      resolveRetry();
      await flush();
    });
    expect(api.runStatus).toBe("ready");
    expect(api.view).toBe("minimized");
  });

  // ---- ADR 0020: steer ----

  it("sends the steer in the request body and stores it on the run", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    setup();

    await act(async () => {
      api.start("watch", "eerie Horror");
    });

    expect(api.steer).toBe("eerie Horror");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      shelfId: "watch",
      steer: "eerie Horror",
    });
  });

  it("omits the steer from the body when the text is empty", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    setup();

    await act(async () => {
      api.start("books", "   ");
    });

    expect(api.steer).toBe("");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ shelfId: "books" });
  });

  it("retry() sends the same steer again", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    setup();

    await act(async () => {
      api.start("books", "cozy");
    });
    await act(async () => {
      api.retry();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      expect(JSON.parse(call[1].body)).toEqual({ shelfId: "books", steer: "cozy" });
    }
  });

  it("reopens without a second fetch for the same shelf and steer", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    setup();

    await act(async () => {
      api.start("books", "cozy");
    });
    act(() => {
      api.minimize();
    });
    act(() => {
      api.start("books", "  cozy ");
    });

    expect(api.view).toBe("open");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("starts a new run when the steer changes on the same shelf", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    setup();

    await act(async () => {
      api.start("books", "cozy");
    });
    await act(async () => {
      api.start("books", "dark");
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(api.steer).toBe("dark");
  });

  it("ignores the late response of a run that a new steer replaced", async () => {
    const { fetchMock, calls } = queuedFetch();
    vi.stubGlobal("fetch", fetchMock);
    setup();

    act(() => {
      api.start("books", "cozy");
    });
    act(() => {
      api.start("books", "dark");
    });
    expect(api.steer).toBe("dark");

    await act(async () => {
      calls[0].resolve(STALE_CARDS);
      await flush();
    });
    expect(api.runStatus).toBe("loading");
    expect(api.cards).toEqual([]);

    await act(async () => {
      calls[1].resolve(SAMPLE_CARDS);
      await flush();
    });
    expect(api.cards).toEqual(SAMPLE_CARDS);
    expect(api.steer).toBe("dark");
  });

  it("dismiss() clears the steer", async () => {
    vi.stubGlobal("fetch", okFetch());
    setup();

    await act(async () => {
      api.start("books", "cozy");
    });
    act(() => {
      api.dismiss();
    });

    expect(api.steer).toBe("");
  });
});
