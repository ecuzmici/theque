# Smooth transitions (overnight) — complete

Calmer, more "premium" navigation: a gentle fade+rise as a new route enters, and
a soft fade when the library swaps shelves — instead of abrupt cuts. CSS-only,
respects `prefers-reduced-motion`, no layout shift, no perceived slowdown.

## What changed

- **`globals.css`** — two custom keyframes (`ks-fade-rise`, `ks-fade`) and the
  `.ks-page-enter` / `.ks-shelf-enter` classes, plus an explicit
  `prefers-reduced-motion` guard (the repo's global reduced-motion rule only
  neutralizes `ks-shimmer`, so new motion must opt out itself). `backwards`
  fill-mode is used so no transform lingers after the animation — a resting
  transform would establish a containing block and could break `position:
  sticky` descendants.
- **`PageTransition.tsx`** (new) — wraps the page in `<main>`, keyed by
  `usePathname()`. Replays the fade+rise on real route changes
  (Library ↔ item ↔ Add ↔ Search ↔ Settings/Stats) but **not** on query-string
  changes, so the library's `?shelf=…` swaps and Search's `?q=…` don't remount
  the page or discard the in-memory shelf cache. (A Next `template.tsx` was
  rejected for exactly this reason — it would remount on every shelf swap.)
- **`AppShell.tsx`** — renders `<PageTransition>{children}</PageTransition>`
  inside `<main>`. The recommendation deck/pill live at the provider level
  (outside `<main>`), so a minimized run survives route transitions untouched.
- **`LibraryPageClient.tsx`** — the shelf-content region is wrapped in a div
  keyed by `activeShelf` with `.ks-shelf-enter`, so a shelf swap replays a soft
  fade while wall-mode and triage toggles (which keep `activeShelf` stable) do
  not re-animate.

## Why CSS over Next's view-transition API

Next 16's view-transition support is still experimental; the repo already has a
mature `tw-animate-css` + custom-keyframe motion vocabulary, so a small,
robust CSS approach matches conventions and avoids fragility.
