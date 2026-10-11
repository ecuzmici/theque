# Theque — UI Shelves (Option A)

Shelves are **fixed smart views** defined in code — not database tables. Shelves answer “what kind of thing is this?”; status answers “where is it in the taste loop?” (Collections and tags were removed — unused.)

## Navigation

**Primary:** Library (default) · Search · Add link · Settings

**Library header (masthead):** Title only (no description line), followed on **every shelf** by the **Spine Band** — a thin strip woven from the library's own `dominant_color` values (saved items seen edge-on, like book spines), with a quiet caption beneath (`N spines · M new this week`, plus amber `N to sort` / `N forgotten` nudges, hidden at zero) and a hairline rule closing the header zone. The band stays **whole-library** on filtered shelves (it does not recompute per category), so switching shelves never pops the top of the page. Directly under it sits the shelf-aware **"Made for you"** banner: both categories on All, **Books** on the Books shelf, **Movies/TV** on Watch, and a disabled ("No picks for this shelf") state on Articles / Done / Other / Inbox. See `docs/adr/0019-persistent-shelf-aware-library-header.md` (which supersedes `0012-library-spine-band.md`). Below that: horizontal shelf tabs (scroll on mobile), then a toolbar: "Tonight's pick" shuffle (random still-wanted item from the shelf), sort (Recent / By color / A–Z), and a covers-only **wall mode** toggle. On the Inbox shelf the shuffle slot becomes **Swipe to triage** (card stack: right = keep, left = dismiss, folder = categorize, undo).

## Shelf definitions

Each shelf maps to a query over `items`:

| Shelf ID | Label | Filter |
|----------|-------|--------|
| `all` | All | `status != dismissed` |
| `books` | Books | `category = books` AND `status != dismissed` |
| `watch` | Watch | `category = movies_and_tv` AND `status != dismissed` |
| `articles` | Articles | `category = articles` AND `status != dismissed` AND `status != inbox` |
| `other` | Other | `category IN (restaurants, products, travel, recipes)` AND `status != dismissed` |
| `inbox` | Inbox | `status = inbox` |

The steady-state strip is **All · Books · Watch · Articles** — the Done shelf was removed; consumed items stay on their category shelf behind a toolbar **Hide done** toggle. **Other** groups the long-tail categories (`restaurants`, `products`, `travel`, `recipes`) into one tab; the old per-category Listen/Eat/Shop/Travel/Cook/Tools tabs are gone, and **Read** is now labelled **Articles**. **Other** and **Inbox** are *dynamic* — shown only when they hold at least one item; if the shelf you are viewing empties out, you fall back to **All**.

**Forgotten** is no longer a tab: `want` items older than 180 days surface as an "N forgotten" nudge link in the Spine Band caption plus the weekly "saved and forgot" digest.

**Badge:** Inbox tab shows count of `status = inbox`.

**Empty states:** Per-shelf illustration + CTA (“Save something from Chrome or your phone”).

## Sort order

Default: `created_at DESC`

Optional later: `title ASC`, manual pin

## Card grid

- Mobile: 2 columns
- Tablet: 3 columns
- Desktop: 4–5 columns
- Gap: consistent 12–16px
- Processing: skeleton with shimmer until `processing_status = ready`

## Item detail

- Hero image (max height ~40vh mobile)
- Title, subtitle, structured field grid (category-specific)
- Note (editable)
- Status selector: inbox / want / done / dismiss
- “Open original” → `url`
- Retry enrichment if `failed`

## Inbox flow (secondary)

Access via Inbox shelf — not home default.

**Actions (swipe or action sheet):**

- **Keep** → `status = want`, stay on shelf for category
- **Wrong type** → category picker
- **Dismiss** → `status = dismissed`

## Search

Full-width on mobile. Filters:

- Text `q` on title, description, domain, note
- Optional chips: category, status

## Design direction (PoC)

- **Tone:** Warm private library — cream/dark mode, soft shadows, editorial serif for titles
- **Imagery-first:** Cards dominated by cover/poster/photo
- **Not:** Dense tables, spreadsheet filters, admin sidebars

## Config location (implementation)

```ts
// src/lib/shelves.ts
export const SHELVES = [ ... ] as const;
```

Agents must not add `shelves` table without product approval.
