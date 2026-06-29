---
status: accepted
---

# Minimizable recommendation run: one global slot, hoisted above the page

The recommendation deck was a `Sheet` owned by `RecommendButton` on the Library
page, with its request state local to that component. Clicking outside closed it and
`reset()` wiped the state, so re-clicking Recommend fired a *second* request. We are
reworking it so a run can be **minimized** — stashed to a floating indicator while it
keeps loading — letting the user roam the app and be told when it is ready. That
intent forces the recommendation state out of the page and into a layout-level
provider, plus a deliberate split between "stash" and "discard." This ADR records the
shape because it is hard to reverse and several behaviors are surprising without it.

## Decisions

- **Recommendation state lives in a provider in `(app)/layout.tsx`, not the page.**
  "Navigate the app while it loads" means surviving route changes. In the App Router
  the page (`children`) unmounts on navigation but the layout/`AppShell` does not — so
  the active run, the floating indicator, *and the deck modal* all move up into a
  provider mounted in the layout. The toolbar `RecommendButton` becomes a thin trigger
  that calls into the provider.

- **One global slot, shelf-tagged — not one run per shelf.** The profile can have a
  single [Active run](../../CONTEXT.md) at a time. Starting a run for the other shelf
  **replaces** (cancels) the current one. Rejected per-shelf concurrency: two eligible
  shelves (Books, Watch), recommendations are a deliberate occasional action, and a
  single "Books picks ready" indicator is far simpler than reconciling two. The slot
  carries its shelf so the indicator and reopened deck show the right one.

- **Backdrop click and the × mean different things.** Clicking outside the deck
  **minimizes** (keeps the run alive); the deck's × and the indicator's × **dismiss**
  (cancel in-flight load or discard a loaded deck, slot goes empty). The two `Sheet`
  exits that were identical now diverge. Unconventional — outside-click normally closes
  — but it is the gesture the minimize feature needs, with ×-as-true-close as the
  intuitive counterpart.

- **Minimize is uniform across states, and reopening resumes exactly.** Backdrop
  stashes whether the run is *loading* or *done* (a half-swiped deck), and reopening
  returns to the same card with prior decisions intact. This requires hoisting the
  deck's cursors (`index` / `outcomes` / `askReason`), today local to `RecommendDeck`,
  into the provider. Rejected "minimize only while loading" as a second rule to learn;
  rejected "reopen restarts from the top" as making a stashed deck feel broken (saves
  are already logged server-side, but the UI wouldn't show them decided).

- **Ready is announced by the indicator itself — no toast, no auto-reopen.** On
  completion the floating pill flips from a spinner to a "ready" state and persists
  until acted on. No toast system exists and building one for this is unjustified; a
  persistent chip also can't be missed the way an auto-dismissing toast can.
  Auto-reopening was rejected outright — it steals focus and contradicts "let me keep
  navigating."

- **In-memory only; a reload discards the run.** State lives in the React provider;
  nothing is persisted to `localStorage` or the server. Cross-*route* survival is the
  ask and it is client-side nav. Surviving a *reload* would mean reworking the one-shot
  `POST /api/recommend` into a durable, re-attachable job — a much larger feature,
  out of scope.

- **Cancellation truly aborts and is guarded by a run id.** Dismiss-while-loading and
  other-shelf-replace now create real response races. Each run gets an `AbortController`
  (abort on cancel/replace) *and* a run id the provider checks on response, so a stale
  response that slips through is ignored rather than clobbering the current slot.

## Consequences

- The toolbar `RecommendButton` no longer owns `useRecommendations` or the `Sheet`; it
  only triggers the provider and reflects enablement. The deck can be reopened from the
  floating pill on **any** route, so the modal must render at the layout level.
- The floating pill must clear the mobile bottom nav using the existing
  `--ks-nav-height` + `env(safe-area-inset-bottom)`; on desktop it floats bottom-right.
- `RecommendDeck` loses ownership of its cursor state (lifted to the provider) so
  progress can survive minimize/reopen.
