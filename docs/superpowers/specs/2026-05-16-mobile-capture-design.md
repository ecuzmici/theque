# Mobile Capture — Design Specification

**Status:** Draft — awaiting review  
**Date:** 2026-05-16  
**Goal:** Make Theque a 2-tap capture experience on mobile (copy link → open app → save)

## Summary

Desktop users capture links with a single click via the Chrome extension. Mobile users currently have to navigate to `/add`, paste a URL, and submit — 4-5 steps of friction. This spec adds three features that bring mobile capture to near-parity with desktop:

1. **Clipboard Quick-Save** — When Theque detects a URL on the clipboard, it shows a one-tap save banner.
2. **PWA Install Guide** — A dismissable banner on mobile that walks users through installing Theque as a home screen app.
3. **PWA Share Target** — After PWA install on Android, Theque appears in the native OS share sheet.

Together, the capture flow becomes:

| Platform | Flow | Taps |
|----------|------|------|
| Android (share) | Share → pick Theque | 2 |
| Android (clipboard) | Open Theque → tap Save | 2 |
| iOS (clipboard) | Open Theque → tap Save | 2 |

## Feature 1: Clipboard Quick-Save

### Behavior

When the user opens the Theque PWA (or brings it to focus), a **clipboard save bar** appears at the top of the library page. It reads:

> 📋 **Save from clipboard** — Tap to capture a copied link

When the user taps the bar:

1. `navigator.clipboard.readText()` fires (requires user gesture — the tap IS the gesture).
2. iOS Safari shows a system "Allow Paste" dialog — user taps Allow.
3. If the clipboard contains a valid `http(s)` URL:
   - The URL is sent to `POST /api/capture` (session auth, `source: "clipboard"`).
   - The bar transitions to a success state: **"✓ Saved — [domain]"** with a link to the new item.
   - After 4 seconds, the bar auto-dismisses.
4. If the clipboard does NOT contain a URL:
   - The bar shows: **"No link found on clipboard"** and dismisses after 3 seconds.
5. If the URL is a duplicate:
   - The bar shows: **"Already saved — [title]"** with a link to the existing item.

### Placement

- The clipboard bar appears **above the shelf tabs** on the library page, below the mobile header.
- It renders only on mobile viewports (coarse pointer / small screen) or when running in `standalone` display mode.
- Desktop users are unaffected — they have the Chrome extension.

### Dismissal & persistence

- The bar includes a small "✕" close button.
- Dismissing hides it for the current session (stored in `sessionStorage`).
- It reappears on the next app open / page reload.
- After a successful save, it stays dismissed until the next focus event brings new clipboard content (but since we can't peek without a gesture, it simply reappears on next app open).

### Error handling

- Clipboard API not supported → bar does not render.
- Permission denied (user declines iOS paste dialog) → bar shows "Permission denied — tap again to retry."
- Network error during capture → bar shows "Network error — tap to retry" and stays visible.

### Component

New client component: `src/components/library/ClipboardSaveBar.tsx`

- Uses `navigator.clipboard.readText()` on tap.
- Calls `POST /api/capture` with session credentials (same as `/add` page — no capture token needed).
- Pure client-side; no server component wrapper needed.

## Feature 2: PWA Install Guide

### Behavior

When a user visits Theque on a mobile browser (not in `standalone` mode), a banner appears encouraging PWA installation:

> **📱 Add thèque to your home screen** for quick access and one-tap saving.  
> [How to install] [Dismiss]

Tapping "How to install" expands inline instructions specific to the detected platform:

**iOS Safari:**
> Tap the **Share** button (□↑) at the bottom of Safari → scroll down → **Add to Home Screen** → tap **Add**.

**Android Chrome:**
> Tap the **⋮ menu** at the top right → **Add to Home Screen** (or **Install App**) → tap **Install**.

On Android, if the `beforeinstallprompt` event is available, the "How to install" button directly triggers the native install prompt instead of showing instructions.

### Visibility rules

- **Show when:** mobile viewport AND `display-mode` is NOT `standalone` AND not previously dismissed.
- **Hide when:** running as installed PWA, or on desktop (`pointer: fine` + large viewport), or dismissed.
- Dismissal is stored in `localStorage` with key `theque-pwa-install-dismissed`.
- Dismissed state expires after **14 days** (re-prompt in case the user switched devices or reset their home screen).

### Placement

- Renders at the top of the library page, above the clipboard bar (if both are visible).
- Only shown on the library page — not on every page.

### Component

New client component: `src/components/library/PwaInstallBanner.tsx`

- Detects display mode via `window.matchMedia('(display-mode: standalone)')`.
- Detects platform via `navigator.userAgent` for iOS vs Android instructions.
- On Android, listens for `beforeinstallprompt` event and stores it for programmatic triggering.
- Stores dismissal timestamp in `localStorage`.

## Feature 3: PWA Share Target (Android)

### Manifest changes

Add `share_target` to `public/manifest.json`:

```json
{
  "share_target": {
    "action": "/save",
    "method": "GET",
    "params": {
      "url": "url",
      "title": "title",
      "text": "text"
    }
  }
}
```

When Android routes a share to Theque, it opens `/save?url=<shared-url>&title=<title>&text=<text>`.

### The `/save` handler page

New route: `src/app/(app)/save/page.tsx`

Behavior:
1. Read `url` from search params. If `text` contains a URL but `url` is empty, extract URL from `text` (some apps put the URL in the `text` field).
2. If no valid URL found → show error with link to `/add`.
3. If user has a session → auto-call `POST /api/capture` with `source: "share_target"`.
4. Show a minimal full-screen confirmation: **"✓ Saved to thèque"** with the domain/title, a "View item" link, and a "Close" button.
5. If the user is not logged in → redirect to `/login?next=/save?url=...` so the save completes after auth.

This page is intentionally minimal — it should load fast and confirm the save within 1-2 seconds. No navigation chrome, no shelves. Just the confirmation.

### Manifest icon improvements

The current manifest only has an SVG icon. For reliable PWA install and share target, add raster icons that already exist in `public/icons/`:

```json
{
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }
  ]
}
```

## Architecture

```
┌──────────────────────────────────────────────┐
│  Mobile user in any app                      │
│  ┌──────────┐   ┌──────────────────────┐     │
│  │ Copy link │   │ Share → Theque       │     │
│  │           │   │ (Android only)       │     │
│  └─────┬────┘   └──────────┬───────────┘     │
│        │                   │                  │
│        ▼                   ▼                  │
│  ┌──────────┐   ┌──────────────────────┐     │
│  │ Open PWA │   │ /save?url=...        │     │
│  │ /library │   │ Auto-capture + ✓     │     │
│  └─────┬────┘   └──────────────────────┘     │
│        │                                      │
│        ▼                                      │
│  ┌──────────────────────┐                    │
│  │ ClipboardSaveBar     │                    │
│  │ "Save from clipboard"│                    │
│  │ → tap → readText()   │                    │
│  │ → POST /api/capture  │                    │
│  │ → "✓ Saved"          │                    │
│  └──────────────────────┘                    │
└──────────────────────────────────────────────┘
```

### Files changed / created

| File | Action | Purpose |
|------|--------|---------|
| `src/components/library/ClipboardSaveBar.tsx` | Create | Clipboard detection + one-tap save |
| `src/components/library/PwaInstallBanner.tsx` | Create | PWA install guide banner |
| `src/app/(app)/save/page.tsx` | Create | Share target handler page |
| `public/manifest.json` | Modify | Add `share_target`, improve icons |
| `src/middleware.ts` | Modify | Add `/save` to protected routes |
| `src/components/library/LibraryPageClient.tsx` | Modify | Mount ClipboardSaveBar + PwaInstallBanner |

### What does NOT change

- No new database tables or columns.
- No new API endpoints — reuses `POST /api/capture` with session auth.
- No service worker changes needed (Next.js handles PWA basics via manifest).
- No capture token flow — clipboard save and share target both use session cookies.

### Database migration required

The `item_source` Postgres enum currently has: `chrome_extension`, `ios_shortcut`, `manual`, `mobile_share_extension`. We need to add `clipboard` as a new value:

```sql
ALTER TYPE item_source ADD VALUE IF NOT EXISTS 'clipboard';
```

The share target flow can reuse the existing `mobile_share_extension` source value — no need for a new one.

The `SOURCES` set in `src/app/api/capture/route.ts` must also add `"clipboard"`. The `ItemSource` type in `src/lib/database.types.ts` may need regenerating or manual update.

## Edge cases

| Scenario | Handling |
|----------|----------|
| User not logged in, opens `/save?url=...` | Redirect to `/login?next=/save?url=...`; capture completes after auth |
| Clipboard contains non-URL text | "No link found on clipboard" — dismiss after 3s |
| Clipboard is empty | Same as non-URL — "No link found" |
| URL is already saved (duplicate) | "Already saved — [title]" with link to existing item |
| Network offline | "Network error — tap to retry"; bar stays visible |
| Browser doesn't support Clipboard API | ClipboardSaveBar does not render |
| PWA already installed | PwaInstallBanner does not render |
| Android share with URL in `text` field (not `url`) | `/save` page extracts first URL from `text` param |
| iOS user shares via share sheet | Share target not supported on iOS; no effect |

## Out of scope

- Service worker / offline caching (future enhancement).
- Push notifications for enrichment completion.
- iOS Shortcuts automation.
- Native app wrapper (Capacitor).
- Clipboard detection on desktop (extension handles it).

## Testing

- **Clipboard bar:** Verify on iOS Safari PWA, Android Chrome PWA, and mobile browsers. Test with URL clipboard, non-URL clipboard, empty clipboard, and permission denial.
- **PWA install banner:** Verify iOS-specific and Android-specific instructions render correctly. Verify `beforeinstallprompt` triggers native install on Android. Verify 14-day dismissal expiry.
- **Share target:** Install PWA on Android, share a URL from Chrome/Maps/etc., verify `/save` handler captures correctly and shows confirmation.
- **Middleware:** Verify `/save` redirects unauthenticated users to login with correct `next` param.
