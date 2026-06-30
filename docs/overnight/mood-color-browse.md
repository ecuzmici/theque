# Overnight idea: Mood / color browse mode

Status: **complete**.

A dedicated `/palette` route that organizes the user's library by the
`dominant_hue` / `dominant_color` already extracted at enrichment time,
bucketing items into named palette "moods" (Reds & warms, Ambers & golds,
Greens, Blues & calm, Purples & pinks, Neutrals & monochrome, plus a fallback
for items without a cover colour). Tap a mood chip to filter.

## What shipped

- `src/lib/palette/moods.ts` — pure, framework-free hue→mood mapping
  (`hexToHsl`, `normalizeHue`, `moodForItem`, `bucketByMood`). Neutral covers
  (low saturation / near-black / near-white) are split out from the chromatic
  wheel; items with no extracted colour fall into a gentle "No colour yet"
  bucket. Spectrum-ordered; empty buckets dropped.
- `src/lib/palette/moods.test.ts` — 26 unit tests (hue boundaries, wrap-around,
  neutral/near-black/near-white detection, null fallback, ordering, counts).
- `src/components/palette/MoodBrowseView.tsx` — client view: filter chips with
  swatches + counts, spectrum-ordered sections of real `ItemCard`s, calm
  `motion-safe` cross-fade on filter, empty state. Mobile-first.
- `src/app/(app)/palette/page.tsx` — auth-guarded server page; loads the
  curated library (excludes dismissed + inbox) hue-sorted, capped at 500.
- Entry points: "Palette" in the desktop sidebar nav + a palette icon in the
  mobile header (`AppShell`); `/palette` added to middleware protected
  prefixes + matcher.

Private + RLS-scoped. No social/sharing, no schema/migration — ADR-safe.
