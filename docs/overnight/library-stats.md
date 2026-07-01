# Overnight idea: "Your taste in numbers" stats page

Status: **complete** — build, typecheck and `npm test` green.

A private, read-only stats/profile page (`/stats`) that reflects the signed-in
user's library back to them — totals, completion, category mix, color palette,
verdict/rating spread, forgotten count, top sources and monthly activity — to
deepen attachment and retention. ADR-safe (no social/sharing; RLS-scoped).

## What shipped
- `src/lib/stats/library-stats.ts` — pure, unit-tested aggregation helpers plus
  `fetchLibraryStats()` (exact `head:true` COUNT queries for headline numbers, one
  slim projection for distributions; mirrors the Spine Band's data approach).
- `src/lib/stats/library-stats.test.ts` — 13 unit tests for the helpers.
- `src/components/stats/LibraryStatsView.tsx` — server-rendered, on-brand view
  (palette band, category bars, hue histogram, verdict spread, forgotten nudge,
  top sources, monthly activity, empty state).
- `src/app/(app)/stats/page.tsx` — auth-guarded server page.
- Entry points: "Stats" in the sidebar nav (`AppShell`) + a Settings link card
  (covers mobile, where the sidebar is hidden). `/stats` added to middleware
  protected prefixes + matcher.

## Notes
- Distributions reflect up to the 1000 most recent non-dismissed items (same cap
  as the Spine Band); headline counts are exact. A footnote discloses this when
  the library exceeds the cap.
- No schema/migration required (no profiles/preferences table touched).
