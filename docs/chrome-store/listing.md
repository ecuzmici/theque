# Chrome Web Store listing: thèque

This is the finalized copy + asset spec for the Web Store listing. The **store owner must perform the actual dashboard upload and review submission**. This file just holds the assets and copy.

Published listing: https://chromewebstore.google.com/detail/blahodpkabcnliljldelkoggeemfgdak
Extension version (manifest): `1.0.0` (packaged as `theque-extension-v1.0.0.zip` at the repo root)

> **Taxonomy note:** copy below reflects the *current* shelves: **Books, Watch, Listen, Eat, Shop, Travel, Read, Cook, Tools**. There is no "gifts" category anymore (gift intent lives in collections). Do not reintroduce old shelf names.

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
• Watch: films, TV, and videos (IMDb, Letterboxd, YouTube)
• Listen: albums, songs, and podcasts
• Eat: restaurants and places
• Shop: products and things you want
• Travel: stays and destinations
• Read: articles to come back to
• Cook: recipes
• Tools: apps and software

Group anything into collections like "Japan 2026", "Birthday gifts", or "Weekend reads" for trips, projects, and gift lists.

WHY THÈQUE
• One-click capture from any tab. No forms, no friction.
• Automatic enrichment: links become visual cards with covers and details.
• Private by design: it's your library. No feed, no likes, no algorithm, no ads.
• Browse by taste: image-forward shelves, search, and collections.

PRIVATE BY DESIGN
The extension only saves a page when you click "Save to thèque". It reads the active tab's URL (and an optional note or shelf hint you add), then sends it to your own thèque account. It does not track your browsing, does not sell data, does not show ads, and does not share what you save with advertisers. A capture token is stored locally so you don't have to reconnect every time.

HOW TO START
1. Install the extension.
2. Open thèque at https://theque.app and sign in (passwordless; we email you a code).
3. Connect the extension once from Settings.
4. Click the thèque button on any page to save it.

Questions or support: ecuzmici@gmail.com
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
| Screenshots (up to 5) | **1280×800** or 640×400 | At least 1 required | ✅ 5 real app shots captured (see below) |
| Small promo tile | **440×280** | Required to be featured | ✅ `promo-small-440x280.png` |
| Marquee promo tile | 1400×560 | Optional | ✅ `promo-marquee-1400x560.png` |
| Store icon | 128×128 | Required | ✅ `extension/icons/icon-128.png` |

### Real screenshots (captured)
The old synthetic mockups (`extension-popup-1280x800.png`, `library-result-1280x800.png`) have been
**deleted**. Real 1280×800 screenshots of the running app are in `docs/chrome-store/`:

| File | What it shows | Use as |
|---|---|---|
| `app-library-light-1280x800.png` | Library grid of real book/film cover cards + shelf tabs | **Gallery #1 (lead)** |
| `app-item-detail-light-1280x800.png` | Enriched item card (cover, description, rating, source, actions) | Gallery #2 |
| `app-shelf-watch-light-1280x800.png` | Watch shelf: film/TV posters with provider badges | Gallery #3 |
| `app-shelf-books-light-1280x800.png` | Books shelf: portrait covers | Gallery #4 |
| `app-extension-popup-1280x800.png` | The extension popup in its connected state (shelf hint + note + Save) | Gallery #5 |

`app-library-light-1280x800.png` is also embedded on the landing page (`public/landing-library.png`).
The popup shot is generated by `scripts/capture-extension-popup.mjs` (stubs `chrome.*`, renders the
real popup UI on a brand canvas).

**Optional, still worth adding:** a **collection** shot (none exist yet, so create one first), and/or a
photo of the popup open *over a real browser tab* for extra context.

To regenerate after UI/data changes (needs the dev server running + `QA_DEV_*` in `.env.local`):

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
