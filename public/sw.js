/*
 * thèque service worker — deliberately minimal and auth-safe.
 *
 * Its only jobs are (1) to satisfy PWA installability (a fetch handler that can
 * answer navigations) and (2) to provide a graceful offline fallback. It MUST
 * NOT cache anything user-specific:
 *   - cross-origin requests (Supabase, analytics, fonts) are never intercepted;
 *   - same-origin /api, /auth, /login are never intercepted;
 *   - navigations are network-first and only fall back to a static offline page
 *     when the network is unreachable, so authed HTML is never served stale;
 *   - only content-hashed build assets and icons are cached.
 */

const CACHE = "theque-shell-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icon.svg", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function isCacheableStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/icon.svg" ||
    url.pathname === "/manifest.json"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GETs, and only same-origin — let everything else (Supabase, analytics,
  // POSTs, auth) hit the network untouched.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept auth- or data-sensitive routes.
  if (
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/auth") ||
    url.pathname.startsWith("/login")
  ) {
    return;
  }

  // Page navigations: always try the network first (fresh, auth-aware HTML),
  // fall back to the offline page only when the network is unreachable.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Content-hashed static assets + icons: stale-while-revalidate.
  if (isCacheableStatic(url)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response && response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }

  // Anything else: passthrough (do not call respondWith) — safest for auth.
});
