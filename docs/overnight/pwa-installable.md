# Overnight idea: PWA / installable add-to-home-screen

Status: **in progress** (stub marker — real work follows in subsequent commits).

Make thèque installable to the home screen and gently invite mobile users:
- Complete the web app manifest icons (192 / 512 / maskable) on the existing `public/manifest.json`.
- Add a minimal, auth-safe service worker (`public/sw.js`) that satisfies PWA
  installability: network-first navigations with an offline fallback, cache only
  content-hashed static assets/icons, and pass through everything else
  (never caches `/api`, `/auth`, `/login`, Supabase, or any authed response).
- Add a tasteful, dismissible in-app install prompt (`beforeinstallprompt` on
  Chromium/Android + manual "Add to Home Screen" instructions on iOS), persisted
  in localStorage so it never nags.

ADR-safe: no social/sharing, no schema/migration.
