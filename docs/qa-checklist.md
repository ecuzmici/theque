# Theque — integration QA checklist

Use this matrix before calling a release “good enough” for personal PoC. Capture paths: **Chrome extension**, **iOS Shortcut** (or **`curl`** with Bearer token). Web app: library, inbox, collections.

**Agent session:** Paste [`docs/sessions/qa-integration-prompt.md`](./sessions/qa-integration-prompt.md). Skips magic-link login; local auth via `npm run qa:session-url` (see `AGENTS.md`).

## Reference URLs

| # | Domain / type | Example URL | Focus |
|---|----------------|-------------|--------|
| 1 | **IMDb** (film) | `https://www.imdb.com/title/tt1375666/` | Movies/TV structured metadata |
| 2 | **Goodreads** (book) | `https://www.goodreads.com/book/show/5907.The_Hobbit` | Book structured metadata |
| 3 | **Article** | `https://www.nytimes.com/` (pick any article URL) | Generic OG / article parsing |
| 4 | **Product** | Amazon (or retailer) product detail URL | Product-ish OG fields |
| 5 | **Maps / place** | Google Maps place URL (share link from Maps app) | Place title / domain handling |
| 6 | **Recipe blog** | Any standalone recipe page with schema.org Recipe | Structured recipe fragments |

Replace placeholders with stable URLs you control during the run (bookmark this doc row).

## Per-URL matrix

For each URL above:

| Step | Pass criteria |
|------|----------------|
| Capture via extension | Item appears in library; `source` reflects chrome capture path. |
| Capture via Shortcut or curl | Same with `source` `ios_shortcut` (or tool noted). |
| Card enrichment | Within reasonable time, title/image/category populate OR failure state is visible and retry works. |
| Open original | Item opens canonical/original URL correctly. |

## Cross-cutting scenarios

| Scenario | Steps | Pass criteria |
|----------|--------|----------------|
| **Dedupe** | Capture the **same** URL twice (same path: extension or API). | Second response shows **`created`: false** (or UI shows single item / no duplicate row). |
| **Low-confidence routing** | Capture a generic/long-tail URL unlikely to match parsers (obscure blog home page). | Lands in **inbox** or low-confidence path per classifier rules; user can triage status/category. |
| **Collections + shelves** | Capture with `collection_ids` OR assign collection on detail screen; filter shelf/view by collection. | Item appears under expected collection filter; removing from collection updates filter. |
| **401 handling** | Omit or corrupt Bearer token once. | Clear **401** / unauthorized behavior from API (Shortcut/extension show failure). |

## Clients checklist

| Client | Verify |
|--------|--------|
| Chrome MV3 | Load unpacked per [`docs/chrome-extension.md`](./chrome-extension.md); token in storage; POST succeeds. |
| iOS Shortcut | Share sheet → Shortcut → POST JSON per [`docs/ios-shortcut.md`](./ios-shortcut.md). |
| PWA | Add to Home Screen; launches standalone; manifest/theme behave per [`public/manifest.json`](../public/manifest.json). |

## Regression notes

Record failures as GitHub issues with: URL used, capture client, response status/code, item id if any, screenshot of card state.
