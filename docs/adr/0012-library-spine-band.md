---
status: superseded
superseded-by: 0013-persistent-shelf-aware-library-header.md
---

# Replace the library KPI strip with a "spine band"

> **Superseded by [ADR 0013](0013-persistent-shelf-aware-library-header.md)** on the
> "All shelf only" decision below: the masthead (title + band + "Made for you"
> banner) now renders on **every** shelf so switching shelves is seamless. The rest
> of this ADR (the band treatment itself, its density/order/caption) still holds.

The top of `/library` opened with `LibraryInsights` — a bordered `bg-muted/30` box of
KPI tiles (`Total saves`, `Added this week`, amber `Inbox backlog`, amber `forgotten`).
It reads like a SaaS analytics dashboard, which directly contradicts the product's stated
design direction (`docs/ui-shelves.md`): *"Warm private library… Not: dense tables,
spreadsheet filters, admin sidebars."* The `PageHeader` description *"Browse your taste by
shelf."* added a second line of throat-clearing above it. We replace the strip with an
element that **evokes the library** instead of reporting on it.

The chosen treatment is **the Spine Band**: a thin, calm horizontal band woven from the
collection's own `dominant_color` values — the saved items seen edge-on, like book spines
on a shelf. It pictures the library's palette (a property thèque already computes and sorts
by) rather than tallying it, and folds the action-nudges in as quiet links.

## Decisions

- **Delete the `PageHeader` description** on `/library` (`"Browse your taste by shelf."`).
  The title `Library` stands alone.
- **The band** — a horizontal strip of equal-width spines built from non-dismissed items
  that have a `dominant_color`:
  - **Order: eclectic** (as-saved / recency), *not* hue-sorted. A hue gradient reads like
    a color-picker swatch; saved-order reads like a real, personal shelf.
  - **Density:** evenly sampled across the whole library (the full color set, not just
    recent saves), with the spine count **scaling to the band's width** (~one spine per
    3.5px) and hard-capped at 400 — so the DOM stays light and the weave stays ~3-4px per
    spine on any device, growing denser as the library grows.
  - **Calm, not loud (Variant B):** the band is short (~44px) and slightly desaturated
    (~`saturate(0.66)`), with a hairline `border-border` rule closing the header zone
    beneath the caption — so the band reads as part of the page header, and the amber
    "Made for you" banner directly below it reads as a separate, special invitation
    rather than a second competing color stripe.
- **Caption beneath the band:** left = `N spines · M new this week`; right = quiet amber
  nudge links `N to sort` (→ Inbox) and `N forgotten` (→ forgotten shelf). Each nudge is
  **hidden when its count is zero**. The four numbers come from the same COUNT queries
  `LibraryInsights` already ran (total non-dismissed, last-7-days, `status = inbox`, and
  the `forgotten` age filter from `shelves.ts`).
- **All shelf only.** The band is a whole-library identity element, so it renders only on
  the default `all` shelf (the same gate the "Made for you" banner uses). Filtered shelves
  (Books, Watch, …) show just the title + tabs.
- **Fold in the Inbox nudge.** The separate, prominent `N items need triage in Inbox` /
  *Open Inbox* banner is **removed**; the caption's quiet `N to sort` link is now the only
  in-page inbox nudge. The Inbox tab's count badge and the weekly digest still backstop
  triage.
- **Degenerate states.** Empty (0 items): nothing renders — the per-shelf empty state owns
  the screen. Sparse (< ~8 color-bearing items): show the title + caption only, no band
  (a 3-spine band looks broken). Loading: reserve the band's height and fade it in so the
  banner/tabs don't jump; best-effort and fail-open — a failed color query simply means no
  band, never an error.

## Considered and rejected

- **Polished KPI metrics** (keep the four numbers, restyle warmer) — smallest change, but
  it's still a metrics readout; doesn't escape the dashboard feel the ADR is reacting to.
- **The Shelf Note** (a boxless editorial sentence, *"A library of 248 things…"*) — strong
  and the safest for empty states, but the band pictures the collection more vividly and
  reuses the palette feature; the sentence was explicitly dropped.
- **The Proportional Shelf** (one bar, each shelf's share as its width) — informative but
  leans back toward data-viz, the thing we're fleeing.
- **Ex Libris checkout card** — most characterful, but reintroduces a bordered box (exactly
  what we removed) and a rubber-stamp motif that wears thin on every page load.
- **Hue-sorted band** — a smooth gradient is prettier in isolation but reads as a designed
  swatch, not *your* shelf.
- **Variant A (full-saturation, flush band)** — in light mode the saturated band and the
  warm amber banner become two competing horizontal stripes of equal weight.
- **Band on every shelf** — consistent placement, but a whole-library palette + `N spines`
  total is semantically wrong when you've filtered to one category.

## Consequences

- **Touch-points:** `src/components/library/LibraryInsights.tsx` (replaced by the band
  component, or repurposed), `src/components/library/LibraryPageClient.tsx` (gate the band
  on `activeShelf === "all"`, remove the old mount and the inbox-banner JSX block),
  `src/components/layout/PageHeader.tsx` usage on `/library` (drop the description prop).
- **New data read:** a lightweight `select dominant_color` query for non-dismissed items
  (ordered by `created_at`, limited, then evenly sampled client-side). The existing count
  queries are reused unchanged. All best-effort.
- **`docs/ui-shelves.md`** Library-header description should be updated to describe the band
  in place of the toolbar-only summary, *with* the implementation (it documents current
  behavior).
- **Coverage dependency:** the band's fullness depends on how many items carry a
  `dominant_color`. A companion fix to the enrichment color extraction (re-extract for
  already-cached items + a one-off backfill) lands alongside this change so existing items
  are colored rather than rendering a sparse band.
- **Reversible:** purely presentational and additive on the read path; no schema or data
  migration. Reverting restores `LibraryInsights` and the inbox banner.
