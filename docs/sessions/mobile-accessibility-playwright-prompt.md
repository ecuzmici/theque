# Copy-paste: Mobile UX + accessibility audit (Playwright)

Give this entire block to another agent with **Playwright MCP** enabled and local dev ready.

---

```
## Role

You are auditing and fixing **mobile UX and accessibility** for **Theque** — a Next.js App Router app (React 19, Tailwind v4, shadcn/base-ui). Stack context: `AGENTS.md`.

## Preconditions

- Repo root: bookmarkly / theque.
- `npm run dev` running on http://localhost:3000.
- **Auth:** Do NOT use interactive email login unless the human asks. Prefer `npm run qa:session-url` (needs `QA_DEV_SESSION_SECRET` + `QA_DEV_EMAIL` in `.env.local`) and open the printed URL once; confirm landing on `/library`. See `docs/sessions/qa-integration-prompt.md`.
- Use **Playwright MCP** for verification (viewport resize, snapshots, clicks, keyboard).

## Viewports to test

Run checks at minimum:

| Device class | Size | Notes |
|--------------|------|--------|
| Small phone | 375 × 667 | iPhone SE-class |
| Modern phone | 390 × 844 | iPhone 14-class |
| Short + wide | 360 × 640 | Android baseline |

Also test **system dark vs light** if theme toggle exists (`ThemeToggle` in shell).

## Routes and flows (mobile `lg:hidden` chrome)

Exercise these **with bottom navigation visible** (`src/components/layout/AppShell.tsx`):

1. **Library** `/library` — horizontal shelf pills (scroll), inbox badge, optional inbox banner, grid of cards, empty shelf state (`LibraryItemsSection`).
2. **Collections** `/collections` and `/collections/[id]` — lists, empty states.
3. **Search** `/search` — search input + filter selects + results grid.
4. **Add** `/add` — form + primary submit (also center FAB in bottom nav).
5. **Settings** `/settings` — capture tokens, sign out.
6. **Item detail** `/item/[id]` — hero image, primary actions (Open original, Edit details, Retry), dialogs/sheets from `ItemDetail` / `ItemEditSheet`.
7. **Inbox shelf** — card overlay triage (`InboxActions` dropdown on cards).

## Accessibility targets (WCAG 2.1 AA oriented)

Prioritize practical fixes over theoretical perfection; document anything that needs product trade-offs.

### Touch targets

- **Minimum ~44×44 CSS px** for interactive controls (WCAG 2.5.5 Level AAA is 44×44; AA does not mandate size but industry baseline for mobile).
- Verify: bottom nav links, FAB “Add”, shelf tab buttons, item card links, form buttons, dialog close, triage controls, theme toggle.
- Check **spacing between targets** (mis-taps, FAB overlapping scrollable content).

### Visibility & readability

- **Contrast:** body text, muted helper text, borders, focus rings, badge text — aim for **4.5:1** normal text, **3:1** large text/UI components vs background (light + dark theme).
- **Text size:** flag anything below ~14px for primary reading; bottom nav currently uses very small labels (`text-[11px]` in compact mode) — evaluate legibility and bump if needed without breaking layout.
- **Zoom / reflow:** no horizontal overflow on core flows at 320px width if feasible.

### Keyboard & semantics

- Tab order logical on **Search**, **Add**, **Settings**, **item detail** (including modal/dialog).
- Visible **focus** styles not removed (`focus-visible:ring` patterns).
- Icon-only controls must have **`aria-label`** (FAB already has `aria-label="Add link"` — verify others).
- **`aria-current="page"`** on active nav where applicable.
- Headings hierarchy on pages (single `h1` per view).
- Modals: focus trap, Escape to close if supported by primitive, return focus on close.

### Motion

- Respect **`prefers-reduced-motion`** where animations/shimmer are heavy (`globals.css` shimmer class on cards).

## Known implementation hotspots (start here)

These files drive mobile chrome and tap targets:

- `src/components/layout/AppShell.tsx` — sticky header, fixed bottom nav (`--ks-nav-height`), compact `NavLink`, centered Add FAB (`size-12`, `-translate-y-2`).
- `src/components/library/LibraryPageClient.tsx` — horizontal shelf tablist.
- `src/components/items/ItemCard.tsx`, `InboxActions.tsx` — triage on inbox cards.
- `src/components/items/ItemDetail.tsx`, `ItemEditSheet.tsx` — dialogs/buttons.
- `src/app/globals.css` — tokens, `--ks-nav-height`, dark mode.

Do **not** change shelf definitions (`src/lib/shelves.ts`) or backend APIs unless the human approves.

## Playwright MCP workflow

1. Set viewport → navigate authenticated session to route.
2. **Snapshot** (accessibility tree) before/after opening dialogs.
3. **Click/tap** each primary control; confirm navigation or expected UI change.
4. **Keyboard:** Tab through interactive elements on Add, Search, item detail, open Edit dialog.
5. Optional: screenshot failures to `qa-screenshots/mobile/` (create folder if missing).

## Deliverables

1. **Short audit table:** route × issue × severity (blocker / major / minor) × WCAG criterion (if applicable).
2. **Concrete fixes** in code (Tailwind/shadcn composition only where possible; minimal diffs).
3. **Re-test checklist** with PASS/FAIL after fixes.
4. **Residual risks:** anything needing design decision (e.g. shrinking bottom nav vs scroll).

## Verification commands

After edits:

- `npm run lint`
- `npm run build`

Report command output summaries; do not claim green without running them.

```

---

## One-liner for scheduling

```
Theque mobile a11y: Playwright at 375×667 & 390×844, qa:session-url auth, audit AppShell bottom nav + FAB + shelf tabs + item dialogs per docs/sessions/mobile-accessibility-playwright-prompt.md — WCAG-oriented tap targets, contrast, keyboard; fix in src/components/layout/AppShell.tsx and related; lint + build.
```
