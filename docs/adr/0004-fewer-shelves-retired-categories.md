---
status: accepted
---

# Fewer shelves: retire three categories and group the long tail

The library shipped with **10 categories** and a **13-tab** shelf strip (9 category
tabs + All/Done/Forgotten/Inbox). Production data shows the taxonomy never filled
out: **Books + Movies = 83%** of items (90 of 109), Articles is a distant third (9),
and the remaining six categories hold **9 items combined** while `videos` holds
**zero**. The strip was mostly tabs for 1–2-item categories — noise that made the UI
harder to read. We are cutting the strip to its honest shape without losing
classification or enrichment quality.

The key distinction this ADR leans on: a **category** (what an item *is* — drives
enrichment) and a **shelf** (a tab — a saved filter) are independent. The `Watch`
shelf already proved one shelf can span several categories, so the tab strip can
shrink far without touching the taxonomy. We do both — shrink the strip *and* retire
a few genuinely-dead categories — because the data justifies a small taxonomy cut too.

## Decisions

- **Retire three categories** → taxonomy drops from 10 to **7** (`books`,
  `movies_and_tv`, `restaurants`, `products`, `travel`, `recipes`, `articles`):
  - `music` — streaming-app activity, not visual taste; 1 item.
  - `apps` — weakest conceptual fit for a *taste* library; 2 items.
  - `videos` — 0 items and already folded into Watch, so retiring it costs no UI.
- **Re-home, don't orphan** (existing rows *and* future captures behave identically):
  - YouTube / video → `movies_and_tv` (stays in Watch; keep the oEmbed resolver,
    retargeted).
  - Spotify / music schema (`MusicRecording`/`MusicAlbum`/`Podcast`) → `articles`.
  - GitHub / `SoftwareApplication` / Product Hunt → `products`.
  - Existing rows migrate the same way (1 music → `articles`, keeping its `done`
    status; 2 apps → `products`; 0 videos). The music/apps resolvers are **dropped**
    — their specialized fields (artist/album, developer/version) don't fit the
    `articles`/`products` schemas; those URLs enrich via the generic path.
- **Final shelf strip** — content tabs go from 9 to ~3.5:
  - **Books** (`books`), **Watch** (`movies_and_tv` only), **Articles**
    (`articles`) — always shown.
  - **Other** — one grouped catch-all over `restaurants` + `products` + `travel` +
    `recipes`, **hidden when it has zero items**. Gives the long tail a home without
    a tab each.
  - **All**, **Done** — always shown.
  - **Inbox** — **hidden when empty** (a triage queue with nothing to do is pure
    noise; appears the moment something lands).
  - **Forgotten** — **removed from the tab strip**, surfaced instead as an "N
    forgotten" chip in `LibraryInsights` plus the existing weekly digest. The
    `FORGOTTEN_AFTER_DAYS = 180` filter is unchanged.
  - Steady state: **All · Books · Watch · Articles · Done** (5 tabs), with Inbox and
    Other materializing only when non-empty.
- **Rename "Read" → "Articles".** The strip had a verb tab (`Read`) next to a noun
  tab (`Books`) for two parallel reading shelves — the real source of the "what's the
  difference?" confusion. Both stay separate shelves (books are the flagship and the
  marketed Pocket surface; the cards even differ in aspect, 2/3 vs 16/9), but the
  label now matches the `articles` category label already in `item-labels.ts`.
- **Dynamic-hide is conservative.** Only **Other** and **Inbox** hide when empty;
  Books/Watch/Articles/All/Done are always present (stable strip). If the shelf you
  are *viewing* becomes empty (you dismiss/done its last item), fall back to **All**.

## Considered and rejected

- **Reduce categories instead of shelves** — a much larger blast radius (parsers,
  resolvers, schemas, DB) for the same UI win that grouping achieves cheaply. We
  retire only the three the data declares dead.
- **Hide every empty tab** — does not solve the actual noise: the noisy tabs aren't
  empty, they hold 1–2 items. Grouping is what collapses them; hiding is only
  insurance against future emptiness.
- **Merge Books + Articles into one "Read" shelf** — verb-consistent and fewer tabs,
  but buries the 58-item flagship under a generic label, mixes two card aspect ratios
  in one grid, and undercuts the "filed onto a **Books** shelf" Pocket pitch.
- **Hide core shelves when empty too** — nicer for brand-new profiles, but trades a
  stable strip for one that appears/disappears under you; rejected for the owner's
  stable case (chose the conservative scope).
- **Clean-delete the retired classifier rules** (let music/apps fall to Inbox) —
  orphans those captures with no shelf and behaves differently from the migrated old
  rows. Re-homing keeps old and new consistent.
- **Forgotten as digest-only** — removes the only in-app path to forgotten items; the
  insights chip keeps the feature one click away without a standing tab.

## Consequences

- **Touch-points for retirement** (music/apps/videos): `database.types.ts`
  (`ItemCategory`), `classify/index.ts` (schemaRank), `classify/domain-map.ts`,
  `enrichment/resolvers/index.ts` (drop music/apps; retarget video→`movies_and_tv`),
  `item-labels.ts` (label + `doneVerb` maps), `item-display.ts` (aspect),
  `category-placeholder.ts`, `enrichment/llm/category-schemas.ts`, and their tests.
- **Shelf changes** in `shelves.ts` / `shelf-filter.ts`: remove `listen`/`tools`,
  fold `eat`/`shop`/`travel`/`cook` into a single `other` shelf, drop `videos` from
  the Watch grouping, rename the `read` shelf's label to "Articles" (the `ShelfId`
  may stay `read` to preserve `?shelf=` URLs, or rename to `articles` — single-user
  PoC, low cost either way), and remove `forgotten` from the rendered tab list.
- **Dynamic visibility** needs per-shelf counts in `LibraryPageClient` to decide
  whether `other`/`inbox` render — a new lightweight input the tab strip didn't have.
- **DB enum**: Postgres cannot `DROP` an enum value in place. Migrate the rows first;
  then either recreate the `item_category` type without the three values (heavier) or
  leave them **dormant** in the DB enum while removing them from the hand-maintained
  TS `ItemCategory` (lighter, recommended — nothing writes them once the classifier
  rules are gone). A follow-up "drop dormant values" migration is optional.
- **Descriptive docs to update *with* the implementation** (they describe current
  behaviour, so they move when the code moves — not before): `AGENTS.md` (enum +
  category↔shelf table), `docs/ui-shelves.md` (shelf-filter table), `docs/category-
  schemas.md` (music/videos/apps schemas), `docs/data-model.md` (enum list),
  `docs/qa-checklist.md` (youtube/github/applemusic rows now re-home), `docs/chrome-
  extension.md` (popup labels), `docs/chrome-store/listing.md` and
  `docs/launch/launch-kit.md` (**published copy** — only safe to change at deploy),
  and `pocket-alternative/page.tsx` (FAQ + hero shelf list). The `CONTEXT.md` glossary
  is already updated (this is a decision doc). Leave `docs/sessions/*` and dated
  `docs/superpowers/*` alone — they are historical records.
- **Pre-existing `gifts` drift**: `AGENTS.md`, `data-model.md`, and
  `category-schemas.md` still list `gifts`, retired before this ADR. Fold its cleanup
  into the same pass so the docs land fully correct.
- **Reversible-ish**: shelf grouping and the rename are trivially reversible; the
  category retirement is reversible in code but the row migration is a one-way data
  move (a re-split would need re-classification).
