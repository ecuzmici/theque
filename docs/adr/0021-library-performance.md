---
status: accepted
---

# Library performance: Dublin functions, local JWT check, cover thumbnails, light cards, kept library state

## Context

Emil reported that scrolling and taps in the library feel slow. We measured on 2026-10-24.

Production setup:

- Vercel Functions ran in `iad1` (Washington). The Supabase project is in `eu-west-1` (Ireland). Each Supabase call from a function added about 70 ms.
- The proxy and each page called `auth.getUser()`. That call goes to the Auth server. An item page made 4 Supabase calls in sequence (proxy auth, page auth, item, related items), so about 280 ms before the first byte.
- The project signs JWTs with ES256. Its JWKS is public, so a server can check a JWT without a network call.

Covers:

- Image caching stored the original image: 297 covers, mean 268 KB, largest 3.9 MB, up to 1944x2880 px. The grid draws a cover at about 200 px wide.
- 4 IMDb covers were not cached. Their originals are 8100x12000 px and 7.7 MB, above the 5 MB fetch limit, so the grid loaded them from Amazon at full size.
- No `<img>` had `loading="lazy"` or `decoding="async"`.

Client measurements (local production build, 210 cards, CPU slowed 4x in Chrome):

| Measure | Desktop | Phone size |
|---|---|---|
| Mean frame rate during a full scroll | 33 fps | 34 fps |
| Long tasks during the scroll | 29 tasks, 5949 ms | 31 tasks, 4970 ms |
| Longest task | 1285 ms (one frame that painted one large image) | 364 ms |
| Image decode work during the scroll | about 10.5 s on worker threads | not measured |

Other causes in the code:

- Each new page of cards re-rendered every card on the wall. The render time grew from 41 ms to 253 ms as the wall grew.
- Each card mounted a menu root and a dialog root, also when closed.
- Each card trigger had `backdrop-blur`: 212 elements with a backdrop filter.
- Each landscape cover drew a second, blurred copy of the image.
- Back from an item remounted the library. The page lost the loaded cards and the scroll position: 210 cards at y=32906 became 24 cards at y=264, and 4 shelves loaded again.

## Decisions

### 1. Functions run in `dub1`

`vercel.json` sets `"regions": ["dub1"]`. Dublin is next to `eu-west-1`. The Hobby plan allows one region.

### 2. The session check is local for reads and normal writes

`src/proxy.ts` and `getSessionUserOrNull` call `auth.getClaims()`. It checks the JWT signature against the JWKS. auth-js keeps the JWKS in memory for 10 minutes. It still refreshes an expired session.

A signed-out JWT stays valid until it expires (one hour at most). Two writes must not accept that, so they use `getVerifiedSessionUserOrNull` (network `getUser`):

- account deletion (`POST /api/account/delete`)
- a new capture token (`POST /api/capture-tokens`)

The settings page keeps `getUser`.

### 3. Each cached cover has a WebP thumbnail

Image caching writes `thumb.webp` next to `cover.<ext>`: at most 512x1024 px, WebP quality 76. The original stays for the item page.

- `getCoverImageUrls` gives the thumbnail URL and the full cover as fallback.
- `CoverImg` loads it with `loading="lazy"` and `decoding="async"`. When the thumbnail is missing, it loads the full cover.
- The grid, the Up next row, the related strip, and the "Made for you" tile use `CoverImg`. The item page, quick look, and inbox triage keep the full cover.
- `npm run backfill:thumbs` wrote the 297 thumbnails on 2026-10-24.
- `scripts/purge-orphan-covers.ts` keeps the thumbnail of a live cover.

`boundedRemoteImageUrl` asks Amazon's image CDN for a copy at most 1000 px wide (`._V1_UX1000_`). Image caching and the display URL both use it. The 4 IMDb covers are now cached (1000 px, about 150 KB).

Supabase image transformations are a paid feature. A test request on the free plan returned a 480x2879 image, so we do not use them.

### 4. Cards are cheap to render and to mount

- `ItemCard` is memoized. A new page of cards renders only the new cards.
- A card mounts its actions menu on first hover, focus, or long-press. Before that, a stand-in button with the same look renders. A click on the stand-in mounts and opens the menu. When the stand-in gets focus, the real trigger takes the focus.
- The delete dialog mounts on first use.
- The card trigger has no `backdrop-blur`.
- A landscape cover sits whole on the cover tint, with no blurred copy.
- The card no longer calls `router.prefetch` on hover and press. `Link` already prefetches in the viewport and on hover or touch. The two calls made two requests for each item.

### 5. The library keeps its state across an item visit

`src/components/library/library-store.ts` keeps in memory, for one user id:

- the loaded shelves
- the Up next row
- the "Hide done" toggle
- the scroll position
- the id of the item the user opened

On Back or Forward, the page renders from the store and scrolls to the stored position. Then it refreshes the first page of the shelf (`mergeFreshFirstPage`) and refetches the opened item, which can be changed or deleted. A link to the library does not restore the scroll position. A reload starts empty.

Next.js keeps a page mounted across navigation only with Cache Components (`cacheComponents`). That change needs a new structure for every page, so we did not do it.

### 6. Smaller changes

- The next page of cards starts to load 1500 px before the end of the wall (was 200 px).
- `item/[id]/loading.tsx` shows the item skeleton. The prefetch includes it, so a tap shows the item skeleton at once instead of the generic grid skeleton.
- The pending-enrichment poll merges the first page with `mergeFreshFirstPage`. Unchanged cards keep their objects, so they do not re-render every 2 seconds.

## Consequences

Same local build and setup after the changes:

| Measure | Desktop | Phone size |
|---|---|---|
| Mean frame rate during a full scroll | 51 fps | 57 fps |
| Long tasks during the scroll | 3 tasks, 172 ms | 0 |
| Longest task | 62 ms | none |
| Widest image on the wall | 512 px (was 8100 px) | 512 px |
| Elements with a backdrop filter | 2 (was 212) | 2 |

- Back from an item with 210 cards loaded shows all 210 cards at the same scroll position in 414 ms (4x slower CPU). The cards show before the refresh requests return: 4 shelf pages (3 for the Up next row, 1 for the shelf) and 1 item.
- A tap shows the item skeleton in 60 to 100 ms locally. The production gain comes from decisions 1 and 2. They remove about 280 ms from each item page and about 140 ms from each `/api/items` request.
- The rate limiter (Upstash) is outside the hot path: capture, recommendations, AI enrichment, book files, and OPDS. If its database is in the US, those routes get about 70 ms slower. Check its region.
- A new cover needs one more sharp pass and one more upload at enrichment time.
