# Overnight idea: Taste Wrapped

Branch: `overnight/taste-wrapped`

A private `/wrapped` year-in-review recap of the signed-in user's library —
Spotify-Wrapped energy, but calm and on-brand. Reflects taste back to the user
(total saved, busiest month, top shelves, palette of the year, items finished +
a standout pick, most-saved source) as a screenshot-worthy artifact that pulls
them back into the library.

Private + RLS-scoped. No public route, no sharing surface, no schema change.

Status: COMPLETE.

Shipped:
- `src/lib/wrapped/wrapped-stats.ts` — pure, unit-tested aggregation (`computeWrapped`)
  + RLS-scoped `fetchWrappedData` (slim projection, capped at 1500 most-recent rows).
- `src/lib/wrapped/wrapped-stats.test.ts` — 15 tests.
- `src/components/wrapped/WrappedView.tsx` — server-rendered recap (zero client JS),
  on-brand, `motion-safe` entrance animations, empty state.
- `src/app/(app)/wrapped/page.tsx` — auth-guarded server page.
- Entry points: **Wrapped** in the desktop sidebar nav + a card on **Settings**
  (mobile discoverability); `/wrapped` added to middleware protected prefixes + matcher.
