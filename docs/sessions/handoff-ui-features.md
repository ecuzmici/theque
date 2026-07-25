# Handoff — UI overhaul + feature push (branch `claude/website-ui-ux-planning-kf25y4`)

You are picking up a large, **finished and pushed** feature branch on thèque, a single-user
visual taste library (Next.js 16 App Router + Supabase + Tailwind v4). Your job: debugging
and further improvements on the user's **local checkout** of this branch.

Read `AGENTS.md` first — it is the canonical project guide (commands, repo map, conventions).
This document covers only what this branch changed and the sharp edges you need to know.

## Environment & how to run

- `npm install` (the branch added `sharp` as a dependency), then `npm run dev` → :3000.
- `.env.local` holds real Supabase keys (local and prod share one Supabase project,
  `jucaqjkgyhyzixzaisjr`). All schema changes below are **already applied** there.
- Login without email: `npm run qa:session-url` (needs `QA_DEV_SESSION_SECRET` + `QA_DEV_EMAIL`
  in `.env.local`), open the printed URL.
- `npm test` = Vitest (265 tests, all green at handoff). `npm run build` = extension tsc +
  next build, also green. Run both before claiming a change done.
- This is the user's **production data**. Status changes, triage, deletes are real.

## Design direction (important)

The warm **cream/amber + serif** identity is the user's explicit choice. An earlier
"gallery-minimal" redesign (near-white, klein-blue) was built and then **rejected**; only the
masonry layout survived. Do not reintroduce minimal/grayscale styling. See
`docs/ui-redesign-plan.md` (marked superseded) for that history.

## Schema changes (migration `20260612090000_taste_loop_columns.sql`, applied)

- `items.dominant_color` (hex), `items.dominant_hue` (0–359) — extracted from covers via
  sharp during enrichment (`src/lib/enrichment/image-cache.ts → extractDominantColor`).
- `items.rating_personal` (1–5), `items.verdict` (text), `items.done_at` (timestamptz) —
  the "taste loop". `done_at` is stamped/cleared by the PATCH route on status transitions.
- `collections.share_token` (unique, nullable) — read-only share links.
- Types updated by hand in `src/lib/database.types.ts` (no codegen step).

## Feature inventory (where everything lives)

### Library (`src/components/library/`)
- `LibraryPageClient.tsx` — shelf tabs + toolbar: **Tonight's-pick shuffle** (`ShuffleButton.tsx`
  → `GET /api/items/random?shelf=`), **sort** select (recent/color/title — server-side ordering
  via `fetchLibraryItemsForShelf` in `src/lib/library-items-for-shelf.ts`), **wall mode** toggle
  (covers only), **Swipe-to-triage** toggle on the Inbox shelf. Prefs persist in localStorage
  (`theque_library_sort`, `theque_wall_mode`); sort changes clear the per-shelf cache.
- `LibraryItemsSection.tsx` — masonry grid + infinite scroll + **keyboard browsing**
  (J/K/arrows walk, Space/Enter = quick look, O = open, / = search) + `QuickLookDialog`.
  NOTE: while the quick look is open, flip keys are handled **inside**
  `QuickLookDialog` (`onKeyDown` on DialogContent) because the dialog focus trap swallows
  window-level handlers — that was a real bug, don't regress it.
- `src/components/inbox/InboxTriageStack.tsx` — pointer-drag card stack (right=want,
  left=dismissed, folder=categorize, undo). Optimistic updates flow through `onResolve`
  back into LibraryPageClient's cache + inbox count.

### Shelves (`src/lib/shelves.ts`, `shelf-filter.ts`)
- New **Forgotten** shelf: `status=want` + `olderThanDays: FORGOTTEN_AFTER_DAYS` (180).
  Shared cutoff helper `olderThanCutoff(days)` is used by shelf-filter, the shelf fetch,
  and the random route. Cards show an hourglass "X mo on the shelf" badge when dusty.
- `SHELF_EMPTY` (shelf-empty.ts) must have an entry for every `ShelfId` — it's an exhaustive Record.

### Item detail (`src/components/items/`)
- `ItemDetail.tsx` — two-pane (sticky cover left / metadata right on lg), **About** section
  with show-more clamp, **Mark as `doneVerb(category)`** → `ItemMarkDoneDialog.tsx` (stars +
  verdict) → PATCH `{status, rating_personal, verdict}`; "Your verdict" card when done;
  `RelatedItemsStrip.tsx` ("More from your shelves", same category/domain — fetched
  server-side in `src/app/(app)/item/[id]/page.tsx`).
- `StructuredFields.tsx` — catalog-style label/value rows; accepts `omitKeys` (description
  is omitted because the About section shows it).

### Capture (`src/app/(app)/add/page.tsx`)
- Duplicate lookup as you type (`GET /api/items/check-url` → fingerprint match, RLS-scoped).
- **Batch mode** ("Paste several links"): sequential `POST /api/capture` per URL; duplicate
  detection reads `created: false` from the capture response (no pre-check round-trip).
- PWA share target already existed (manifest + `?url=` prefill).

### Collections
- List (`collections/page.tsx` + `CollectionsPageClient.tsx`): 2×2 cover **mosaics**.
- Detail (`CollectionDetailClient.tsx`): **Share** dialog → `POST/DELETE
  /api/collections/[id]/share` (32-hex token) → public page `src/app/share/[token]/page.tsx`
  (admin client, noindex, `/share` is intentionally outside the middleware matcher);
  **Places** section (restaurants/travel items → Google Maps search links — there are no
  stored coordinates; a real map would need geocoding).

### API routes added
- `GET /api/items/random` (shelf-aware random want/planned pick)
- `GET /api/items/check-url`
- `POST|DELETE /api/collections/[id]/share`
- `GET|POST /api/jobs/digest` — CRON_SECRET-gated weekly letter, one per due profile;
  sends via Resend when `RESEND_API_KEY` is set. `?dry=1` renders without sending.
  (Superseded the single-recipient `DIGEST_EMAIL_TO` version.)
- PATCH `/api/items/[id]` now accepts `rating_personal`, `verdict`; manages `done_at`.

### Cross-cutting
- **View Transitions**: `experimental.viewTransition` in next.config.ts; covers wrapped in
  `ViewTransition name={'item-cover-' + id}` in ItemCard and ItemDetail. Import from
  `src/lib/view-transition.tsx` — a wrapper that no-ops on stable React because **vitest's
  React has no ViewTransition export** (only Next's vendored canary does). Never import
  ViewTransition from "react" directly in components.
- Dominant color is the cards' loading/placeholder tint everywhere (ItemCard, QuickLook,
  triage stack, related strip, share page).
- Shared helpers extracted during review: `src/lib/auth/cron-secret.ts`,
  `formatDateMedium` in `src/lib/format-timestamp.ts`, `olderThanCutoff` in shelves.ts.

## Gotchas you will hit

1. **`server-only` + tsx**: any script importing `src/lib/supabase/admin.ts` or
   `image-cache.ts` must run with `--conditions=react-server`
   (see `npm run backfill:images`). Plain `npx tsx` throws the "Client Component" error.
2. **Color backfill**: `npm run backfill:images -- --dry-run` first. It processes items
   missing a cached cover OR missing `dominant_color`.
3. The cloud session used a localhost mock Supabase + screenshot harness; those files are
   **not in the repo** (git-excluded). On the local checkout you test against real Supabase.
4. Color sort puts `dominant_hue IS NULL` items last; until backfill runs, most items have
   no hue, so the sort looks like "recent" — not a bug.
5. Realtime: `useItemRealtime` filters rows through `itemMatchesShelf`, which needs
   `created_at` for the Forgotten shelf (missing → treated as not matching).
6. RLS scopes session-client queries. The digest job runs on the admin client (a cron has
   no session), so every one of its queries must filter `user_id` explicitly — it is
   multi-user now, and an unfiltered read there is a cross-profile leak.

## Known deferred items (sensible next improvements)

- Cover fallback pattern (image → dominant_color → category gradient) is duplicated across
  ~6 components; extract a `coverBackground(item)` helper if touching it again.
- Shelf cache is dropped wholesale on sort change (could key cache by sort).
- Triage swipe physics are minimal (no velocity fling); polish candidate after phone testing.
- Digest selects 30-day-stale items (`STALE_AFTER_DAYS`) vs Forgotten's 180 — intentional,
  but revisit if the user finds it confusing.
- `mobile_share_extension` is used as the capture source for PWA-shared URLs.

## Branch log (oldest → newest)

`0c7a8e3` plan doc → `a30b746`/`49b9db5`/`a5eb44f` gallery-minimal experiment (later
reverted) → `bbbbafe` revert to warm identity, keep masonry, item-detail+landing redesign →
`190c094` nav simplification (centered + button, Browse/Manage sidebar) → `e600e10` taste
loop, palette, shuffle, quick look, Forgotten shelf → `977a3f5` swipe triage, batch capture,
mosaics, share pages → `eb14efc` docs → `e44b96f` quick-look key fix → `96c03ea` code-review
fixes → `536e1f8` backfill script fix.

Working conventions: match existing patterns, minimal diffs, `npm test` + `npm run build`
before done, update `AGENTS.md`/docs when behavior changes, never commit `.env.local`.
