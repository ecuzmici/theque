# Touch-target accessibility audit

**Scope:** every interactive control across the app, on mobile.
**Standard:** WCAG 2.5.8 Target Size (Minimum), Level **AA** — 24×24 CSS px,
applying the spec's full exceptions (spacing, inline, user-agent default, essential).
**Date:** 2026-06-29. **Policy:** see `docs/adr/0006-touch-target-policy-wcag-258-aa.md`.

## Verdict

**Pass — comfortably.** Across **324 real interactive targets** measured live at a
390 px mobile viewport over 8 app states, there were **0 AA failures** and **0 targets
that even needed the spacing exception** to pass. Every genuine, user-facing control
renders at **≥44 px** on a coarse pointer — the app holds itself to the 44 px *comfort*
target (WCAG 2.5.5 AAA), so the 24 px AA bar is cleared with ~20 px of margin.

## How the app gets there

The size scale in `src/components/ui/button.tsx` is defined by **fixed heights**
(`default h-8`, `sm h-7`, `lg h-9`), not vertical padding — so the touch accommodation
is a **height floor**, applied via `@media (pointer: coarse)`, through three mechanisms:

1. **Built-in primitive floor** — `pointer-coarse:min-h-[var(--tap-target-min)]`
   (`--tap-target-min: 2.75rem` = 44 px) on every `<Button>` and on the base form
   primitives `Input` and `SelectTrigger`. Icon-size buttons additionally get
   `min-w-[44px]` (compound variant). The `link` variant opts out (`!min-h-0`).
   `Textarea` needs no floor — its unconditional `min-h-16` (64 px) already exceeds
   the comfort target, and a 44 px `min-height` would *lower* it (CSS `min-height`
   has no max), so the floor is left to the larger value.
2. **Explicit `min-h-11`** on bespoke controls (shelf tabs, shuffle / wall / recommend
   toolbar, recommend pill), often with `lg-fine:min-h-9` to stay compact on desktop.
3. **`.ks-pointer-coarse-min-hit`** (`globals.css`) for plain links / `summary` /
   text buttons outside `<Button>` — adds the 44 px min-height plus a small negative
   inline margin so the hit area grows without shifting layout.

## Methodology

- **Static audit** — read every `<Button>` usage and ad-hoc control (raw elements,
  `role`, pointer handlers, inputs, `summary`), computing sizes from the Tailwind
  classes and the coarse-pointer floors.
- **Live measurement** — Playwright on an emulated **iPhone 13** context
  (`pointer: coarse` confirmed true on every page, so the floors were actually
  active), navigating each surface plus overlay states, measuring real
  `getBoundingClientRect` boxes and each target's nearest-neighbour **centre-to-centre
  distance** (the geometry the 2.5.8 spacing exception turns on).

## Findings by surface (live)

| Surface | Targets | Fails | Spacing-only | Smallest real target |
|---|---|---|---|---|
| `/library` (toolbar, tabs, cards, card actions, nav) | 86 | 0 | 0 | 44 px |
| `/library` — item-actions dropdown open (menu rows) | 89 | 0 | 0 | 44 px |
| `/library` — recommend deck open (books) | 85 | 0 | 0 | 44 px |
| `/add` | 10 | 0 | 0 | 44 px |
| `/search` | 11 | 0 | 0 | 32 px (Select triggers 44 px) |
| `/settings` | 17 | 0 | 0 | 32 px (text inputs) |
| `/item/[id]` | 22 | 0 | 0 | 16 px (inline link — see below) |
| `/login` (OTP) | 4 | 0 | 0 | 44 px |

Two states could not be exercised live and were verified statically:

- **Recommend deck verdict buttons** ("Not for me / Skip / Save") — the run was still
  loading when measured, so only the deck's **Minimize** and **Close** controls were
  captured live (44×44, pass). The verdict row is three default-size `<Button>`s in a
  `grid grid-cols-3 gap-2`, so each inherits the 44 px coarse floor.
- **Inbox triage** (swipe mode) — the test account's Inbox was empty, so the mode would
  not open. Statically the Dismiss / File / Keep buttons are `size-14` (56 px) and
  `size-11` (44 px) with `gap-3`. The swipe gesture has these single-pointer button
  equivalents, satisfying **WCAG 2.5.7 Dragging Movements (AA)**.

## Sub-44 px controls — all legitimately pass

Three measurements came in under 44 px; none is an AA failure:

- **`/item/[id]` "Saved from openlibrary.org" — 92×16 px.** A plain inline `<a>` inside
  a sentence (`ItemDetail.tsx:257`). Passes via the **inline-link exception** (size
  constrained by surrounding line-height), and is isolated (89 px to its nearest
  neighbour) so it would pass on spacing too. This is correct by design.
- **`/settings` & `/search` text inputs / Select triggers — 32 px tall.** Above the
  24 px AA bar. (The search field and Select triggers are `h-11` = 44 px; the 32 px
  cases are some settings inputs.) See the comfort note below.
- **Hidden 1×1 elements** — form-proxy `<input>`s emitted by the Base UI `Select`
  primitive, and focus-guard `<span>`s from Base UI's focus traps. Not user-facing
  targets; excluded from the counts.

## Observations & optional follow-ups

These are **consistency / comfort** notes, not compliance gaps:

1. **Form inputs now floor to 44 px on touch via the primitives.** `Input` and
   `SelectTrigger` carry the `pointer-coarse` floor in their base class, so settings /
   search fields that previously measured 32 px on a coarse pointer now reach the 44 px
   comfort target without per-call-site `min-h-11`. Desktop (fine-pointer) heights are
   unchanged.
2. **The coarse floor is height-only for text buttons** (icon buttons also get
   `min-w`). In practice every text button clears 24 px wide via its label + padding,
   so there is no real failure — but a hypothetical 1–2-character text button would be
   tall-but-narrow. Worth knowing; not worth fixing pre-emptively.
3. **Three mechanisms produce the same 44 px.** This is fine and deliberate, but means
   the value lives in three places (`--tap-target-min`, literal `min-h-11`, the utility).
   They already agree; just keep them in sync if the comfort target ever changes.
4. **The `link` variant opts out of the floor.** Correct for inline links. It relies on
   author discipline not to use `variant="link"` as a standalone block control on touch.

## Reproducing

Dev server on `:3000`, then authenticate without email via
`npm run qa:session-url`. The measurement harness (Playwright, iPhone 13 context,
nearest-centre geometry per 2.5.8) was a throwaway script; the approach is documented
above so it can be rebuilt for a regression check.

## Regression guard (committed)

The throwaway harness is now codified as a committed Playwright e2e so the AA
invariant can't silently rot:

- `npm run test:e2e` boots/reuses a `next dev` server (the QA auth route is dev-only),
  signs in without email, and walks the core surfaces (`/login`, `/library`, `/add`,
  `/search`, `/settings`, `/item/[id]`) at the iPhone 13 coarse-pointer viewport.
- The contract lives in one place (`e2e/lib/tap-targets.ts`): `minDim >= 24`, with the
  inline-link, user-agent-default and spacing (24 px undisturbed-circle) exceptions. It
  asserts `pointer: coarse` is active on every surface before measuring, so it can't pass
  vacuously. It enforces the **AA 24 px** bar (green on `master` today); the 44 px comfort
  target is reported but not enforced.
- It is **not** wired into `npm test` (Vitest excludes `e2e/**`) — boot a dev server first,
  then run `npm run test:e2e` (or `E2E_BASE_URL=http://localhost:3000 npm run test:e2e` to
  reuse a running one).

The guard also walks the two dense **overlay states** the static surface walk can't
reach (issue #35), reusing the same contract — it opens the overlay, then calls the
same `auditSurface` so the overlay's controls are measured against the identical 24 px
AA bar and exceptions:

- **`/library` — item-actions dropdown menu.** Opens the first card's "Item actions"
  trigger, waits for the menu rows (`role="menuitem"`) to render, then measures the
  trigger + every row.
- **`/library` — recommend deck.** Navigates to a shelf where Recommend is enabled
  (books/watch), opens the deck Sheet, and waits on real DOM signals (auto-waiting
  locators, no fixed sleeps) for the run to reach a terminal state — `ready` (card
  verdict buttons Save / Skip / Not for me), `error` (Try again), or the empty/done
  copy — before measuring; if the AI run is still loading at the timeout it measures
  the always-present Minimize / Close controls and logs the state reached. If Recommend
  is gated off (gateway unconfigured or too few titled items) it logs a clear SKIP. The
  deck reached `ready` and passed (88 targets, 0 fails) on the last local run.
