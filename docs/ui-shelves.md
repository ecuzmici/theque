# Theque — UI Shelves (Option A)

Shelves are **fixed smart views** defined in code — not database tables. Users organize by **collections** and **tags**; shelves answer “what kind of thing is this?”

## Navigation

**Primary:** Library (default) · Search · Add · Settings

**Library header:** Horizontal shelf tabs (scroll on mobile)

## Shelf definitions

Each shelf maps to a query over `items`:

| Shelf ID | Label | Filter |
|----------|-------|--------|
| `all` | All | `status != dismissed` |
| `books` | Books | `category = books` AND `status != dismissed` |
| `watch` | Watch | `category = movies_and_tv` AND `status != dismissed` |
| `eat` | Eat | `category = restaurants` AND `status != dismissed` |
| `shop` | Shop | `category IN (products, gifts)` AND `status != dismissed` |
| `travel` | Travel | `category = travel` AND `status != dismissed` |
| `read` | Read | `category = articles` AND `status != dismissed` |
| `cook` | Cook | `category = recipes` AND `status != dismissed` |
| `inbox` | Inbox | `status = inbox` |

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
