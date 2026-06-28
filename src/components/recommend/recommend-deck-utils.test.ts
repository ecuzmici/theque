import { describe, expect, it, vi, afterEach } from "vitest";

import {
  LOADING_STATUS_LINES,
  captureRecommendationUrl,
  logRecommendOutcome,
} from "@/components/recommend/recommend-deck-utils";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LOADING_STATUS_LINES", () => {
  it("has at least two distinct messages for rotation", () => {
    expect(LOADING_STATUS_LINES.length).toBeGreaterThanOrEqual(2);
    expect(new Set(LOADING_STATUS_LINES).size).toBe(LOADING_STATUS_LINES.length);
  });
});

describe("logRecommendOutcome", () => {
  it("POSTs to outcomes API without awaiting", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    logRecommendOutcome("outcome-1", "saved");

    expect(fetchMock).toHaveBeenCalledWith("/api/recommend/outcomes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcomeId: "outcome-1", outcome: "saved" }),
    });
  });

  it("includes dismissReason when dismissing", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    logRecommendOutcome("outcome-2", "dismissed", "not_my_thing");

    expect(fetchMock).toHaveBeenCalledWith("/api/recommend/outcomes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outcomeId: "outcome-2",
        outcome: "dismissed",
        dismissReason: "not_my_thing",
      }),
    });
  });
});

describe("captureRecommendationUrl", () => {
  it("POSTs to capture API without awaiting", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    captureRecommendationUrl("https://openlibrary.org/works/OL12345W");

    expect(fetchMock).toHaveBeenCalledWith("/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://openlibrary.org/works/OL12345W",
        source: "manual",
      }),
    });
  });
});
