import { afterEach, describe, expect, it } from "vitest";

import {
  allStepsComplete,
  computeSteps,
  persistChecklistDismissed,
  persistExtensionClicked,
  readChecklistDismissed,
  readExtensionClicked,
  shouldShowChecklist,
} from "@/lib/onboarding/onboarding-storage";

describe("computeSteps", () => {
  it("derives saved/markedDone from counts and extension from the flag", () => {
    expect(computeSteps(0, 0, false)).toEqual({
      saved: false,
      markedDone: false,
      extension: false,
    });
    expect(computeSteps(3, 0, false)).toEqual({
      saved: true,
      markedDone: false,
      extension: false,
    });
    expect(computeSteps(3, 1, true)).toEqual({
      saved: true,
      markedDone: true,
      extension: true,
    });
  });
});

describe("allStepsComplete", () => {
  it("is true only when every step is done", () => {
    expect(allStepsComplete({ saved: true, markedDone: true, extension: true })).toBe(true);
    expect(allStepsComplete({ saved: true, markedDone: true, extension: false })).toBe(false);
    expect(allStepsComplete({ saved: false, markedDone: false, extension: false })).toBe(false);
  });
});

describe("shouldShowChecklist", () => {
  const incomplete = computeSteps(1, 0, false);

  it("hides for a brand-new empty library (hero shows instead)", () => {
    expect(shouldShowChecklist(0, computeSteps(0, 0, false), false)).toBe(false);
  });

  it("shows once started, undismissed, with steps remaining", () => {
    expect(shouldShowChecklist(1, incomplete, false)).toBe(true);
  });

  it("hides when dismissed", () => {
    expect(shouldShowChecklist(1, incomplete, true)).toBe(false);
  });

  it("hides once every step is complete", () => {
    expect(shouldShowChecklist(5, computeSteps(5, 2, true), false)).toBe(false);
  });
});

describe("checklist localStorage flags", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("default to false and become true after persisting", () => {
    expect(readChecklistDismissed()).toBe(false);
    expect(readExtensionClicked()).toBe(false);
    persistChecklistDismissed();
    persistExtensionClicked();
    expect(readChecklistDismissed()).toBe(true);
    expect(readExtensionClicked()).toBe(true);
  });
});
