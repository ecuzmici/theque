/** localStorage key recording that the user dismissed the install prompt. */
export const INSTALL_DISMISSED_KEY = "theque_pwa_install_dismissed";

export type InstallPromptInputs = {
  /** User previously dismissed the prompt (persisted in localStorage). */
  dismissed: boolean;
  /** App is already running as an installed PWA (display-mode: standalone). */
  isStandalone: boolean;
  /** A native `beforeinstallprompt` event was captured (Chromium / Android). */
  hasNativePrompt: boolean;
  /** iOS Safari, where install is manual (Share → Add to Home Screen). */
  isIOSSafari: boolean;
};

/**
 * Pure decision for whether to surface the in-app install prompt. Show it only
 * when the app isn't already installed, the user hasn't dismissed it, and we
 * either have a native prompt to fire (Chromium/Android) or can show the manual
 * iOS instructions. Keeping this pure makes the gating logic unit-testable
 * without a DOM.
 */
export function shouldShowInstallPrompt({
  dismissed,
  isStandalone,
  hasNativePrompt,
  isIOSSafari,
}: InstallPromptInputs): boolean {
  if (isStandalone || dismissed) return false;
  return hasNativePrompt || isIOSSafari;
}
