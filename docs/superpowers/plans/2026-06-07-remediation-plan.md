# Theque — Remediation & Improvement Plan

**Date:** 2026-06-07
**Author:** Opus 4.8 (analysis) → handoff to Sonnet 4.6 (execution)
**Status:** Ready to execute

## Progress tracker

**Every fresh session: read this first.** Update it as workstreams land (mark done, note anything deferred or blocked). Sessions don't share memory — this is the shared state.

- [x] **Prelim** — `https://theque.app` IS the live production domain (200 OK via Cloudflare → Vercel; `x-vercel-id` confirmed; CSP shows correct Supabase project `jucaqjkgyhyzixzaisjr`). H1 implication: the hardcoded `THEQUE_APP_URL = "https://theque.app"` constant is correct for production capture — but `loadSettings()` still ignores the stored baseUrl and must be fixed so localhost dev capture works.
- [x] **A** — Category model redesign (A1+A2+A3 shipped in one PR; migration applied; `gifts` gone; `music`/`videos`/`apps` added; classify pipeline reordered; all 152 tests green, build clean).
- [x] **B** — Multi-tenant hardening. B1 rate limiting + B2 quotas + B3 per-user-cap RPC + B4 SSRF tightening (credentials, IPv6 hex, export) shipped. B4 DNS-rebinding TOCTOU documented and deferred for Opus-level undici Agent implementation. B5 signup stays open; all mutating endpoints rate-limited.
- [x] **C** — Image durability — PR open on `feature/workstream-c-image-durability`; bucket public, `cacheItemImage` wired into enrichment, `getDisplayImageUrl` in cards; backfill script ready
- [x] **D** — Enrichment reliability & freshness — poll loop replaced with Supabase Realtime subscription + 60 s REST fallback; `useItemStatusRealtime` hook added; no DB migration needed
- [ ] **E** — UX polish & scale
- [ ] **F** — AI recommendations
- [ ] **G** — Housekeeping
- [ ] **H** — Chrome extension (after A + Prelim answer)
- [ ] **I** — Chrome Web Store listing (after A + H)

## Context for the executor

Theque was architected as a **single-user, private PoC** but is now a **published, open-signup website + Chrome Web Store extension**. Most issues below stem from that assumption no longer holding. Signup is open (`signInWithOtp` with no `shouldCreateUser: false` in `src/app/login/page.tsx`), so any visitor can create an account and drive cost/abuse through capture + enrichment + AI endpoints.

This plan is organized into **independent workstreams (A–G)**, each roughly one PR. They are ordered by priority and dependency. Within each: the problem, concrete steps with real file paths/symbols, schema/migration details, tests, and acceptance criteria.

### Conventions (from AGENTS.md — do not violate)
- Match existing patterns; **minimal diffs; no drive-by refactors**.
- Run `npm test` (Vitest) before claiming parser/classify/auth changes done.
- Shelf/category logic lives in `src/lib/shelves.ts` + `src/lib/shelf-filter.ts` + `src/lib/library-items-for-shelf.ts` — change there, not in ad-hoc page queries.
- New domain parser → `src/lib/enrichment/parsers/`, wire in `extract.ts`, add fixture + test in `extract.test.ts`.
- LLM features are gated by env (`LLM_ENRICHMENT_ENABLED`, `GEMINI_API_KEY`); deterministic paths must work without them.
- Read `node_modules/next/dist/docs/` before writing Next.js 16 code — APIs differ from training data.
- Never commit secrets / `.env.local`.
- After DB changes, regenerate `src/lib/database.types.ts` (Supabase type gen) — many `Record<ItemCategory, …>` maps will fail to typecheck until the enum and these types agree.

### Tooling available to the executor (use it)
The repo owner has connected two MCP connectors for this work — prefer them over guessing or asking:
- **Supabase connector** — use it to **apply and verify migrations**, inspect the live schema/enums/RLS, and run SQL checks while developing and after. After every migration in this plan: apply it, then query `information_schema`/`pg_enum` (or the connector's schema tools) to confirm the change landed, and spot-check RLS still scopes by `auth.uid()`. Then regenerate `src/lib/database.types.ts` to match.
- **Vercel connector** — use it to **check the deployment after pushing**: build status/logs, env vars (confirm new ones like `UPSTASH_*` are set in the right environments), cron registration (Workstream B3/D), and — importantly for Workstream H — **whether `theque.app` is a live custom domain** pointed at the production deployment, vs. only `theque.vercel.app`. That answer determines the extension fix.

**Open question to resolve first via the Vercel connector:** is `https://theque.app` actually serving production? Workstream H's correctness depends on it.

### Suggested execution order
1. **A** (categories) and **B** (multi-tenant hardening) are the highest priority and independent — can go in parallel.
2. **C** (image durability) depends on the SSRF guard touched in B.
3. **D**, **E**, **F**, **G** follow.
4. **H** (extension) depends on the Vercel domain answer and should follow **A** (the popup's shelf-hint options must match the new taxonomy). **I** (store listing) follows **A** + **H** (screenshots and copy must reflect the final taxonomy and a working extension).

### Finding → workstream map
| Source finding | Workstream |
|---|---|
| Categories don't make sense; `gifts` is an intent; `articles` is the junk drawer; domain map outranks schema.org; missing types | **A** |
| No rate limiting (FINDING-004); no quotas (FINDING-016); SSRF surface now public (FINDING-001); cron has no per-user fairness; open signup | **B** |
| Images not cached → link rot (`image_storage_path` unused) | **C** |
| Item detail polls instead of Realtime; terminal enrichment failures; cron cadence | **D** |
| No tag management; no insights; no library pagination; ILIKE-only search + filter injection (FINDING-005); tablist a11y | **E** |
| AI recommendations spec'd but unbuilt | **F** |
| Dep vulns; PWA share target; `mobile_share_extension` unused; error hygiene | **G** |
| Chrome extension: domain/base-URL correctness (FINDING-015 + likely live capture bug), stale shelf-hint taxonomy, version bump | **H** |
| Chrome Web Store listing: rewrite description, regenerate screenshots (current ones are stale synthetic mockups) | **I** |

---

## Workstream A — Category model redesign

**Problem.** The enum `books, movies_and_tv, restaurants, products, gifts, travel, recipes, articles` has structural flaws:
- `gifts` is an *intent/context*, not a kind of thing — it overlaps the collection concept and is even missing from `EXTENSION_CATEGORY_HINTS` (`src/lib/capture/category-hint.ts`).
- `articles` is the default for everything unknown (`classify/index.ts:106`, confidence 0.4) → the "Read" shelf is a junk drawer.
- Broad domains outrank page data: domain map returns confidence **0.95** (`domain-map.ts:33`) and is checked *before* schema.org (**0.85**) in `classify()`, so `google.com → restaurants` and `youtube.com → movies_and_tv` override a page's own structured data.
- Missing common save-types: music/audio, general video (YouTube ≠ film), software/tools.

**Decision (locked):** all three phases are **in scope for the first pass** — ship A1 → A2 → A3 in that order within the workstream. A3 is additive but not deferred.

Do this in **three phases** (A1 low-risk first, then A2, then A3).

### A1 — Remove `gifts`; stop defaulting unknowns to `articles`
1. **Migration** `supabase/migrations/<ts>_category_taxonomy_v2.sql` — recreate the enum without `gifts` and migrate data:
   ```sql
   alter type item_category rename to item_category_old;
   create type item_category as enum (
     'books','movies_and_tv','restaurants','products','travel','recipes','articles'
     -- A3 will add: 'music','videos','apps'
   );
   alter table items
     alter column category type item_category
     using (case category::text when 'gifts' then 'products' else category::text end::item_category);
   drop type item_category_old;
   ```
   (Postgres can't drop a single enum value; the rename+recreate+`USING` cast is required. `category` is nullable with no default, so no default to drop.)
2. **`classify/index.ts`:** change the return type to `category: ItemCategory | null`. The final fallback must return `{ category: null, category_confidence: 0.3, category_source: "heuristic" }` instead of `articles @ 0.4`. Keep `articles` only when schema.org/path/hint actually indicate an article.
3. **`enrich-item.ts`:** `classification.category` may now be `null`. The `items.category` column is already nullable, so write it through. Status logic already routes `< 0.6` confidence → `inbox`; a `null` category will simply live in Inbox/All until triaged — correct behavior. Verify `buildSubtitle`/`defaultCardAspect`/`mergeDisplay` handle `null` (guard with a default aspect of `16/9`).
4. **Remove `gifts` from app surfaces:** `CATEGORY_LABELS` (`item-labels.ts`), `GRADIENTS` (`category-placeholder.ts`), `EXTENSION_CATEGORY_HINTS` (already absent — leave), and the `shop` shelf filter in `shelves.ts` (`category: ["products", "gifts"]` → `category: "products"`).
5. **Gift intent → collections:** no code needed; document in `docs/product-brief.md` that "gifts" is a collection pattern, not a category. Optionally seed a default "Gifts" collection on signup (out of scope unless trivial).
6. Regenerate `database.types.ts`. Update `formatCategory(null)` already returns "Uncategorized" — good.

### A2 — Fix classification precedence
1. Split `domain-map.ts` into **authoritative** vs **ambiguous** domains:
   - Authoritative (keep 0.95, checked before schema.org): `imdb.com`, `themoviedb.org`, `letterboxd.com`, `goodreads.com`, `storytel.com`, `etsy.com`, `airbnb.com`, `booking.com`.
   - Ambiguous (NEW lower confidence ~0.55, checked **after** schema.org): `amazon.*` (could be products/books/media), `yelp.com`, `tripadvisor.com`.
   - **Remove `google.com → restaurants` entirely** — plain Google URLs are search; Google Maps place URLs need a dedicated heuristic (path `/maps/place/`) if added later.
   - **`youtube.com`/`youtu.be`:** in A1/A2 leave mapped to `movies_and_tv` only as a weak (0.55) ambiguous hint; A3 introduces `videos` and makes YouTube default there unless schema/oEmbed says otherwise.
2. Reorder `classify()`: authoritative-domain → schema.org → ambiguous-domain → capture hint → path heuristic → `null`.
3. Update `classify` tests for the new precedence and the `null` default.

### A3 — Additive new categories (in scope — ship in first pass)
Add `music` (label "Music & Audio", shelf **Listen**, covers albums/songs/podcasts), `videos` (label "Videos", folded into the **Watch** shelf alongside `movies_and_tv`), and `apps` (label "Apps & Tools", shelf **Tools**; GitHub, Product Hunt, software).
1. Migration: `alter type item_category add value 'music'; … 'videos'; … 'apps';` (additive `ADD VALUE` is simple; run outside an explicit txn block per Supabase).
2. Extend `SHELVES` (`shelves.ts`): `Watch` filter → `category: ["movies_and_tv","videos"]`; add `listen` and `tools` shelves. Keep code-defined (no DB).
3. Extend `CATEGORY_LABELS`, `GRADIENTS`, `EXTENSION_CATEGORY_HINTS`, `defaultCardAspect`, and category schema display (`StructuredFields.tsx` + `docs/category-schemas.md`).
4. Domain map: `spotify.com/music.apple.com/bandcamp.com → music`; podcast hosts → `music`; `github.com/producthunt.com → apps`; `youtube.com → videos`.
5. Add structured-field schemas + a parser if needed (e.g. oEmbed/JSON-LD for YouTube) following the parser convention.

**Tests (A):** update `classify` unit tests, `extract.test.ts` fixtures, `StructuredFields.test.tsx`. `npm test` green.
**Acceptance:** no `gifts` anywhere in app code; unknown URLs land in Inbox with `null` category (not "Read"); a page with valid schema.org Recipe on an ambiguous domain classifies as `recipes`; YouTube no longer forced to `movies_and_tv` (A3).

---

## Workstream B — Multi-tenant hardening

**Problem.** Open signup + zero rate limiting + zero quotas + a server-side fetcher that hits arbitrary user URLs + a global enrichment queue with no per-user fairness = cost blowups, abuse, and one user starving others.

### B1 — Rate limiting
1. Add a durable limiter (serverless-safe — in-memory won't work across Vercel instances). Recommend `@upstash/ratelimit` + `@upstash/redis` with env `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`. Provide `src/lib/rate-limit.ts`:
   ```ts
   // sliding window; no-op fallback when env unset (dev/local)
   export async function rateLimit(key: string, limit: number, windowSec: number): Promise<{ ok: boolean; retryAfter?: number }>
   ```
2. Apply at the top of these handlers, keyed by `userId` (or token id, or IP for unauth), returning `429` with `Retry-After`:
   - `POST /api/capture` (per user + per token)
   - `POST /api/items/[id]/retry-enrichment`
   - `POST /api/items/[id]/ai-enrichment-proposal` and `…/ai-enrichment-apply`
   - `POST /api/capture-tokens`
   - `POST /api/collections`
   - `POST /api/recommend` (Workstream F)
   - Optionally `GET /api/items` (search) per IP.
3. OTP send is rate-limited by Supabase already; document and leave unless abuse is observed.

### B2 — Per-user resource quotas
1. Add `src/lib/quotas.ts` with constants (e.g. `MAX_ITEMS_PER_USER = 10000`, `MAX_COLLECTIONS = 500`, `MAX_TAGS = 2000`, `MAX_CAPTURE_TOKENS = 20`).
2. Enforce before insert in `api/capture`, `api/collections`, `api/capture-tokens`, and tag creation paths (count via `head: true` count query scoped by RLS). Return `409 { code: "quota_exceeded" }`.
3. Optional defense-in-depth: a `before insert` trigger or partial constraint, but app-level is sufficient first.

### B3 — Per-user enrichment fairness + cadence
1. Rewrite `claim_pending_enrichment_items` (new migration) to cap rows **per user per run** so one user can't monopolize a batch:
   ```sql
   create or replace function public.claim_pending_enrichment_items(batch_size int default 10, per_user_cap int default 3)
   returns setof uuid language plpgsql security definer set search_path = public as $$
   begin
     return query
     with candidates as (
       select id from (
         select id, row_number() over (partition by user_id order by created_at asc) rn
         from public.items where processing_status = 'pending'
       ) s where rn <= per_user_cap order by id limit batch_size
     ),
     locked as (
       select i.id from public.items i join candidates c on c.id = i.id
       where i.processing_status = 'pending' for update skip locked
     )
     update public.items i set processing_status = 'processing'
     from locked l where i.id = l.id returning i.id;
   end; $$;
   ```
   (Window functions can't combine with `FOR UPDATE` directly — hence the candidate-then-lock split.) Keep the `revoke/grant to service_role` lines.
2. Increase cron frequency in `vercel.json` from `0 0 * * *` (daily) — the daily run is only a retry catch-up since capture already enriches inline via `after()`. Set to e.g. `*/10 * * * *` (mind Vercel plan cron limits) and raise `batch_size`.
3. Pass `per_user_cap` from `api/jobs/enrich/route.ts`.

### B4 — SSRF re-audit (now public-facing)
`src/lib/enrichment/fetch.ts` is already solid (scheme/host/IP blocks, manual redirects with per-hop `assertSafeFetchUrl`, 2 MB cap, 8 s timeout). Tighten the known gaps:
1. **DNS rebinding (TOCTOU):** `assertSafeFetchUrl` resolves the host, then `fetch()` resolves *again* independently — a rebinding window. Pin the validated IP: resolve once, then `fetch` the IP with a `Host` header (or use an `undici` Agent with a custom `lookup` that re-checks). Document the chosen approach.
2. Reject URLs with embedded credentials (`url.username`/`url.password`).
3. Block additional IPv6 forms the audit flagged (e.g. `::ffff:0:` mapped ranges, more `fe80` zones) — extend `isBlockedIpv6`.
4. **Export the guard** so Workstream C's image fetch reuses the exact same `assertSafeFetchUrl` rather than a parallel implementation.
5. Add unit tests for rebinding-style cases and credentialed URLs.

### B5 — Signup posture (DECIDED: keep open)
Signup stays **open** — anyone can create an account. This makes B1 (rate limiting) and B2 (per-user quotas) load-bearing, not optional: they are the only containment for cost/abuse. Do **not** add `shouldCreateUser: false` or an allowlist. Confirm B1 covers the OTP send path indirectly (Supabase rate-limits OTP itself) and that capture/enrichment/AI endpoints are all rate-limited + quota-checked before this workstream is considered done.

**Acceptance (B):** exceeding a limit returns `429`/`409` deterministically; a single user's flood of pending items no longer blocks other users in a cron batch; fetcher rejects rebinding + credentialed + internal targets (tests prove it).

---

## Workstream C — Image durability (cache covers to Storage)

**Problem.** Cards render the remote `image_url` directly via `<img>` (`ItemCard.tsx:97`, `ItemDetail.tsx:214`). `items.image_storage_path` and the `item-images` Storage bucket exist but are **never populated** → guaranteed link rot, hotlink blocking, and layout shift. This silently degrades the core "visual library" promise.

### Steps
1. **`src/lib/enrichment/image-cache.ts`:** given `(userId, itemId, imageUrl)`, fetch the image **through the SSRF guard from B4**, enforce `content-type: image/*` and a size cap (~5 MB), and upload to `item-images` at `{user_id}/{item_id}/cover.{ext}` (path matches `data-model.md`). Return the storage path. On any failure, return `null` (remote URL remains the fallback — fail gracefully).
2. **`enrich-item.ts`:** after `mergedImageUrl` is resolved and before the final `update`, if there's an image URL and no `image_storage_path`, call the cache helper and write `image_storage_path`. Re-run on "Refresh metadata" retries.
3. **Display:** add `getDisplayImageUrl(row)` in `src/lib/item-display.ts` preferring the cached cover. Bucket is private per `data-model.md`, so generate a **signed URL** server-side (in the items list loader `loadTagsAndCollections`/`mapSummary` path and the item detail loader) — do not expose the service role. Alternative: a dedicated public-read bucket with unguessable paths; pick one and document it.
4. **Card components:** consume `getDisplayImageUrl`; keep `safeRemoteImageUrl` as the fallback when no cached cover.
5. **Backfill script** `scripts/backfill-image-cache.ts` (mirror `scripts/seed.ts` patterns) to cache covers for existing items.

**Acceptance:** new items get `image_storage_path` populated; deleting/blocking the origin image still shows the card cover; signed URLs (or public bucket) render without exposing service-role keys.

---

## Workstream D — Enrichment reliability & freshness

**Problem.** Item detail uses a client poll loop (`ItemDetail.tsx:120`, 2 s × 45) instead of Realtime, despite the data model promising Realtime updates (and `LibraryItemsSection` already wires Realtime — reuse that pattern). Terminal failures (3 attempts) have no recovery beyond the manual button.

### Steps
1. Replace the poll loop in `ItemDetail.tsx` with a Supabase Realtime subscription on the single `items` row (`id = item.id`), updating local state when `processing_status` flips to `ready`/`failed`. Keep a single delayed `fetchItem` as a fallback if the socket never fires (covers the "Realtime websocket failures" class fixed in commit `1fb2a9d`).
2. Confirm the library uses the same channel/auth pattern; factor a tiny shared hook `src/hooks/useItemRealtime.ts` if it reduces duplication (only if it doesn't fight existing patterns).
3. Enrichment retry/backoff: on transient failure, `enrich-item.ts` already increments `enrichment_attempts` and goes terminal at 3. Add a "reset & retry" affordance (clears `enrichment_attempts`, sets `pending`) on the failed state — the manual retry route can do this. Optional: a daily sweep that resets long-stale `failed` rows for one more attempt.

**Acceptance:** capturing an item shows the card upgrade in place with no visible polling; a failed item can be fully reset and re-enriched.

---

## Workstream E — UX polish & scale

### E1 — Tag management
- New routes: `GET /api/tags` (list with item counts, RLS-scoped), `PATCH /api/tags/[id]` (rename; on unique-name conflict, **merge** by repointing `item_tags` then deleting the source tag), `DELETE /api/tags/[id]`.
- New page `src/app/(app)/tags/page.tsx` + client component: list tags with counts, inline rename, delete with confirm. Add nav entry in `AppShell.tsx` (or nest under Settings to avoid crowding the bottom nav).
- Apply input limits (`input-limits.ts`) and rate limiting (B1).

### E2 — Library pagination / infinite scroll
- `library-items-for-shelf.ts` currently `.limit(48)` with no paging. Switch `LibraryPageClient`/`LibraryItemsSection` to the cursor-based `GET /api/items` (which already supports `cursor`/`next_cursor`) with an IntersectionObserver "load more". Keep the per-shelf cache shape.

### E3 — Full-text search (also closes FINDING-005 filter injection)
- Migration: add a generated `search_vector tsvector` column over title/subtitle/description/note/domain with weights, plus a GIN index:
  ```sql
  alter table items add column search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title,'')),'A') ||
    setweight(to_tsvector('simple', coalesce(subtitle,'')),'B') ||
    setweight(to_tsvector('simple', coalesce(description,'')),'C') ||
    setweight(to_tsvector('simple', coalesce(note,'')),'C') ||
    setweight(to_tsvector('simple', coalesce(domain,'')),'D')
  ) stored;
  create index items_search_vector_idx on items using gin (search_vector);
  ```
- In `api/items/route.ts`, replace the `.or("…ilike…")` block with `query.textSearch('search_vector', q, { type: 'websearch' })`. This removes the comma-into-`.or()` injection vector entirely. Keep `MAX_SEARCH_QUERY_LENGTH`.

### E4 — Library insights
- A compact insights strip on `/library` (or `/insights`): total items, per-shelf counts (reuse `itemMatchesShelf`/count queries), recently added, and inbox backlog. Keep it read-only and cheap (count queries with `head: true`). Avoid adding `last_opened_at` unless trivial (it's new write-path tracking — out of scope otherwise).

### E5 — Accessibility
- Shelf tablist (`LibraryPageClient.tsx:141`) is `role="tablist"` of buttons without keyboard semantics. Add roving `tabIndex` and Left/Right/Home/End arrow handling per WAI-ARIA tabs. Ensure focus ring visibility (rings are clipped by `overflow:hidden` — the code already notes this; verify).

**Acceptance:** tags can be renamed/merged/deleted; library scrolls past 48 items; search uses ranked FTS and a comma in the query can't inject filters; shelf tabs are keyboard-navigable.

---

## Workstream F — AI recommendations (build the spec)

**Problem.** `docs/superpowers/specs/2026-05-17-ai-recommendations-design.md` is a complete design, but there is no `src/app/api/recommend/` or `src/components/recommend/`.

### Steps
- Implement exactly per the spec's File Structure: `app/api/recommend/route.ts` (streaming NDJSON), `lib/recommend/{recommend-prompt,recommend-stream,recommend-types,recommend-config}.ts` + tests, `components/recommend/{RecommendButton,RecommendDrawer,RecommendationCard,useRecommendations}.tsx`.
- Gate behind `GEMINI_API_KEY` via `isRecommendEnabled()` (mirror the enrichment gate); books + watch shelves only; min 3 items.
- **Add B1 rate limiting** to `/api/recommend` (the spec's in-memory limiter is insufficient for multi-instance Vercel — reuse `src/lib/rate-limit.ts`).
- "Save" routes through the existing `/api/capture` → enrichment pipeline.
- Wire `RecommendButton` into the shelf header in `library/page.tsx` / `LibraryPageClient.tsx`.
- Tests per the spec's Testing Strategy (prompt builder, config, NDJSON parsing, hook state machine) with mocked Gemini.

**Acceptance:** on Books/Watch with ≥3 items, clicking Recommend streams cards into a drawer; Save adds to library; feature is hidden when the key is absent; rate-limited.

---

## Workstream G — Housekeeping

### G1 — Dependency vulnerabilities
- 3 moderate (postcss `<8.5.10` via Next). Bump Next to a patched 16.x and `npm audit` to confirm. Re-run `npm test` + `npm run build`. Verify the deploy via the Vercel connector.

### G2 — PWA share target (mobile capture beyond iOS Shortcut)
- Add a web app manifest with a `share_target` POST/GET to a `/add` (or `/api/capture`-backed) route, enabling Android/installed-PWA share-sheet capture. The `mobile_share_extension` `item_source` enum value already exists — use it for these captures. iOS Shortcut remains as-is.

### G3 — Error hygiene spot-check
- Confirm no API route still returns raw `error.message` to clients (FINDING-010 was largely resolved; verify any new routes added in E/F follow the log-server-side / generic-code pattern).

**Acceptance:** `npm audit` shows no moderate+ from postcss; sharing a URL from a phone share sheet creates an item; no new route leaks raw DB errors.

---

## Workstream H — Chrome extension

**Verdict: no structural refactor needed.** The extension is ~250 lines of clean, framework-free MV3 (`extension/popup.ts`, `extension/background.ts`, `popup.html`, `styles.css`), the connect handshake is origin-validated (`background.ts:isValidConnectMessage`), and it has tests (`popup.test.ts`, `background.test.ts`). Do **targeted fixes**, not a rewrite.

### H1 — Base-URL / domain correctness (likely live production bug — fix first)
1. **The popup ignores the stored base URL.** `loadSettings()` in `popup.ts:25-34` reads `theque_api_base_url` from storage but then returns the hardcoded constant `THEQUE_APP_URL = "https://theque.app"` regardless. So **every capture POSTs to `https://theque.app/api/capture`**, even though `background.ts` stores the connected origin. If `theque.app` is not a live custom domain on the production deployment, **capture is broken in production for all users.**
   - **Resolve via the Vercel connector** whether `theque.app` serves production (see "Open question" above).
   - If `theque.app` is live: keep it, but **honor the stored `baseUrl`** so the value `background.ts` persists is actually used (and localhost dev capture becomes possible). If it is *not* live: point the constant + manifest at the real origin (`theque.vercel.app`) until the custom domain is configured.
2. **`manifest.json` `externally_connectable.matches` + `host_permissions`** list only `https://theque.app/*` (FINDING-015). The web→extension connect (`chrome.runtime.sendMessage` from `/settings/extension-connect`) only fires when the page origin matches. Add whatever production origin(s) users actually connect from (e.g. add `https://theque.vercel.app/*`), keeping `theque.app` for the custom domain. Confirm `isValidConnectMessage`'s sender-origin check still passes for the added origin(s).
3. Rebuild with `npm run build:extension`; update `popup.test.ts`/`background.test.ts` for any base-URL behavior change.

### H2 — Align shelf-hint dropdown with the new taxonomy (after Workstream A)
- `popup.html:24-33` hardcodes shelf-hint `<option>`s. The capture API rejects unknown hints (`invalid_category_hint`), and the allowed set is `EXTENSION_CATEGORY_HINTS` (`src/lib/capture/category-hint.ts`). After Workstream A: add the new categories (`music`/`videos`/`apps`) to `EXTENSION_CATEGORY_HINTS` **and** to the dropdown, remove anything dropped, and relabel to match the final shelf names. Prefer generating the options from a single shared source of truth to prevent future drift (the extension builds via `tsc`, so a shared constant module imported at build time is viable).

### H3 — Version bump + resubmission hygiene
- Bump `manifest.json` `version` from `0.1.0` for any store update (Chrome requires a higher version per upload). Re-test load-unpacked from `extension/` per `docs/chrome-extension.md`, then this feeds Workstream I (store resubmission).

### H4 — Optional UX polish (low priority, only if cheap)
- Show the title/URL of the tab being saved; auto-close the popup on success after a short delay; allow Enter-to-save. Skip if it complicates the (currently simple) code.

**Acceptance:** capture works against the verified production origin; the connect handshake succeeds from that origin; shelf-hint options match `EXTENSION_CATEGORY_HINTS`; `npm run build:extension` + extension tests pass; version bumped.

---

## Workstream I — Chrome Web Store listing (description + screenshots)

Published listing: https://chromewebstore.google.com/detail/th%C3%A8que/blahodpkabcnliljldelkoggeemfgdak . **Note:** the user (store owner) must perform the actual Web Store dashboard upload/publish and review submission — the executor prepares the assets and copy, not the upload.

### I1 — Rewrite the store description
- Current product reality: a **visual taste library** with shelves (Books, Watch, Listen, Tools, Eat, Shop, Travel, Read, Cook), one-click capture, automatic enrichment into rich cards, and (after F) AI recommendations. Draft new copy and save it to `docs/chrome-store/listing.md`:
  - **Short description** (≤132 chars, Web Store limit) — one crisp sentence.
  - **Detailed description** — what it does, the capture→enrich→shelves flow, privacy note (private library; capture token auth), and a short feature list.
  - Keep voice consistent with `docs/product-brief.md`. Reflect the **final** taxonomy from Workstream A — do not mention `gifts` as a category.

### I2 — Regenerate screenshots
- **Important:** the existing `scripts/generate-extension-store-screenshots.mjs` does **not** screenshot the real app — it renders hand-coded **synthetic HTML mockups** of a fake browser, and they use the **old taxonomy** ("Read/Watch/Shop/Eat/Cook", "gift idea", `theque.app` address bar). The outputs in `docs/chrome-store/*.png` are therefore stale on two axes.
- Choose one approach (recommend the first for authenticity):
  1. **Real screenshots of the deployed app** (preferred). Use Playwright against a signed-in session: seed data (`npm run seed`, needs `SEED_USER_ID`) and authenticate via the QA session flow (`npm run qa:session-url`, needs `QA_DEV_SESSION_SECRET`/`QA_DEV_EMAIL`). Capture at 1280×800: library grid, item detail, search, collections, and the real extension popup (load the built extension in the Playwright context, or composite the popup over a tab). Write a new script `scripts/capture-store-screenshots.mjs` (or extend the existing one) and output to `docs/chrome-store/`.
  2. **Refresh the synthetic mockups** (fast path). Update `generate-extension-store-screenshots.mjs` to the new taxonomy/shelf names and correct address-bar domain, and add a couple more scenes (item detail, recommendations). Lower fidelity but zero infra.
- Produce the **Chrome Web Store image set**: at least one 1280×800 (or 640×400) screenshot (up to 5), plus the **small promo tile 440×280**; marquee 1400×560 optional. Document the produced files + sizes in `docs/chrome-store/listing.md`.

**Acceptance:** `docs/chrome-store/listing.md` contains finalized short + detailed copy matching the shipped taxonomy; refreshed screenshot assets at correct Web Store dimensions exist in `docs/chrome-store/`, free of stale categories/domains; a clear note tells the owner which assets to upload where.

---

## Cross-cutting: testing & rollout
- Every workstream that touches classify/parsers/auth/search must keep `npm test` green and add/adjust tests.
- DB changes ship as new timestamped files in `supabase/migrations/`; regenerate `database.types.ts` and fix resulting type errors (especially `Record<ItemCategory, …>` maps in `item-labels.ts`, `category-placeholder.ts`, `enrich-item.ts:defaultCardAspect`).
- New env vars → document in `.env.local.example` (`UPSTASH_REDIS_REST_URL/TOKEN`, any `RECOMMEND_*`).
- Manual QA via `docs/qa-checklist.md` and the QA session flow (`npm run qa:session-url`) after A, C, E, F.
- Update `AGENTS.md` / `docs/product-brief.md` where taxonomy, signup posture, or capture sources change.
