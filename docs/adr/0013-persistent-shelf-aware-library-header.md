---
status: accepted
supersedes: 0012-library-spine-band.md
---

# Persistent, shelf-aware library masthead

[ADR 0012](0012-library-spine-band.md) introduced the Spine Band and, alongside the
"Made for you" banner, gated **both** to the `all` shelf ("a whole-library palette +
`N spines` total is semantically wrong when you've filtered to one category"). In
practice the gate does more harm than the semantic tidiness it buys: switching from
`all` to Books/Watch/… **unmounts the entire masthead** (title stays, but the band +
caption + hairline + banner all vanish), so the page **pops/jumps** on every shelf
switch. The header feels unstable, which reads worse than a whole-library band on a
filtered view.

We reverse the "All shelf only" decision: the masthead is now **persistent on every
shelf**, and the "Made for you" banner becomes **shelf-aware** instead of disappearing.

## Decisions

- **The masthead renders on every shelf.** `LibrarySpineBand` and
  `RecommendUnlockBanner` render unconditionally above the keyed (`key={activeShelf}`)
  grid region, so they stay mounted across shelf switches — no remount, no layout
  pop. The `activeShelf === "all"` gate in `LibraryPageClient` is removed.
- **The band stays whole-library, unchanged.** Colors, `N spines · M new this week`
  caption, and the `to sort` / `forgotten` nudges continue to describe the **whole
  library**, not the filtered shelf. This is the most seamless option (nothing about
  the band changes as you switch tabs) and keeps the band a stable identity element.
  We accept 0012's "semantically wrong on a filtered view" point as a deliberate
  trade for seamlessness — the band is decorative identity, not a per-shelf readout.
- **The "Made for you" banner is shelf-aware** (`bannerModeForShelf`, the seam):
  - `all` → both categories; heuristic-featured pick + category picker (unchanged).
  - `books` → feature **Books** progress/CTA only.
  - `watch` → feature **Movies/TV** progress/CTA only.
  - `read` (Articles), `done`, `other`, `inbox`, `forgotten` → **disabled** state:
    a muted twin of the banner ("Made for you — No picks for this shelf"), kept
    **visible, not removed**, so the masthead height stays constant across switches.
  - When neither recommendation category is env-enabled the banner renders nowhere
    (feature entirely off), consistently on every shelf.
- **The achievement system is untouched.** Unlock threshold (`RECOMMEND_MIN_ITEMS`),
  sticky per-category `unlock-storage`, the COUNT-query progress, ring, and dropdown
  all stay exactly as in the "Made for you" feature. Only *which* category is
  featured (and the new disabled state) is shelf-derived.
- **The toolbar `RecommendButton` is removed.** With a persistent, shelf-aware CTA in
  the masthead, the per-category toolbar button was a second, redundant recommend CTA
  on Books/Watch. `RecommendButton.tsx` is deleted.

## Considered and rejected

- **Per-shelf band (colors/counts of the filtered category).** More "correct" per
  0012's reasoning, but it makes the band flicker/recompute on every switch — the
  opposite of the seamlessness this ADR is chasing — and needs per-shelf color
  queries. The whole-library band is calmer and stable.
- **Hide the banner (not disable it) on no-category shelves.** Re-introduces a height
  change on switch (the exact pop we're removing). Disabled-but-present keeps the
  masthead rigid.
- **Keep the toolbar `RecommendButton` too.** Two recommend CTAs on one screen; drop
  the toolbar one.

## Consequences

- **Touch-points:** `src/components/library/LibraryPageClient.tsx` (remove the gate,
  pass `activeShelf`, drop the toolbar button), `src/components/recommend/
  RecommendUnlockBanner.tsx` (new `activeShelf` prop + disabled banner + shelf-aware
  featured pick), new pure `src/lib/recommend/banner-mode.ts` (+ test), deleted
  `src/components/recommend/RecommendButton.tsx`.
- **`docs/ui-shelves.md`** header description updated: masthead is now on every shelf.
- **Reversible:** purely presentational; no schema or data change.
