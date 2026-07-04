# Smooth transitions (overnight) — shared-element cover morph

Goal: navigation should feel **premium/calming**, not abrupt. The headline is a
**shared-element morph** — the tapped cover grows into the detail hero as one
continuous object (Apple-Photos style), the thing a plain fade can't fake.

## Why the first passes read as "nothing"

The repo had `experimental.viewTransition: true` + React `<ViewTransition>`
wrappers on the covers, which *looks* like a working morph. It isn't: verified in
an instrumented browser (dev **and** production build, stable **and**
experimental react channel), Next 16.2.7's App Router never calls
`document.startViewTransition` on navigation, so React's `<ViewTransition>` is
inert — 0 transitions fire. The browser's View Transitions API itself works when
called directly. (This is the known App-Router gap that `next-view-transitions`
exists to fill.)

So the morph needs a real engine, and the covers need CSS `view-transition-name`,
not React's component.

## How it works now

- **`next-view-transitions`** provides a `<ViewTransitions>` provider (root
  layout) and a `<Link>` that wraps App-Router navigation in
  `document.startViewTransition`. Navigation links use this `<Link>`
  (`ItemCard`, `ItemDetail` back link, `AppShell` nav). Verified firing.
- **Shared element**: the grid cover (`ItemCard`) and the detail hero
  (`ItemDetail`) carry the same inline `view-transition-name: item-cover-<id>`,
  so the browser morphs one into the other. `experimental.viewTransition` is
  removed from `next.config` — React's integration is unused.
- **Through the loading state**: the detail route fetches data, so it Suspends.
  The route-level `loading.tsx` was replaced by an **in-page `<Suspense>`** whose
  fallback (`ItemDetailSkeleton`) carries the same `item-cover-<id>` on its cover
  box — so the morph stays continuous cover → skeleton → loaded hero instead of
  degrading to a crossfade. (A route `loading.tsx` can't see the id; the in-page
  boundary can.)
- **Style — "zoom from cover" (C)** (`globals.css`, `::view-transition` CSS):
  `.ks-cover-morph` sets `view-transition-class: morph`;
  `::view-transition-group(.morph)` runs a slow, clean **~560ms** zoom
  (`cubic-bezier(0.16, 1, 0.3, 1)`, no blur). The **surround** — everything except
  the morphing cover and the anchored chrome — dims toward dark and fades out
  (`ks-dim-out`) while the incoming content fades up, giving an Apple-Photos "open
  the photo" feel. The same surround rule drives **every** page↔page navigation
  (Library/Search/Settings/Add), so the whole app shares the dim-and-swap feel;
  the browser reverses the group on Back for a zoom-back-into-the-shelf close.
  Shelf swaps keep a quick ~300ms `.ks-shelf-enter` crossfade. Timing lives in
  CSS vars. (Chosen from a 4-way prototype — A clean morph, B crossfade+scale,
  C zoom-from-cover, D slide-up sheet.)
- **Anchored chrome**: sidebar / mobile header / bottom nav carry a stable
  `viewTransitionName` so they hold still during a transition.
- **Reduced-motion**: neutralizes every `::view-transition-*` (group, image-pair,
  old, new) + the shelf crossfade → instant. Verified: 0 running animations under
  `prefers-reduced-motion: reduce`.

## Verified (instrumented Chromium, authed library, 24 items)

- Morph fires on card → detail (`startViewTransition` called; cover visibly morphs
  through the skeleton into the hero).
- `npm run build` green · `npm test` → 495 passed · reduced-motion → 0ms.

## Deliberately skipped

Directional route slides (top motion-sickness trigger; a library has no natural
forward/back order). Shelf swaps keep the CSS `.ks-shelf-enter` crossfade — they
are `setState`/query changes, not navigations.

## Test note

`next-view-transitions`' ESM entry imports `next/link` in a way vitest can't
resolve, so component tests alias it to `src/test/next-view-transitions-stub.tsx`
(a pass-through). Runtime is unaffected.
