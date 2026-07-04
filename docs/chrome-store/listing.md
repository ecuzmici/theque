# Chrome Web Store listing: thèque

This is the finalized copy + asset spec for the Web Store listing. The **store owner must perform the actual dashboard upload and review submission**. This file just holds the assets and copy.

Published listing: https://chromewebstore.google.com/detail/blahodpkabcnliljldelkoggeemfgdak
Extension version (manifest): `1.0.0` (packaged as `theque-extension-v1.0.0.zip` at the repo root)

> **Taxonomy note:** copy below reflects the *current* shelves: **Books, Watch, Articles, Other** (plus **All** and **Done**). The long-tail categories — restaurants, products, travel, recipes — are grouped under **Other**. There is no Listen/Eat/Shop/Cook/Tools shelf and no "gifts" shelf anymore. Do not reintroduce old shelf names or removed features like tags or collections.

---

## Store fields

### Extension name (75 char max)
```
thèque: save to your taste library
```
(35 chars; well under the 75-char title limit.)

### Category
`Productivity`

### Language
`English`

### Short description (132 char max)
```
One click saves any page to your private library. Books, films, places, and products become rich, organized cards.
```
(115 chars.)

### Detailed description
```
thèque turns the things you find online into a beautiful private library, not a pile of dead bookmarks.

Click the thèque button on any page and it's saved. Behind the scenes, thèque reads the page and builds a rich card: cover art, title, author or director, ratings, price, and more. No copy-paste, no manual tagging.

Your saves sort themselves onto shelves:
• Books: Goodreads, Open Library, your next read
• Watch: films and TV (IMDb, Letterboxd, YouTube)
• Articles: pieces to come back to
• Other: restaurants, products, travel, and recipes — the rest of your taste, in one place

As you mark what you finish with a quick verdict, thèque learns your taste and starts suggesting new books and films to add next, drawn from your ratings instead of a trending feed.

WHY THÈQUE
• One-click capture from any tab. No forms, no friction.
• Automatic enrichment: links become visual cards with covers and details.
• Private by design: it's your library. No feed, no likes, no ads, nothing built to keep you scrolling.
• Browse by taste: image-forward shelves, color sort, and search.

PRIVATE BY DESIGN
The extension only saves a page when you click "Save to thèque". It reads the active tab's URL (and an optional note or shelf hint you add), then sends it to your own thèque account. It does not track your browsing, does not sell data, does not show ads, and does not share what you save with advertisers. A capture token is stored locally so you don't have to reconnect every time.

HOW TO START
1. Install the extension.
2. Open thèque at https://theque.app and sign in (passwordless; we email you a code).
3. Connect the extension once from Settings.
4. Click the thèque button on any page to save it.

Questions or support: hello@theque.app
Privacy policy: https://theque.app/privacy
```

### Privacy policy URL
```
https://theque.app/privacy
```

### Website / homepage URL
```
https://theque.app
```

### Single purpose (required justification field)
```
thèque saves the URL of the page the user is actively viewing, when they click the extension button, to the user's own thèque library.
```

### Permission justifications
- **activeTab**: read the current tab's URL/title only when the user clicks "Save to thèque".
- **storage**: store the capture token and the user's thèque base URL locally so they don't reconnect on every save.
- **scripting**: read minimal page metadata (title) from the active tab at save time.
- **host_permissions (`theque.app`, `theque.vercel.app`)**: send the saved page to the user's thèque account API.

---

## Image assets (what to upload, and where)

Chrome Web Store image requirements:

| Asset | Size | Required? | Status |
|---|---|---|---|
| Screenshots (up to 5) | **1280×800** or 640×400 | At least 1 required | ✅ 6 real app shots captured + owner-provided extension shot (see below) |
| Small promo tile | **440×280** | Required to be featured | ✅ `promo-small-440x280.png` |
| Marquee promo tile | 1400×560 | Optional | ✅ `promo-marquee-1400x560.png` |
| Store icon | 128×128 | Required | ✅ `extension/icons/icon-128.png` |

### Real screenshots (captured)
The old synthetic mockups (`extension-popup-1280x800.png`, `library-result-1280x800.png`) have been
**deleted**. Real 1280×800 screenshots of the running app are in `docs/chrome-store/`. The store caps
the gallery at **5** — pick five from the candidates below. The gallery now uses the **dark theme**
(`-dark-` files); the earlier `-light-` shots are retained as a fallback.

| File | What it shows | Gallery |
|---|---|---|
| `app-library-dark-1280x800.png` | Library grid of real book/film cover cards + shelf strip (All · Books · Watch · Articles · Done) | **#1 (lead)** ✅ |
| `app-recommendations-dark-1280x800.png` | AI recommendation deck (Watch): a resolved film pick with rating, "Why you" rationale, and Save/Skip/Not-for-me | **#2** ✅ |
| `app-item-detail-dark-1280x800.png` | Enriched item card (cover, description, rating, source, actions, structured fields) | **#3** ✅ |
| `app-shelf-watch-dark-1280x800.png` | Watch shelf: film/TV posters | **#4** ✅ |
| `app-extension-popup-1280x800.png` | **Owner-provided real popup shot** — replace before upload (see note) | **#5** ✅ |
| `app-shelf-books-dark-1280x800.png` | Books shelf: portrait covers | alternate |
| `app-shelf-done-dark-1280x800.png` | Done shelf: finished items with star ratings + personal verdicts (the taste loop that feeds recommendations) | alternate |

The `-light-` variants of the above (`app-library-light-1280x800.png`, etc.) are still present as a
fallback set. `app-library-light-1280x800.png` is also embedded on the landing page
(`public/landing-library.png`).

> **Extension popup shot:** `app-extension-popup-1280x800.png` is currently the synthetic brand-canvas
> render from `scripts/capture-extension-popup.mjs`. **The owner is replacing it with a real screenshot
> of the extension open over a live tab** before upload — don't regenerate over it.

All other `app-*` shots are regenerated by `scripts/capture-store-screenshots.mjs`, which authenticates
via the dev-only QA session, hides the Next.js dev-tools indicator, and (gateway permitting) drives the
Watch shelf's **Get my picks** deck for the recommendations shot (a film pick). The `read`/Articles and `done` shelves are
captured only when they hold cards. To regenerate after UI/data changes (needs the dev server running +
`QA_DEV_*` in `.env.local`; recommendations also need a configured AI Gateway):

```bash
npm run dev                                   # in one terminal
node scripts/capture-store-screenshots.mjs    # COLOR_SCHEME=dark for the dark theme
```

---

## Pre-submission checklist
- [x] Bumped `manifest.json` to `1.0.0` and packaged `theque-extension-v1.0.0.zip` (Chrome requires a higher version per upload).
- [x] Real screenshots replace the synthetic mockups (no old shelf names, no fake address bar).
- [ ] Short + detailed description pasted, privacy URL set, permissions justified.
- [x] 440×280 small promo tile created (`promo-small-440x280.png`).
- [ ] `npm run build` clean; extension loads unpacked from `extension/`.
