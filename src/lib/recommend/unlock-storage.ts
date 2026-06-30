/**
 * Sticky per-category unlock state for AI recommendations.
 *
 * The *capability* to run recommendations is always governed live by the server
 * (the real item-count gate). This module only persists the cosmetic achievement
 * state — "has this category ever crossed the unlock threshold?" — so the
 * "Made for you" banner does not re-lock when a user finishes (and thereby
 * removes from the active shelf) the very items that unlocked it. Mirrors the
 * localStorage presentation-pref pattern already used for `theque_wall_mode`.
 *
 * Per-device by design: the data is non-critical and cosmetic, so the worst case
 * (cleared storage / a new device) just re-shows the unlock — never blocks a run.
 */

import type { RecommendShelfId } from "@/lib/recommend/recommend-types";

const STORAGE_PREFIX = "theque_recommend_unlocked_";

function storageKey(shelfId: RecommendShelfId): string {
  return `${STORAGE_PREFIX}${shelfId}`;
}

/**
 * Effective unlock = has ever crossed the live gate (sticky) OR is currently at
 * or above it. Pure; the source of `storedUnlocked` is the caller's concern.
 */
export function effectiveUnlocked(
  savedCount: number,
  storedUnlocked: boolean,
  target: number,
): boolean {
  return storedUnlocked || savedCount >= target;
}

/** Read the persisted sticky-unlock flag for a category (false on the server). */
export function readUnlocked(shelfId: RecommendShelfId): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(storageKey(shelfId)) === "1";
  } catch {
    return false;
  }
}

/** Persist that a category has crossed the unlock threshold. Idempotent. */
export function persistUnlocked(shelfId: RecommendShelfId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(shelfId), "1");
  } catch {
    // Storage unavailable (private mode / quota) — the unlock just isn't sticky.
  }
}
