import { describe, expect, it } from "vitest";

import {
  pickResurfacedItem,
  resurfaceLabel,
  startOfCalendarMonthISO,
  type ResurfaceCandidate,
} from "./on-this-day";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-07-01T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW - n * DAY_MS).toISOString();

function item(over: Partial<ResurfaceCandidate> & { id: string }): ResurfaceCandidate {
  return {
    title: `title-${over.id}`,
    created_at: daysAgo(400),
    status: "want",
    ...over,
  };
}

describe("pickResurfacedItem", () => {
  it("returns null for an empty pool", () => {
    expect(pickResurfacedItem([], NOW)).toBeNull();
  });

  it("returns null for a too-young library (no anniversary, oldest < 30 days)", () => {
    const pool = [
      item({ id: "a", created_at: daysAgo(5) }),
      item({ id: "b", created_at: daysAgo(10) }),
      item({ id: "c", created_at: daysAgo(20) }),
    ];
    expect(pickResurfacedItem(pool, NOW)).toBeNull();
  });

  it("prefers a ~1-year-old save (year tier) over six-month and recent saves", () => {
    const pool = [
      item({ id: "recent", created_at: daysAgo(40) }),
      item({ id: "sixmo", created_at: daysAgo(183) }),
      item({ id: "year", created_at: daysAgo(360) }),
    ];
    const pick = pickResurfacedItem(pool, NOW);
    expect(pick?.item.id).toBe("year");
    expect(pick?.tier).toBe("year");
  });

  it("falls back to the six-months tier when nothing is ~1 year old", () => {
    const pool = [
      item({ id: "recent", created_at: daysAgo(40) }),
      item({ id: "sixmo", created_at: daysAgo(180) }),
      item({ id: "old", created_at: daysAgo(300) }), // outside both windows
    ];
    const pick = pickResurfacedItem(pool, NOW);
    expect(pick?.item.id).toBe("sixmo");
    expect(pick?.tier).toBe("six-months");
  });

  it("falls back to the oldest still-unfinished save when no anniversary matches", () => {
    const pool = [
      item({ id: "a", created_at: daysAgo(40) }),
      item({ id: "b", created_at: daysAgo(60) }),
      item({ id: "oldest", created_at: daysAgo(250) }),
    ];
    const pick = pickResurfacedItem(pool, NOW);
    expect(pick?.item.id).toBe("oldest");
    expect(pick?.tier).toBe("oldest");
  });

  it("excludes done and dismissed items", () => {
    const pool = [
      item({ id: "done", created_at: daysAgo(365), status: "done" }),
      item({ id: "dismissed", created_at: daysAgo(365), status: "dismissed" }),
      item({ id: "want", created_at: daysAgo(365), status: "want" }),
    ];
    expect(pickResurfacedItem(pool, NOW)?.item.id).toBe("want");

    const onlyConsumed = [
      item({ id: "done", created_at: daysAgo(365), status: "done" }),
      item({ id: "dismissed", created_at: daysAgo(365), status: "dismissed" }),
    ];
    expect(pickResurfacedItem(onlyConsumed, NOW)).toBeNull();
  });

  it("within the year window, picks the save closest to the anniversary (ties → more recent)", () => {
    const pool = [
      item({ id: "far", created_at: daysAgo(355) }), // |10|
      item({ id: "older", created_at: daysAgo(366) }), // |1|, ties with 'newer'
      item({ id: "newer", created_at: daysAgo(364) }), // |1|, more recent → wins tie
    ];
    expect(pickResurfacedItem(pool, NOW)?.item.id).toBe("newer");
  });

  it("ignores rows with no created_at or no title", () => {
    const pool = [
      item({ id: "no-date", created_at: null }),
      item({ id: "no-title", title: null, created_at: daysAgo(365) }),
      item({ id: "good", created_at: daysAgo(365) }),
    ];
    expect(pickResurfacedItem(pool, NOW)?.item.id).toBe("good");
  });
});

describe("resurfaceLabel", () => {
  it("maps each tier to a calm caption", () => {
    expect(resurfaceLabel("year")).toBe("A year ago");
    expect(resurfaceLabel("six-months")).toBe("Six months ago");
    expect(resurfaceLabel("oldest")).toBe("A while ago");
  });
});

describe("startOfCalendarMonthISO", () => {
  it("returns the first instant of the current UTC month", () => {
    expect(startOfCalendarMonthISO(Date.parse("2026-07-17T08:30:00.000Z"))).toBe(
      "2026-07-01T00:00:00.000Z",
    );
    expect(startOfCalendarMonthISO(Date.parse("2026-01-01T00:00:00.000Z"))).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });
});
