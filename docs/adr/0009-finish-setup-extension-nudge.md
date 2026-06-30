---
status: accepted
---

# Finish-setup nudge: live-ping detection, two-stage funnel, Chromium-desktop only

We push users to install **and** connect the capture extension with a self-clearing
banner at the top of `/library`. Detection is a **live client-side ping** from the web
page to a **list of known published extension IDs** (website→extension messaging via
`externally_connectable`), gated to **Chromium desktop**. The banner is **two-stage**:
not-installed → *install* CTA; installed-but-not-connected → *connect* CTA (reusing the
existing connect handshake); connected → gone. Dismissing it **snoozes** for ~14 days
rather than hiding it for good.

## Why these choices

- **Live ping over a server-side signal.** The ping answers "is the extension installed
  and working in *this* browser right now," so the nudge clears itself the instant the
  goal is met. A server-side "ever connected" flag (e.g. an existing capture token) goes
  stale: it stays suppressed after an uninstall and stays absent on a second machine
  where the user genuinely lacks the extension.
- **A list of known IDs, not one.** ADR 0007 ships a separate **Microsoft Edge Add-ons**
  listing, which gets a *different* extension ID. Pinging a list future-proofs detection
  so an Edge-store install isn't falsely nagged. The Chrome Web Store ID is the only
  entry today; the Edge ID slots in when that listing goes live.
- **Chromium desktop only.** `chrome.runtime` website→extension messaging — and the
  extension itself — exist only on Chromium-family desktop browsers. Nagging Firefox,
  Safari, or mobile users to install something they physically cannot is the worst
  outcome, so those users see nothing.
- **Two stages: install → connect.** "Installed" (the ping is reachable) is not the same
  as "capturing" (a `bmly_` token is present); connecting is a manual popup step.
  Clearing the banner on mere install would strand users in a silent half-setup with
  broken capture. The connect stage reuses the existing `connectChromeExtension`
  handshake against the *reachable* ID, so the whole funnel lives in the banner.
- **Snooze, not permanent dismiss.** Keeps the "incomplete without it" stance without
  nagging — the banner returns after ~14 days only if setup is still unfinished.
  Installing or connecting clears it regardless.

## Considered and rejected

- **Server-side "ever connected" detection.** Rejected: stale across uninstalls and
  devices, and never self-clears per browser.
- **Ping the single Chrome ID only.** Rejected: silently nags every Edge-store user once
  that listing ships.
- **Show the nudge to everyone (incl. non-Chromium / mobile).** Rejected: a dead-end CTA
  for users who cannot install it.
- **Hide on install (install-only nudge).** Rejected in favour of two-stage so a user who
  installs but never connects isn't left with broken capture and no prompt. Trade-off:
  install-only would have worked against the already-published build with no new release;
  two-stage requires shipping a new extension.
- **Permanent dismiss, or no dismiss at all.** Rejected as too weak and as nagware
  respectively; snooze is the middle path.

## Consequences

- **The connect stage requires a new extension release** whose external ping reports
  connect state (`{ ok: true, type: "theque.pong", connected: boolean }`). Until it
  ships, the published v1.0.0 answers the ping but without the flag → treat "reachable,
  no flag" as *installed, assume connected*, so the banner behaves as install-only for
  the existing base and never false-nags it.
- **Detection couples the client to two things staying correct:** `externally_connectable`
  continuing to match the app origins (already required by the connect flow), and the
  published extension IDs in the client list. A wrong or missing ID produces false nags.
- **Every new Chromium store listing must add its extension ID to the client list**,
  tracked alongside the ADR 0007 cross-browser rollout.
