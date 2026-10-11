/**
 * Published identities for the capture extension — the single source of truth
 * for the Chrome Web Store listing and for the finish-setup nudge's live
 * detection ping (see `extension-detect.ts` and ADR 0009).
 *
 * Detection pings every id in `KNOWN_EXTENSION_IDS`; any reachable build counts
 * as installed. ADR 0007 ships a separate Microsoft Edge Add-ons listing, which
 * gets a *different* extension id — add it here when that listing goes live so
 * an Edge-store install isn't falsely nagged.
 */
export const CHROME_EXTENSION_ID = "blahodpkabcnliljldelkoggeemfgdak";

/** Every published extension id detection should treat as "installed". */
export const KNOWN_EXTENSION_IDS = [CHROME_EXTENSION_ID] as const;

/** Chrome Web Store listing — the "Add to Chrome" destination. */
export const CHROME_STORE_URL = `https://chromewebstore.google.com/detail/${CHROME_EXTENSION_ID}`;

const UNPACKED_EXTENSION_ID = /^[a-p]{32}$/;

/**
 * True when the connect page may send a capture token to this extension id.
 * A crafted link can name any installed extension, so production accepts the
 * published ids only. Development also accepts an unpacked build id.
 */
export function isAllowedExtensionId(id: string, nodeEnv = process.env.NODE_ENV): boolean {
  if ((KNOWN_EXTENSION_IDS as readonly string[]).includes(id)) return true;
  return nodeEnv === "development" && UNPACKED_EXTENSION_ID.test(id);
}
