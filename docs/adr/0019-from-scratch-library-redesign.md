---
status: accepted
---

# From-scratch redesign: Up next row, cover wall, inline search, floating capture, ambient detail

A UI review on 2026-10-11 found five problems:

1. On a 390px phone, the first library cover starts at 505px. Six layers of chrome sit above it.
2. Each card has a "Mark watched/read" button and a `…` overlay. The grid reads as a task list.
3. Enrichment errors show in the UI: leaked IMDb title text, a duplicated year, a wrong director.
4. Search is a separate page with Category and Status dropdowns. Add is a full page for one field.
5. The amber accent is on every control, so it does not mark the primary action.

We built three variants for each of five redesign questions as prototypes on the real routes.
Emil picked one variant per question.

## Decisions

### 1. Library home opens on an "Up next" row (prototype `up-next`, variant A)

- One horizontal, scrollable row of covers replaces the masthead.
- The row holds: Tonight's pick (amber ring), one forgotten item, Next read, Next watch, and a "Made for you" tile.
- The "Made for you" tile opens the existing recommendation entry.
- The row has its own Shuffle control. The toolbar "Tonight's pick" button goes away.
- The Spine Band and the "Made for you" banner leave `/library`. The Spine Band stays on `/stats`.
- The forgotten tile shows only when a forgotten item exists.
- This supersedes the masthead in ADR 0013.

### 2. The grid is a uniform cover wall (prototype `cover-wall`, variant A)

- Every card uses a 2:3 cover. The grid has 2 columns on a phone and 5 columns on desktop.
- Each card shows one title line and one byline line under the cover.
- The cover carries the status: a check for done, stars for the rating, an amber dot for inbox.
- A landscape image sits on a blurred copy of the same image.
- An item without an image gets a typographic cover, tinted with `dominant_color`.
- Cards have no visible buttons. Quick actions open from a hover `…` on desktop and from a long-press on touch.
- The card cleans the display title. It removes leaked IMDb text such as "(TV Series 1990–1991) ⭐ 8.7 | Crime".
- Wall mode becomes the default presentation. The wall-mode toggle goes away.

### 3. Search is a sticky row above the shelf chips (prototype `search-bar`, variant A)

- A full-width search field sits above the shelf chips. Both stay pinned when you scroll.
- The search covers the active shelf.
- Status chips (Want, Done, Inbox) appear under the shelf chips only while a query is active.
- The `/search` page and its dropdowns go away. `/search?q=` redirects to `/library?q=`.
- There is no ⌘K command palette.

### 4. Capture is a sheet; nav is a header and a floating + (prototype `shell`, variant B)

- The phone bottom bar and the desktop sidebar go away.
- The header holds the wordmark (link to Library) and a "You" avatar button.
- A floating + button sits at the bottom right on all viewports.
- The + button opens a capture sheet. The sheet reads the clipboard and offers a one-tap "Save <domain>" when it finds a URL.
- If the clipboard read fails, the sheet shows the link field only.
- The "You" sheet holds the library counts, a Spine Band strip, Stats, Settings, and the theme toggle.
- The `/add` route stays for the PWA share target and the iOS Shortcut. It opens with the capture sheet prefilled.

### 5. Item detail uses an ambient backdrop (prototype `item-detail`, variant A)

- A blurred, tinted copy of the cover fills the top of the page. The cover floats over it.
- The title block is centered under the cover.
- A rating card under the title shows 5 stars. A tap on a star marks the item done and shows the verdict field.
- The page shows each fact one time. It removes the duplicated year line.
- The page uses the same display-title cleaner as the cover wall.

### 6. The header has an edge of the library's spines

- The wordmark sits in the center of the header bar, with no frame.
- The library's `dominant_color` values make a 5px edge along the full width of the bar's bottom. Each spine is about 4px wide.
- Nothing hangs below the bar.
- A keyline shows before the colors load. The keyline stays when the library has fewer than 8 colors.
- The spines sweep in from the left one time, when the colors load. Reduced motion turns the animation off.
- The wordmark and the "You" avatar center in the space above the spine edge.
- Update 2026-10-25: this edge replaces the first pick, a notch tab outlined by the spines (prototype `spine`, variant `notch`). The tab hung below the bar.
- The full Spine Band with its counts stays in the "You" sheet.

## Rules for the combined page

- The `/library` order on all viewports is: header, Up next row, sticky search row, shelf chips, grid.
- The amber accent marks one primary action per screen. Active chips use the foreground color.
- The prototype code is throwaway. We write each winner again as production code with tests.
- We delete each prototype folder in `src/components/prototype/` when its winner ships.

## Out of scope

- The enrichment data errors (wrong director, actor as byline, site screenshot as cover) need fixes in the enrichment pipeline. The display-title cleaner hides only the title text.
