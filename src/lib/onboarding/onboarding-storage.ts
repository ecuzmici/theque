/**
 * First-run onboarding state.
 *
 * Two pieces of state, both cosmetic and per-device by design (mirroring the
 * `theque_wall_mode` / recommend-unlock localStorage pattern): whether the user
 * has dismissed the first-run checklist, and whether they've clicked through to
 * install the Chrome extension (which we can't always detect from this page).
 *
 * Step completion for "made a save" and "marked something done" is derived live
 * from the library counts, so it stays honest across devices; only the two
 * genuinely local bits are persisted. There is no profiles/preferences table,
 * so nothing here touches the database.
 */

export type OnboardingSteps = {
  /** Has at least one item in the library. */
  saved: boolean;
  /** Has marked at least one item done (closed the taste loop once). */
  markedDone: boolean;
  /** Has clicked through to install the extension (or it was detected). */
  extension: boolean;
};

/** Derive the three checklist steps from live counts + the local extension flag. */
export function computeSteps(
  totalCount: number,
  doneCount: number,
  extensionClicked: boolean,
): OnboardingSteps {
  return {
    saved: totalCount > 0,
    markedDone: doneCount > 0,
    extension: extensionClicked,
  };
}

export function allStepsComplete(steps: OnboardingSteps): boolean {
  return steps.saved && steps.markedDone && steps.extension;
}

/**
 * The slim first-run checklist shows only once the user has started (≥1 item),
 * hasn't dismissed it, and still has at least one step to go. A brand-new (empty)
 * library gets the full onboarding hero instead, so the checklist deliberately
 * waits for the first save.
 */
export function shouldShowChecklist(
  totalCount: number,
  steps: OnboardingSteps,
  dismissed: boolean,
): boolean {
  return totalCount > 0 && !dismissed && !allStepsComplete(steps);
}

const DISMISS_KEY = "theque_onboarding_dismissed";
const EXTENSION_KEY = "theque_onboarding_extension_clicked";

function readFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Storage unavailable (private mode / quota) — the flag just isn't sticky.
  }
}

export const readChecklistDismissed = () => readFlag(DISMISS_KEY);
export const persistChecklistDismissed = () => writeFlag(DISMISS_KEY);
export const readExtensionClicked = () => readFlag(EXTENSION_KEY);
export const persistExtensionClicked = () => writeFlag(EXTENSION_KEY);
