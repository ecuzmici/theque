import { describe, expect, it } from "vitest";

import { MIN_GAP } from "./rank-key";
import {
  canUndo,
  type Contender,
  currentMatch,
  openSession,
  pick,
  progress,
  type RankSession,
  restart,
  standings,
  undo,
} from "./session";

function keysOf(writes: Array<{ id: string; rankOrder: number | null }>) {
  return Object.fromEntries(writes.map((w) => [w.id, w.rankOrder]));
}

/** Plays every match with a fixed true order (lower index is better). */
function playOut(session: RankSession, truth: string[]) {
  let s = session;
  let matches = 0;
  const writes: Array<{ id: string; rankOrder: number | null }> = [];
  for (let match = currentMatch(s); match; match = currentMatch(s)) {
    matches += 1;
    const step = pick(s, truth.indexOf(match.challenger) < truth.indexOf(match.opponent) ? "challenger" : "opponent");
    writes.push(...step.writes);
    s = step.session;
  }
  return { session: s, matches, writes };
}

describe("head-to-head session", () => {
  it("asks one match for two unranked items with the same rating and saves both places", () => {
    const session = openSession([
      { id: "a", rating: 5, rankOrder: null },
      { id: "b", rating: 5, rankOrder: null },
    ]);

    expect(currentMatch(session)).toEqual({ challenger: "b", opponent: "a" });

    const step = pick(session, "challenger");

    expect(standings(step.session)).toEqual(["b", "a"]);
    expect(currentMatch(step.session)).toBeNull();
    const byId = Object.fromEntries(step.writes.map((w) => [w.id, w.rankOrder]));
    expect(byId.b).toBeLessThan(byId.a!);
  });

  it("places an item with no peer of the same rating without a match", () => {
    const session = openSession([
      { id: "five", rating: 5, rankOrder: null },
      { id: "four", rating: 4, rankOrder: null },
    ]);

    expect(currentMatch(session)).toBeNull();
    expect(standings(session)).toEqual(["five", "four"]);
    expect(progress(session)).toEqual({ placed: 2, total: 2 });
  });

  it("sends the places that need no match with the next step", () => {
    const session = openSession([{ id: "solo", rating: 5, rankOrder: null }]);

    expect(keysOf(pick(session, "challenger").writes)).toEqual({ solo: 5.5 });
  });

  it("never lets a lower rating beat a higher rating", () => {
    const contenders: Contender[] = [
      { id: "a5", rating: 5, rankOrder: null },
      { id: "b4", rating: 4, rankOrder: null },
      { id: "c5", rating: 5, rankOrder: null },
      { id: "d4", rating: 4, rankOrder: null },
    ];
    const { session } = playOut(openSession(contenders), ["d4", "b4", "c5", "a5"]);

    expect(standings(session)).toEqual(["c5", "a5", "d4", "b4"]);
  });

  it("finds the place with binary search, in about log2(n) matches per item", () => {
    const ids = Array.from({ length: 16 }, (_, i) => `i${String(i).padStart(2, "0")}`);
    const truth = [...ids].reverse();
    const { session, matches } = playOut(
      openSession(ids.map((id) => ({ id, rating: 5, rankOrder: null }))),
      truth,
    );

    expect(standings(session)).toEqual(truth);
    expect(matches).toBeLessThanOrEqual(16 * 4);
  });

  it("keeps saved places when it opens again and asks only about new items", () => {
    const first = playOut(
      openSession([
        { id: "a", rating: 5, rankOrder: null },
        { id: "b", rating: 5, rankOrder: null },
      ]),
      ["b", "a"],
    );
    const saved = keysOf(first.writes);

    const reopened = openSession([
      { id: "a", rating: 5, rankOrder: saved.a! },
      { id: "b", rating: 5, rankOrder: saved.b! },
      { id: "c", rating: 5, rankOrder: null },
    ]);

    expect(standings(reopened)).toEqual(["b", "a"]);
    expect(currentMatch(reopened)?.challenger).toBe("c");
  });

  it("puts an item back in the queue when its rating changed after the match", () => {
    const session = openSession([
      { id: "a", rating: 5, rankOrder: 5.25 },
      { id: "b", rating: 5, rankOrder: 5.5 },
      { id: "moved", rating: 5, rankOrder: 4.5 },
    ]);

    expect(standings(session)).toEqual(["a", "b"]);
    expect(currentMatch(session)?.challenger).toBe("moved");
  });

  it("gives a whole rating block new keys when midpoints get too close", () => {
    // Each new item beats the current best, so each key halves the top gap.
    const ids = Array.from({ length: 40 }, (_, i) => `n${String(i).padStart(2, "0")}`);
    const truth = [...ids].reverse();
    const { session, writes } = playOut(
      openSession(ids.map((id) => ({ id, rating: 5, rankOrder: null }))),
      truth,
    );

    expect(standings(session)).toEqual(truth);
    // A respace writes keys for items that did not play: more writes than items.
    expect(writes.length).toBeGreaterThan(ids.length);
    const finalKeys = new Map<string, number | null>();
    for (const w of writes) finalKeys.set(w.id, w.rankOrder);
    const keys = truth.map((id) => finalKeys.get(id)!);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i]! - keys[i - 1]!).toBeGreaterThanOrEqual(MIN_GAP);
    }
    expect(keys.every((k) => k > 5 && k < 6)).toBe(true);
  });

  it("undo takes back the last match and clears the place it saved", () => {
    const opened = openSession([
      { id: "a", rating: 5, rankOrder: 5.5 },
      { id: "b", rating: 5, rankOrder: null },
    ]);
    const after = pick(opened, "challenger").session;

    expect(canUndo(after)).toBe(true);
    const back = undo(after);

    expect(back.writes).toEqual([{ id: "b", rankOrder: null }]);
    expect(currentMatch(back.session)).toEqual({ challenger: "b", opponent: "a" });
    expect(canUndo(back.session)).toBe(false);
  });

  it("restart clears every saved place in the category", () => {
    const session = openSession([
      { id: "a", rating: 5, rankOrder: 5.25 },
      { id: "b", rating: 5, rankOrder: 5.5 },
    ]);

    const step = restart(session);

    expect(keysOf(step.writes)).toEqual({ a: 5.5, b: null });
    expect(currentMatch(step.session)).toEqual({ challenger: "b", opponent: "a" });
  });
});
