import { describe, expect, it } from "vitest";

import { isPlaced, keyBetween, MIN_GAP, spreadKeys } from "./rank-key";

describe("rank key", () => {
  it("gives the midpoint of the rating band to the first item in a rating", () => {
    expect(keyBetween(5, null, null)).toBe(5.5);
  });

  it("gives the midpoint between two neighbours", () => {
    expect(keyBetween(4, 4.25, 4.5)).toBe(4.375);
  });

  it("uses the band edges when a neighbour is missing", () => {
    expect(keyBetween(4, null, 4.5)).toBe(4.25);
    expect(keyBetween(4, 4.5, null)).toBe(4.75);
  });

  it("returns null when the neighbours are too close for a safe midpoint", () => {
    expect(keyBetween(5, 5.3, 5.3 + MIN_GAP / 2)).toBeNull();
  });

  it("spreads keys evenly inside the band, best first", () => {
    expect(spreadKeys(3, 3)).toEqual([3.25, 3.5, 3.75]);
  });

  it("accepts a key only inside the band of its own rating", () => {
    expect(isPlaced(5, 5.5)).toBe(true);
    expect(isPlaced(4, 5.5)).toBe(false);
    expect(isPlaced(5, 5)).toBe(false);
    expect(isPlaced(5, 6)).toBe(false);
  });
});
