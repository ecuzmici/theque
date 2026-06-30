---
status: accepted
---

# Cross-browser extension distribution: Chromium-family now, Firefox deferred

We ship the capture extension to **Chromium-family browsers** using the *same MV3
package and the same account-connect flow* — Edge gets its own Microsoft Edge Add-ons
listing, while Brave / Opera / Vivaldi are pointed at the existing Chrome Web Store
listing (they install it natively). **Firefox is deliberately deferred**: it would need
the account-connect handshake rebuilt, not just a re-package.

## Why these choices

- **The connect handshake is the dividing line.** Linking an account works by the thèque
  web page calling `chrome.runtime.sendMessage(extensionId, …)` (website→extension
  messaging), which the extension receives via `onMessageExternal`, gated by
  `externally_connectable` in the manifest. Chromium browsers (Edge, Brave, Opera,
  Vivaldi) support all three identically; **Firefox supports none of them**. So for
  Chromium the existing package is drop-in, and for Firefox the token would have to reach
  the extension by an entirely different mechanism (e.g. paste-token or redirect-with-token).
- **No server-side extension-ID coupling.** There is no extension-ID allowlist on the
  server; the connect page sends to whatever `chrome.runtime.id` the popup passes, and
  capture auth is a plain `bmly_` bearer token. Each store assigns a different extension
  ID, but the handshake is ID-agnostic, so the *same* codebase works across every
  Chromium store with zero changes. This is why "more browsers" is a packaging + listing
  task, not a code task.
- **Edge gets a real listing; the rest get documentation.** Edge Add-ons is the "easy
  way" for Edge users and gives proper auto-update and discoverability for the same zip.
  Brave and Vivaldi install Chrome Web Store extensions natively, and Opera can via a
  helper, so a docs section covers them at near-zero cost — no separate Opera Add-ons
  submission.

## Considered and rejected

- **Solve Firefox now (rebuild the connect flow).** Rejected for this round: it is a
  meaningfully larger, separate piece of work than re-packaging an unchanged extension.
  Tracked as a follow-up.
- **Submit to Opera Add-ons.** Rejected — another review pipeline to maintain for a small
  audience that the Chrome Web Store / Edge listings already serve.
- **Tell Edge users to install from the Chrome Web Store** (via "allow extensions from
  other stores"). Rejected as the primary path — worse UX (warning banner) and updates
  route through Chrome's store; kept only as an informal stopgap.
