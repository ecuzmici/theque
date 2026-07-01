# Overnight idea: Ambient "cover wall" screensaver mode

Status: **complete**.

Shipped:
- `src/app/ambient/page.tsx` — top-level (chrome-free) auth-guarded route + graceful empty state.
- `src/lib/ambient/ambient-tiles.ts` (+ test) — pure `buildAmbientTiles` (cover-or-color, capped, hue order preserved) and an RLS-scoped `fetchAmbientTiles`.
- `src/components/ambient/AmbientWall.tsx` — full-bleed mosaic with a slow alternating pan/zoom (self-contained keyframes), `prefers-reduced-motion` → still, Esc / Exit to leave.
- `src/middleware.ts` — `/ambient` added to the protected prefixes + matcher.
- `src/components/library/LibrarySpineBand.tsx` — a quiet "Ambient" entry link in the band caption.

A dedicated full-screen `/ambient` route that turns the signed-in user's library
into a slowly drifting wall of cover art — a calm "leave it on" mosaic. Reuses the
existing cover / `dominant_color` rendering, respects `prefers-reduced-motion`, and
is reachable from a quiet link in the library Spine Band.
