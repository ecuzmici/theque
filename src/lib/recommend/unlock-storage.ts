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
const CELEBRATED_PREFIX = "theque_recommend_celebrated_";

function storageKey(shelfId: RecommendShelfId): string {
  return `${STORAGE_PREFIX}${shelfId}`;
}

function celebratedKey(shelfId: RecommendShelfId): string {
  return `${CELEBRATED_PREFIX}${shelfId}`;
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

/**
 * Whether the one-time unlock celebration should fire for a category.
 *
 * `wasStored` is the sticky flag read *before* this load persisted the unlock,
 * so a library that was already unlocked on a previous visit reads `true` and is
 * never celebrated retroactively. A fresh celebration is therefore only the true
 * locked → unlocked transition observed on this device, and only if it has not
 * already been celebrated. Pure; the caller owns the storage reads.
 */
export function shouldCelebrateUnlock(args: {
  nowUnlocked: boolean;
  wasStored: boolean;
  celebrated: boolean;
}): boolean {
  return args.nowUnlocked && !args.wasStored && !args.celebrated;
}

/** Read whether a category's unlock has already been celebrated (false on server). */
export function readCelebrated(shelfId: RecommendShelfId): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(celebratedKey(shelfId)) === "1";
  } catch {
    return false;
  }
}

/** Persist that a category's unlock celebration has been shown. Idempotent. */
export function persistCelebrated(shelfId: RecommendShelfId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(celebratedKey(shelfId), "1");
  } catch {
    // Storage unavailable — worst case the celebration may re-show once.
  }
}
