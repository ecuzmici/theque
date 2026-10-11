import { describe, expect, it } from "vitest";

import { RECOMMEND_MIN_ITEMS } from "@/lib/recommend/recommend-config";
import type { LibraryItemRow } from "@/lib/types/library-item";

import {
  dailyIndex,
  dayNumber,
  madeForYouAction,
  madeForYouEyebrow,
  monthsWaiting,
  selectUpNext,
} from "./up-next";

const RECENT = new Date(Date.now() - 5 * 86_400_000).toISOString();
const OLD = "2020-01-01T00:00:00.000Z";

function item(id: string, patch: Partial<LibraryItemRow> = {}): LibraryItemRow {
  return {
    id,
    title: id,
    subtitle: null,
    image_url: null,
    image_storage_path: null,
    dominant_color: null,
    dominant_hue: null,
    rating_personal: null,
    verdict: null,
    done_at: null,
    domain: "example.com",
    category: "books",
    status: "want",
    processing_status: "ready",
    created_at: RECENT,
    display: {},
    canonical_url: `https://example.com/${id}`,
    ...patch,
  };
}

const book = (id: string, patch: Partial<LibraryItemRow> = {}) => item(id, patch);
const film = (id: string, patch: Partial<LibraryItemRow> = {}) =>
  item(id, { category: "movies_and_tv", ...patch });

describe("dailyIndex", () => {
  it("returns 0 for an empty list", () => {
    expect(dailyIndex(0, 100, 1)).toBe(0);
  });

  it("stays in range and changes with the day", () => {
    const a = dailyIndex(7, 100, 0);
    const b = dailyIndex(7, 101, 0);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(7);
    expect(a).not.toBe(b);
  });

  it("uses UTC days", () => {
    expect(dayNumber(86_400_000 * 3 + 5)).toBe(3);
  });
});

describe("selectUpNext", () => {
  it("returns empty slots for an empty library", () => {
    expect(selectUpNext({ books: [], watch: [], forgotten: [] }, { day: 0 })).toEqual({
      tonight: null,
      forgotten: null,
      nextRead: null,
      nextWatch: null,
    });
  });

  it("gives every slot a different item", () => {
    const picks = selectUpNext(
      {
        books: [book("b1"), book("b2")],
        watch: [film("w1"), film("w2")],
        forgotten: [book("f1", { created_at: OLD })],
      },
      { day: 3 },
    );
    const ids = [picks.tonight, picks.forgotten, picks.nextRead, picks.nextWatch].map(
      (p) => p?.id,
    );
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(4);
    expect(picks.forgotten?.id).toBe("f1");
    expect(picks.nextRead?.category).toBe("books");
    expect(picks.nextWatch?.category).toBe("movies_and_tv");
  });

  it("keeps the picks stable for the same day", () => {
    const source = {
      books: [book("b1"), book("b2"), book("b3")],
      watch: [film("w1"), film("w2"), film("w3")],
      forgotten: [],
    };
    expect(selectUpNext(source, { day: 9 })).toEqual(selectUpNext(source, { day: 9 }));
  });

  it("skips done, dismissed, and inbox items", () => {
    const picks = selectUpNext(
      {
        books: [book("done", { status: "done" }), book("inbox", { status: "inbox" })],
        watch: [film("gone", { status: "dismissed" })],
        forgotten: [],
      },
      { day: 0 },
    );
    expect(picks).toEqual({ tonight: null, forgotten: null, nextRead: null, nextWatch: null });
  });

  it("shows no forgotten item when none is older than the cutoff", () => {
    const picks = selectUpNext(
      { books: [book("b1")], watch: [], forgotten: [book("young")] },
      { day: 0 },
    );
    expect(picks.forgotten).toBeNull();
  });

  it("does not count an old item that is already done as forgotten", () => {
    const picks = selectUpNext(
      { books: [], watch: [], forgotten: [book("old-done", { created_at: OLD, status: "done" })] },
      { day: 0 },
    );
    expect(picks.forgotten).toBeNull();
  });

  it("ignores items from the wrong category", () => {
    const picks = selectUpNext(
      { books: [film("w1")], watch: [book("b1")], forgotten: [] },
      { day: 0 },
    );
    expect(picks.nextRead).toBeNull();
    expect(picks.nextWatch).toBeNull();
  });

  it("uses a shuffled Tonight pick and keeps it out of the other slots", () => {
    const shuffled = book("b1");
    const picks = selectUpNext(
      { books: [book("b1")], watch: [film("w1")], forgotten: [] },
      { day: 0, tonight: shuffled },
    );
    expect(picks.tonight).toBe(shuffled);
    expect(picks.nextRead).toBeNull();
    expect(picks.nextWatch?.id).toBe("w1");
  });
});

describe("selectUpNext after a shuffle", () => {
  const source = {
    books: [book("b1"), book("b2"), book("b3"), book("b4")],
    watch: [film("w1"), film("w2"), film("w3"), film("w4")],
    forgotten: [book("f1", { created_at: OLD }), book("f2", { created_at: OLD })],
  };

  it("keeps the other daily slots when the new pick is not in them", () => {
    for (let day = 0; day < 20; day++) {
      const daily = selectUpNext(source, { day });
      const shuffled = selectUpNext(source, { day, tonight: item("x", { category: "articles" }) });
      expect(shuffled.forgotten).toBe(daily.forgotten);
      expect(shuffled.nextRead).toBe(daily.nextRead);
      expect(shuffled.nextWatch).toBe(daily.nextWatch);
    }
  });

  it("refills only the slot that held the new pick", () => {
    for (let day = 0; day < 20; day++) {
      const daily = selectUpNext(source, { day });
      const target = daily.nextRead!;
      const shuffled = selectUpNext(source, { day, tonight: target });
      expect(shuffled.tonight).toBe(target);
      expect(shuffled.nextWatch).toBe(daily.nextWatch);
      expect(shuffled.forgotten).toBe(daily.forgotten);
      expect(shuffled.nextRead).not.toBeNull();
      expect(shuffled.nextRead?.id).not.toBe(target.id);
    }
  });
});

describe("monthsWaiting", () => {
  it("rounds down and is at least 1", () => {
    const now = Date.parse("2026-10-11T00:00:00.000Z");
    expect(monthsWaiting("2026-10-01T00:00:00.000Z", now)).toBe(1);
    expect(monthsWaiting("2026-01-01T00:00:00.000Z", now)).toBe(9);
  });
});

describe("madeForYouAction", () => {
  it("does nothing without categories", () => {
    expect(madeForYouAction([])).toEqual({ kind: "none" });
  });

  it("starts the only ready category at once", () => {
    expect(madeForYouAction([{ shelfId: "books", saved: 5, ready: true }])).toEqual({
      kind: "start",
      shelfId: "books",
    });
  });

  it("opens the menu for a locked category or for two categories", () => {
    expect(madeForYouAction([{ shelfId: "books", saved: 1, ready: false }])).toEqual({
      kind: "menu",
    });
    expect(
      madeForYouAction([
        { shelfId: "books", saved: 5, ready: true },
        { shelfId: "watch", saved: 5, ready: true },
      ]),
    ).toEqual({ kind: "menu" });
  });
});

describe("madeForYouEyebrow", () => {
  it("says Picks when a category is ready", () => {
    expect(
      madeForYouEyebrow([
        { shelfId: "books", saved: 0, ready: false },
        { shelfId: "watch", saved: 9, ready: true },
      ]),
    ).toBe("Picks");
  });

  it("counts the saves left for the closest category", () => {
    expect(
      madeForYouEyebrow([
        { shelfId: "books", saved: 0, ready: false },
        { shelfId: "watch", saved: 1, ready: false },
      ]),
    ).toBe(`${RECOMMEND_MIN_ITEMS - 1} to unlock`);
  });
});
