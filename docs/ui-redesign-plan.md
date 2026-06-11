# Theque UI redesign plan — "Gallery minimal"

Status: **proposed** (awaiting review) · Branch: `claude/website-ui-ux-planning-kf25y4`

## Decisions already made (2026-06-11, with Emanuel)

- **Full redesign** — treat the current warm cream/amber look as a draft.
- **Direction: Gallery minimal** — near-white / near-black surfaces, a single
  restrained accent, imagery-first. The saved items provide the color; the
  chrome disappears. (Reference feel: Cosmos, Savee, Are.na.)
- **Library presentation: masonry, imagery-first** — variable-height cards
  preserving each item's natural image ratio.
- **Navigation: refined top shelf tabs** — keep horizontal shelf tabs above
  the grid, redesigned; collections stay a separate page.
- **Extra-attention pages**: landing + login, item detail.
- Delivery: phased plan (this doc) → implement phase by phase.

## Open decisions (resolve before Phase 1)

1. **Accent color.** One accent, used sparingly (primary buttons, active tab,
   focus rings, inbox count). Candidates:
   - Klein blue `#2433ff`-family (recommended: cool, gallery-like, reads
     "curated" rather than "warm")
   - Signal orange `#ff4d00`-family (more energetic, closer kin to today's amber)
2. **Serif retention.** Recommend keeping the lowercase serif **wordmark only**
   (`thèque` logo); all other UI text becomes grotesque sans (Geist Sans,
   already loaded). Metadata labels move to Geist Mono uppercase.
3. **Masonry implementation.** Recommend CSS multi-column
   (`columns-2 sm:columns-3 lg:columns-4` + `break-inside-avoid`) for the PoC:
   zero JS, items keep natural ratios. Trade-off: items flow top-to-bottom per
   column instead of strict left-to-right recency. A JS-measured balanced
   masonry can replace it later behind the same `MasonryGrid` component API.

---

## Design language

### Tokens (rewrite of `--ks-*` in `src/app/globals.css`)

| Token | Light | Dark |
|---|---|---|
| `--ks-bg` | `#fcfcfb` | `#0d0d0c` |
| `--ks-bg-muted` | `#f4f4f2` | `#161614` |
| `--ks-surface` | `#ffffff` | `#1a1a18` |
| `--ks-fg` | `#111110` | `#f5f5f3` |
| `--ks-fg-muted` | `#6b6b66` (AA on bg) | `#a3a39c` |
| `--ks-border` | `rgba(17,17,16,0.10)` hairline | `rgba(245,245,243,0.10)` |
| `--ks-accent` | accent (open decision #1) | same hue, lifted for dark |
| `--ks-accent-soft` | accent @ ~8% | accent @ ~14% |
| `--ks-ring` | accent @ ~40% | accent @ ~45% |
| `--ks-radius-card` | `0.5rem` (8px — tighter, gallery frames) | — |
| `--ks-shadow*` | effectively none; hairline borders carry depth | — |

Shadcn bridge variables (`--primary`, `--muted`, …) keep their current mapping
so most components restyle via tokens alone.

### Typography rules

- **Display/headers**: Geist Sans, tight tracking (`tracking-tight`),
  weights 550–650. No serif in UI.
- **Body**: Geist Sans `text-sm`/`text-base`.
- **Metadata labels** (structured fields, shelf counts, domains, badges):
  Geist Mono, `text-[11px]` uppercase `tracking-wider`, muted.
- **Wordmark**: `thèque` stays lowercase serif (open decision #2).
- `--font-heading` switches meaning but stays sans → minimal component churn.

### Component rules

- Hairline borders (`border-border`) instead of shadows; elevation only on
  overlays (dropdowns, dialogs).
- Hover: image cards get a scrim + actions reveal (see Phase 2); buttons get
  background shift, not opacity.
- Focus: 2px accent ring everywhere (already mostly wired via `--ring`).
- Touch rules unchanged: keep `pointer-coarse` / `lg-fine` variants,
  `--tap-target-min`, `.ks-pointer-coarse-min-hit`.

---

## Phases

Each phase = one reviewable commit (or small series), `npm test` +
`npm run build` green before moving on. Order chosen so every phase leaves the
app coherent: tokens first restyle ~80% passively, then the centerpiece, then
focus pages, then sweep.

### Phase 1 — Foundation: tokens + typography + primitives

Files: `src/app/globals.css`, `src/app/layout.tsx` (font wiring if needed),
`src/components/ui/button.tsx`, `badge.tsx`, `card.tsx`, `input.tsx`,
`textarea.tsx`, `select.tsx`, `dialog.tsx`, `sheet.tsx`, `dropdown-menu.tsx`.

- Rewrite `:root` / `.dark` token blocks per table above; retune shimmer
  gradient for neutral surfaces.
- Radius scale: base 8px; keep derived `--radius-*` math.
- Primitives: remove amber-era assumptions (e.g. `accent-soft` washes), align
  hover/focus to new rules, ensure `lg-fine` + `pointer-coarse` present on all
  interactive sizes (fixes current inconsistency).
- Contrast audit: muted-on-muted combos to WCAG AA in both modes.

Exit: whole app renders in the new neutral language (still old layouts).

### Phase 2 — Library core (the centerpiece)

Files: new `src/components/items/MasonryGrid.tsx`; redesign
`src/components/items/ItemCard.tsx`, `ItemCardSkeleton.tsx`; extract
`src/components/library/ShelfTabs.tsx` out of `LibraryPageClient.tsx`;
restyle `LibraryInsights.tsx`, inbox banner, `SHELF_EMPTY` empty states in
`LibraryItemsSection.tsx`; retire `ItemGrid.tsx` (or keep as thin wrapper for
search/collections until Phase 6).

- **MasonryGrid**: CSS columns (open decision #3), same props as `ItemGrid`
  (`items`, `shelfId`, `itemActionsEnabled`, `onItemPatch`) so
  `LibraryItemsSection` swaps with a one-line change. Variable-height
  skeletons for the suspense fallback in `LibraryPageClient`.
- **ItemCard**: image is the card — natural aspect ratio (existing
  `cardAspectRatio`), 8px radius, hairline border. Title/domain move below the
  image in small sans + mono. Hover (fine pointers): bottom scrim with title +
  actions; coarse pointers keep always-visible actions button. Processing
  shimmer + "Gathering details…" preserved. Strong focus ring on the link.
- **ShelfTabs**: text tabs with mono count per shelf, active = ink underline +
  accent count; sticky under the mobile header / at top on desktop while
  scrolling the grid; horizontal overflow with fade-out edges
  (`scrollbar-none` + mask). Keeps the existing WAI-ARIA roving-tabindex
  pattern and `?shelf=` URL behavior.
- **LibraryInsights**: collapse into a single quiet mono stat line under the
  header (saves · this week · inbox), inbox count in accent.
- Optional, behind reduced-motion check: React 19.2 `<ViewTransition>` for
  shelf switches (Next 16 supports it; see constraints below).

Exit: library is the redesigned gallery experience end-to-end.

### Phase 3 — Item detail

Files: `src/components/items/ItemDetail.tsx`, `StructuredFields.tsx`,
`ItemEditSheet.tsx` (visual pass), `ItemAiReviewDialog.tsx` (visual pass).

- Two-pane on `lg+`: media left (natural ratio, hairline frame), metadata
  right; stacked on mobile (media → title → actions → fields).
- Actions become one quiet toolbar row (Open original / Edit / Refresh /
  AI review / Delete) — ghost buttons, destructive only on confirm dialog.
- `StructuredFields`: catalog-style key/value list — mono uppercase keys,
  sans values, hairline row separators (replaces the 2-col grid).
- Status/category/tags as minimal outline chips (mono).

### Phase 4 — Landing + login

Files: `src/app/page.tsx`, `src/app/login/page.tsx` (+ co-located components),
`src/app/auth/confirm/page.tsx`, `src/app/privacy/page.tsx` (light pass).

- **Landing**: typographic gallery hero — large lowercase wordmark, one-line
  promise, accent CTA, and a muted masonry *suggestion* (3–4 placeholder
  frames in CSS, no fake content) hinting at the grid. No feature-bullet list.
- **Login**: single centered hairline card; OTP code input stays mono with
  wide tracking (it already works well) restyled to new tokens; error alert
  uses the shared Alert (Phase 6 component, introduced here and reused).
- `login-utils` behavior untouched → `login-utils.test.ts` unaffected.

### Phase 5 — Shell & navigation

Files: `src/components/layout/AppShell.tsx`, `PageHeader.tsx`,
`src/components/brand/ThequeLogo.tsx` (sizes/contrast only),
`src/components/theme/ThemeToggle.tsx`.

- Sidebar: white/near-black surface, hairline right border, quieter nav items
  (active = ink text + accent dot, not filled pill); "Add link" becomes a
  solid accent button.
- Mobile: bottom nav restyled to match; FAB shrinks to `size-14`, ring
  reduced, verified against 320px viewports (current `3.75rem` + translate
  collides on small screens).
- `PageHeader`: sans display title, optional mono kicker; description only
  where it earns its place.

### Phase 6 — Consistency sweep + remaining pages

Files: new `src/components/ui/alert.tsx`, new
`src/components/ui/empty-state.tsx`; sweep `src/app/(app)/search`,
`collections` (+ `CollectionsPageClient`, `CollectionDetailClient`),
`tags` (`TagsPageClient`), `settings` (`CaptureTokens`,
`ExtensionConnectClient`), `recommend/*` drawer/cards.

- **Alert**: one component for all inline errors/notices (today: auth has
  styled boxes, everything else bare `text-destructive` paragraphs).
- **EmptyState**: icon + title + hint + optional CTA; apply to collections,
  search, shelves (replaces the ad-hoc Tags pattern, reused there too).
- Modal rule, documented in `AGENTS.md`: **Sheet = editing/multi-field forms,
  Dialog = confirmations & single-step actions** (matches current best usage;
  the sweep fixes stragglers).
- Search filters, collections grid, tags table, token list restyled to tokens
  + mono-label language.

### Phase 7 — QA + docs

- `npm test`, `npm run build` (includes extension tsc), manual pass per
  `docs/qa-checklist.md` URL matrix; Playwright MCP session via
  `npm run qa:session-url` for library/item/add/search flows.
- Dark-mode + contrast re-audit; 320px / iPhone SE viewport check; coarse vs
  fine pointer check.
- Update `docs/ui-shelves.md` design-direction section + this doc → status
  "implemented"; screenshots in the PR description if a PR is requested.

---

## Next.js 16 constraints (verified against vendored docs, `next@16.2.7`)

- Keep plain `<img>` for remote covers (untrusted hosts; deliberate project
  decision). If that ever changes, v16 needs `images.remotePatterns`
  (`domains` is deprecated) and `preload` (not `priority`).
- React 19.2 ships `<ViewTransition>` / `<Activity>` — optional shelf/grid
  transition polish, must respect `prefers-reduced-motion`.
- `loading.tsx` / `error.tsx` conventions unchanged; new `error.tsx` boundaries
  added during the redesign should use the `unstable_retry` prop (re-fetches),
  not bare `reset`.
- If `globals.css` ever sets `scroll-behavior: smooth`, add
  `data-scroll-behavior="smooth"` on `<html>` or navigation scroll-to-top
  becomes janky.
- `src/middleware.ts` is on the deprecated convention (v16 renamed it to
  `proxy.ts`). Out of scope for the redesign; noted for a separate chore.

## Working conventions for this effort

- One phase per commit (series); minimal diffs; no logic changes piggy-backing
  on visual ones (`LibraryPageClient` data flow, optimistic patches, realtime
  subscriptions all stay as-is).
- `npm test` before claiming any phase done; build must stay green since
  Vercel deploys `master`.
- Accessibility floor: keep every existing aria attribute / roving tabindex /
  `aria-live` region; new components meet the same bar.
