# Theque — UI Shelves (Option A)

Shelves are **fixed smart views** defined in code — not database tables. Users organize by **collections** and **tags**; shelves answer “what kind of thing is this?”

## Navigation

**Primary:** Library (default) · Collections · Search · Add link · Settings

**Library header:** Horizontal shelf tabs (scroll on mobile), then a toolbar: "Tonight's pick" shuffle (random still-wanted item from the shelf), sort (Recent / By color / A–Z), and a covers-only **wall mode** toggle. On the Inbox shelf the shuffle slot becomes **Swipe to triage** (card stack: right = keep, left = dismiss, folder = categorize, undo).

## Shelf definitions

Each shelf maps to a query over `items`:

| Shelf ID | Label | Filter |
|----------|-------|--------|
| `all` | All | `status != dismissed` |
| `books` | Books | `category = books` AND `status != dismissed` |
| `watch` | Watch | `category = movies_and_tv` AND `status != dismissed` |
| `articles` | Articles | `category = articles` AND `status != dismissed` AND `status != inbox` |
| `other` | Other | `category IN (restaurants, products, travel, recipes)` AND `status != dismissed` |
| `done` | Done | `status = done` |
| `inbox` | Inbox | `status = inbox` |

The steady-state strip is **All · Books · Watch · Articles · Done**. **Other** groups the long-tail categories (`restaurants`, `products`, `travel`, `recipes`) into one tab; the old per-category Listen/Eat/Shop/Travel/Cook/Tools tabs are gone, and **Read** is now labelled **Articles**. **Other** and **Inbox** are *dynamic* — shown only when they hold at least one item; if the shelf you are viewing empties out, you fall back to **All**.

**Forgotten** is no longer a tab: `want` items older than 180 days surface as an "N forgotten" chip in the library insights plus the weekly "saved and forgot" digest.

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
- Tags chips + add
- Collections chips + add
- Status selector: inbox / want / planned / done / dismiss
- “Open original” → `url`
- Retry enrichment if `failed`

## Inbox flow (secondary)

Access via Inbox shelf — not home default.

**Actions (swipe or action sheet):**

- **Keep** → `status = want`, stay on shelf for category
- **Plan** → `status = planned`
- **Wrong type** → category picker
- **Dismiss** → `status = dismissed`

## Search

Full-width on mobile. Filters:

- Text `q` on title, description, domain, note
- Optional chips: category, status, tag, collection

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
