# Microsoft Edge Add-ons listing: thèque

Copy + asset spec + submission runbook for the **Edge Add-ons** listing. The **store
owner must perform the actual Partner Center upload and certification submission** — this
file just holds what to paste and what to upload.

The extension is the **same MV3 package** shipped to the Chrome Web Store — Edge is
Chromium, and the account-connect flow is drop-in (no extension-ID coupling on the
server). See `docs/adr/0007-cross-browser-extension-distribution.md` for why.

- **Package to upload:** `theque-extension-v1.0.0.zip` at the repo root.
  Build it with **`npm run package:extension`** (runs `build:extension`, then zips only
  the runtime files). The exact same zip is used for Chrome.
- **Copy:** identical to the Chrome listing unless noted below. The canonical source is
  [`../chrome-store/listing.md`](../chrome-store/listing.md); don't fork the wording —
  reuse it so the two stores stay in sync.
- **Screenshots/promo art:** reuse the files already in
  [`../chrome-store/`](../chrome-store/) (referenced below — do not duplicate them here).

> **Taxonomy note:** copy reflects the *current* shelves — **Books, Watch, Articles,
> Other** (plus **All** and **Done**). Long-tail categories (restaurants, products,
> travel, recipes) are grouped under **Other**. No Listen/Eat/Shop/Cook/Tools shelf, no
> "gifts" shelf, no tags or collections. Don't reintroduce old shelf names.

---

## Prerequisite: register as an Edge extension developer

Edge publishing goes through **Microsoft Partner Center**, not the Chrome dashboard. This
is a one-time, **free** registration (no developer fee for Edge extensions, unlike
Chrome's one-time fee).

1. Sign in at <https://partner.microsoft.com/dashboard/microsoftedge/> with a Microsoft
   account.
2. Accept the Edge program agreement and complete the developer profile.
3. Once the program shows as active, **Submit a new extension** → upload the zip.

Until this account exists, everything below is "ready to paste" but cannot be uploaded.

---

## Store fields

Edge's Partner Center form maps closely to Chrome's. Reuse the Chrome copy verbatim;
Edge's length limits are equal or more generous, so nothing needs trimming.

### Extension name
```
thèque: save to your taste library
```

### Short description
```
One click saves any page to your private library. Books, films, places, and products become rich, organized cards.
```

### Detailed description
Paste the **Detailed description** block from
[`../chrome-store/listing.md`](../chrome-store/listing.md) unchanged (the "thèque turns
the things you find online…" copy). Keep it in sync — edit it there, then re-paste here.

### Category
`Productivity`

### Language
`English (United States)`

### Privacy policy URL (required)
```
https://theque.app/privacy
```

### Website / homepage URL
```
https://theque.app
```

### Support contact
```
ecuzmici@gmail.com
```

### Search terms (Edge-specific field; Chrome has no equivalent)
Edge lets you add a short list of search keywords. Suggested:
```
library, bookmarks, save, taste, books, films, reading list
```

### Permission justifications (asked again at certification)
Same as Chrome — reuse the justifications from
[`../chrome-store/listing.md`](../chrome-store/listing.md):
- **activeTab** — read the current tab's URL/title only when the user clicks "Save to thèque".
- **storage** — store the capture token + thèque base URL locally so the user doesn't reconnect on every save.
- **scripting** — read minimal page metadata (title) from the active tab at save time.
- **host_permissions (`theque.app`, `theque.vercel.app`)** — send the saved page to the user's thèque account API.

### Single purpose
```
thèque saves the URL of the page the user is actively viewing, when they click the extension button, to the user's own thèque library.
```

---

## Image assets

Reuse the existing Chrome-store assets — **do not** copy the files into this folder;
reference them from `docs/chrome-store/`.

| Asset | Edge requirement | Reuse |
|---|---|---|
| Screenshots (1+) | 1280×800 (same as Chrome) | All five `docs/chrome-store/app-*-1280x800.png`, lead with `app-library-light-1280x800.png` |
| Store logo | **300×300 PNG** | ✅ `store-logo-300x300.png` (in this folder) |
| Small promo tile | optional | `docs/chrome-store/promo-small-440x280.png` |

### Store logo (300×300)
Edge's listing logo is **300×300**, larger than the 128×128 Chrome ships.
`store-logo-300x300.png` is rendered from the brand vector (`src/app/icon.svg`) at high
density and downscaled with `sharp`, so it's crisp and matches the extension icon (same
rounded-square mark, transparent corners). To regenerate after a brand change:

```bash
node -e "const sharp=require('sharp'),fs=require('fs');sharp(fs.readFileSync('src/app/icon.svg'),{density:2400}).resize(300,300,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toFile('docs/edge-store/store-logo-300x300.png')"
```

---

## Pre-submission checklist

- [ ] Partner Center Edge developer account registered and active.
- [ ] `npm run package:extension` produced `theque-extension-v1.0.0.zip` (runtime files only).
- [ ] Loaded the zip unpacked in **Edge** and ran the **live connect + one capture** smoke
      test against `https://theque.app` (proves `externally_connectable` /
      `onMessageExternal` / `scripting` work in Edge — they do on Chromium, but verify once).
- [x] 300×300 store logo produced (`store-logo-300x300.png`).
- [ ] Screenshots (1280×800) and detailed description pasted; privacy URL + permission
      justifications filled.
- [ ] Submitted for certification (Edge review is typically a few business days).

After it goes live, record the Edge listing URL here and refresh the store links in
`docs/launch/` (see the "Store pages to refresh" section in `docs/launch/LAUNCH-NOW.md`).
