# Smooth transitions (overnight) — native-first rework

Goal: navigation should feel **premium/calming**, not abrupt. The first pass
was CSS-only (a whole-page fade+rise on route change). It read as
invisible/cheap because a fade communicates nothing — nothing survives the cut.

## The reframe

The card→detail **cover morph was already live on `master`**: `experimental.
viewTransition: true` is set (`next.config.ts`) and `ItemCard` / `ItemDetail`
already wrap the cover in matching `<ViewTransition name={`item-cover-${id}`}>`.
But there was **zero `::view-transition` CSS**, so it ran the browser's *default*
~250ms crossfade-morph, and the CSS whole-page fade fired **on top of it** on the
same navigation — two uncoordinated animations, which is what read as muddy.

So the fix is mostly **tuning + subtraction**, native-first (React
`<ViewTransition>` + tuned `::view-transition` CSS), aimed at an Apple-Photos
spatial-calm feel.

## What changed

- **`globals.css`** — replaced the `ks-fade-rise` / `.ks-page-enter` keyframes
  with `::view-transition` rules:
  - **Cover morph** (`::view-transition-group(.morph)` / `image-pair(.morph)`):
    ~420ms, generous ease-out (`cubic-bezier(0.22, 1, 0.36, 1)`, no overshoot),
    with a mid-flight `blur(3px)` to hide the object-cover→object-contain crop
    interpolation. Timing is exposed as CSS vars (`--ks-morph-duration`,
    `--ks-morph-ease`, `--ks-crossfade-duration`) so the feel is tunable from one
    place — judge it on a real phone, not a static mock.
  - **Sibling routes** (Library ↔ Add ↔ Search ↔ Settings): the native `root`
    crossfade, tuned to a calm ~280ms. Snapshot-based, so it never remounts the
    page or discards the library's in-memory shelf cache (the reason the old pass
    avoided `template.tsx` — the native path sidesteps that entirely).
  - **Reduced-motion**: neutralizes every `::view-transition-*` duration + the
    shelf crossfade → instant swap.
- **`ItemCard.tsx` / `ItemDetail.tsx`** — added `share="morph"` to the existing
  cover `<ViewTransition>`, which assigns the `.morph` class the CSS targets.
- **`view-transition.tsx`** — widened the shim's prop type to pass
  `share`/`enter`/`exit`/`update`/`default` through to React's `<ViewTransition>`
  (the vitest pass-through fallback ignores them, as before).
- **`AppShell.tsx`** — removed the `<PageTransition>` wrap (deleted), and gave the
  sidebar / mobile header / bottom nav a stable `viewTransitionName`
  (`app-sidebar` / `app-header` / `app-bottomnav`) so the chrome holds still
  during a transition — one fixed spatial anchor, never a sliding frame.
- **`PageTransition.tsx`** — **deleted**; the whole-page fade competed with the
  morph. Sibling-route motion is now the native root crossfade.
- **`LibraryPageClient.tsx`** — unchanged behaviour: shelf swaps still use the CSS
  `.ks-shelf-enter` crossfade (shelf swaps are `setState`/query changes, not
  navigations, so `<ViewTransition>` can't fire on them), retuned to match the
  route crossfade duration.

## Deliberately skipped

- **Directional route slides** — the top motion-sickness trigger, and a library
  has no natural forward/back order, so every sibling route uses a calm crossfade
  instead. If we ever want a spatial "deeper" cue, it's `transitionTypes` on the
  detail `<Link>` + `nav-forward`/`nav-back` CSS (see Next's view-transitions
  guide), but it's intentionally out of scope here.

## Quality bars

- Native View Transitions fail open (unsupported browsers just don't animate);
  respects `prefers-reduced-motion`; no layout shift; cosmetic-only, never blocks
  interaction (view transitions are non-blocking).
- `npm run build` green; `npm test` green.
