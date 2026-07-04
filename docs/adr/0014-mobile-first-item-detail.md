---
status: accepted
---

# Mobile-first item detail: two visible actions + curated category facts

The item detail page is the screen every capture funnels into, and it currently
reads as an admin view rather than a catalog card. Three compounding problems,
all worst on a phone:

1. **The primary action is below the fold.** On mobile the order is cover →
   saved-from → badges → title → About (6 clamped lines) → *then* the action
   row. The taste loop's key verb ("Mark as watched/read/…") sits roughly a full
   viewport down.
2. **Six equal-weight actions.** Mark done, Open original, Edit details, Refresh
   metadata, Enrich with AI, Delete — one wrapped row, no hierarchy, Delete
   inline in the flow. On mobile this stacks into three rows of buttons.
3. **The Details table is raw enricher output.** `StructuredFields` renders
   `Object.entries(structured)` in insertion order with snake_case→Title Case
   labels: `Site Name: The Movie Database`, `Rating: 3.6` four rows above
   `Rating Scale: 5`, `Runtime Minutes: 93`, ISBN as the first row of a book.

## Decisions

- **Exactly two visible actions; the rest live in a `⋯` overflow menu.** The
  category done-verb button (or "Edit verdict" when done) and "Open original"
  stay visible. Edit details, Refresh metadata / Retry enrichment, Enrich with
  AI, and Delete move into a single overflow dropdown, with Delete visually
  separated and destructive-styled. Applies to **all** viewports — the
  maintenance actions are janitorial on desktop too.
- **Mobile gets a header-first order, not a sticky action bar.** On mobile the
  page reorders to: cover (capped ~40vh) → badges + title + facts byline →
  actions → verdict/note → About → Details → related strip. The actions move
  *above* the About section so the verb is in the first viewport. A sticky
  bottom action bar was rejected: the app already has a fixed bottom tab bar +
  FAB on mobile, and a second fixed chrome layer would fight it.
- **Structured fields get a code-defined, per-category display schema** (same
  philosophy as `src/lib/shelves.ts`: curation lives in code, not ad-hoc in
  components). One module owns, per category:
  - **Headline facts** promoted out of the table into a byline row under the
    title (Watch: year · genres · runtime · ★ rating; Books: year · pages ·
    ★ avg rating with count).
  - **Formatters**: `runtime_minutes: 93` → "1 h 33 m", rating + scale + count
    combined into one "★ 3.6" / "★ 4.13 · 36,490 ratings" value, thousands
    separators, year folded into the byline instead of a table row.
  - **Suppressed machine keys**: `site_name`, `media_type`, `original_type`,
    `rating_scale`, external ids — never shown.
  - **Ordering** for what remains in the Details table.
- **Unknown keys still render.** Structured keys the schema doesn't know fall
  back to the current generic rendering at the *end* of the table, so a new
  resolver field never silently disappears — it just isn't curated yet.

## Considered and rejected

- **Sticky bottom action bar on mobile.** Conflicts with the existing bottom
  nav + centered FAB; two fixed layers of chrome on a small screen.
- **Curated-only fields (hide unknown keys).** Silently swallows new resolver
  output; the fallback-at-the-end keeps the pipeline honest.
- **Per-item user-configurable field visibility.** Grossly over-engineered for
  a personal library; curation is a product decision, code-defined like
  shelves.

## Consequences

- **Touch-points:** `src/components/items/ItemDetail.tsx` (layout order, action
  hierarchy, overflow menu), `src/components/items/StructuredFields.tsx`
  (consume the display schema), new pure `src/lib/item-detail-display.ts`
  (+ unit tests) for the per-category schema and formatters.
- The byline facts make the header the densest zone of the page; the Details
  table shrinks to genuinely secondary data (ISBN, page count, publisher …).
- Tap targets keep the 44 px floor via `<Button>` / `min-h-11` per ADR 0006;
  the overflow menu trigger is an icon button and needs the same floor.
- Reversible: purely presentational; no schema or data change.
