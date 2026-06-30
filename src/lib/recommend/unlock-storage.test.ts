import { afterEach, describe, expect, it } from "vitest";

import {
  effectiveUnlocked,
  persistCelebrated,
  persistUnlocked,
  readCelebrated,
  readUnlocked,
  shouldCelebrateUnlock,
} from "@/lib/recommend/unlock-storage";

describe("effectiveUnlocked", () => {
  it("unlocks at or above the target", () => {
    expect(effectiveUnlocked(3, false, 3)).toBe(true);
    expect(effectiveUnlocked(5, false, 3)).toBe(true);
  });

  it("stays locked below the target when nothing is stored", () => {
    expect(effectiveUnlocked(0, false, 3)).toBe(false);
    expect(effectiveUnlocked(2, false, 3)).toBe(false);
  });

  it("stays unlocked (sticky) once stored, even after the count drops below target", () => {
    expect(effectiveUnlocked(0, true, 3)).toBe(true);
    expect(effectiveUnlocked(2, true, 3)).toBe(true);
  });
});

describe("readUnlocked / persistUnlocked", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("defaults to false and is true after persisting, per category", () => {
    expect(readUnlocked("books")).toBe(false);
    persistUnlocked("books");
    expect(readUnlocked("books")).toBe(true);
    // Other categories are independent.
    expect(readUnlocked("watch")).toBe(false);
  });

  it("is idempotent", () => {
    persistUnlocked("watch");
    persistUnlocked("watch");
    expect(readUnlocked("watch")).toBe(true);
  });
});

describe("shouldCelebrateUnlock", () => {
  it("fires on a fresh, uncelebrated unlock transition", () => {
    expect(
      shouldCelebrateUnlock({ nowUnlocked: true, wasStored: false, celebrated: false }),
    ).toBe(true);
  });

  it("does not fire when the category was already unlocked on a prior visit", () => {
    expect(
      shouldCelebrateUnlock({ nowUnlocked: true, wasStored: true, celebrated: false }),
    ).toBe(false);
  });

  it("does not fire when already celebrated", () => {
    expect(
      shouldCelebrateUnlock({ nowUnlocked: true, wasStored: false, celebrated: true }),
    ).toBe(false);
  });

  it("does not fire while still locked", () => {
    expect(
      shouldCelebrateUnlock({ nowUnlocked: false, wasStored: false, celebrated: false }),
    ).toBe(false);
  });
});

describe("readCelebrated / persistCelebrated", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("defaults to false and is true after persisting, per category", () => {
    expect(readCelebrated("books")).toBe(false);
    persistCelebrated("books");
    expect(readCelebrated("books")).toBe(true);
    expect(readCelebrated("watch")).toBe(false);
  });

  it("is idempotent", () => {
    persistCelebrated("watch");
    persistCelebrated("watch");
    expect(readCelebrated("watch")).toBe(true);
  });

  it("is independent of the sticky-unlock flag", () => {
    persistUnlocked("books");
    expect(readCelebrated("books")).toBe(false);
    persistCelebrated("watch");
    expect(readUnlocked("watch")).toBe(false);
  });
});
