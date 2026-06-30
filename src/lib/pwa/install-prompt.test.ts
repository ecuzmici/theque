import { describe, expect, it } from "vitest";

import { shouldShowInstallPrompt, type InstallPromptInputs } from "./install-prompt";

const base: InstallPromptInputs = {
  dismissed: false,
  isStandalone: false,
  hasNativePrompt: false,
  isIOSSafari: false,
};

describe("shouldShowInstallPrompt", () => {
  it("hides when already installed (standalone), even with a native prompt", () => {
    expect(
      shouldShowInstallPrompt({ ...base, isStandalone: true, hasNativePrompt: true }),
    ).toBe(false);
  });

  it("hides once the user has dismissed it", () => {
    expect(
      shouldShowInstallPrompt({ ...base, dismissed: true, hasNativePrompt: true }),
    ).toBe(false);
  });

  it("shows when a native beforeinstallprompt is available", () => {
    expect(shouldShowInstallPrompt({ ...base, hasNativePrompt: true })).toBe(true);
  });

  it("shows manual instructions on iOS Safari (no native prompt there)", () => {
    expect(shouldShowInstallPrompt({ ...base, isIOSSafari: true })).toBe(true);
  });

  it("stays hidden when there is no prompt and it is not iOS", () => {
    expect(shouldShowInstallPrompt(base)).toBe(false);
  });

  it("dismissal wins over an iOS manual prompt", () => {
    expect(
      shouldShowInstallPrompt({ ...base, dismissed: true, isIOSSafari: true }),
    ).toBe(false);
  });
});
