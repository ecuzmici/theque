# Keepswell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a personal PoC where you can capture URLs from Chrome and iOS Shortcut, see them as visual cards in a Next.js PWA, and triage them via inbox and collections.

**Architecture:** Next.js App Router on Vercel; Supabase for auth, Postgres (RLS), Storage, Realtime; sync capture API + async enrichment cron; fixed shelf smart views (Option A).

**Tech Stack:** Next.js 15+, TypeScript, Tailwind CSS, `@supabase/ssr`, `@supabase/supabase-js`, Vitest, Chrome MV3, Supabase CLI + MCP.

**Prerequisites:** Read `docs/product-brief.md`, `docs/data-model.md`, `docs/api-contract.md`, `docs/ui-shelves.md`, `docs/superpowers/specs/2026-05-15-keepswell-design.md`.

---

## Agent tracks (parallelization)

| Track | Agent focus | Depends on |
|-------|-------------|------------|
| **0** | Docs (done) | — |
| **A** | Scaffold + Supabase schema | 0 |
| **B** | Capture + enrichment | A |
| **C** | Library UI + inbox | A, B (mock B early) |
| **D** | Chrome extension | B, API contract |
| **E** | iOS Shortcut docs + tokens UI + PWA | A, B |
| **F** | Integration QA | All |

---

## Phase 1 — Project scaffold (Track A)

### Task 1: Initialize Next.js app

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `src/app/layout.tsx`, `src/app/globals.css`

- [ ] **Step 1:** Run `npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack` in repo root (empty except `docs/`)

- [ ] **Step 2:** Verify `npm run dev` starts on port 3000

- [ ] **Step 3:** Add `.env.local.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
```

- [ ] **Step 4:** Add `.gitignore` entries for `.env.local`

---

### Task 2: Supabase local + client helpers

**Files:**
- Create: `supabase/config.toml`, `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`

- [ ] **Step 1:** Run `npx supabase init`

- [ ] **Step 2:** Implement browser client (`createBrowserClient` from `@supabase/ssr`)

- [ ] **Step 3:** Implement server client with cookies

- [ ] **Step 4:** Implement admin client using service role (server-only import guard)

Reference: Supabase Next.js SSR guide (verify via MCP `search_docs`).

---

### Task 3: Database migration — enums and tables

**Files:**
- Create: `supabase/migrations/<timestamp>_initial_schema.sql`

- [ ] **Step 1:** Run `supabase migration new initial_schema`

- [ ] **Step 2:** Add SQL from `docs/data-model.md` (enums, tables, indexes, `moddatetime` trigger)

- [ ] **Step 3:** Apply locally: `supabase db reset` or `supabase migration up`

- [ ] **Step 4:** Run MCP `get_advisors` (security) and fix any RLS gaps

---

### Task 4: RLS policies

**Files:**
- Modify: `supabase/migrations/<timestamp>_initial_schema.sql` (or new migration `rls_policies`)

- [ ] **Step 1:** Enable RLS on `items`, `tags`, `item_tags`, `collections`, `collection_items`, `capture_tokens`

- [ ] **Step 2:** Add policies per `docs/data-model.md` (include SELECT for UPDATE paths)

- [ ] **Step 3:** Verify with SQL: user A cannot read user B rows

---

### Task 5: Auth pages

**Files:**
- Create: `src/app/login/page.tsx`, `src/app/auth/callback/route.ts`, `src/middleware.ts`

- [ ] **Step 1:** Magic link login page

- [ ] **Step 2:** Auth callback route handler

- [ ] **Step 3:** Middleware protecting `/library`, `/settings`, `/item/*`

- [ ] **Step 4:** Manual test: login flow works locally

---

### Task 6: Seed data script

**Files:**
- Create: `scripts/seed.ts`, `package.json` script `"seed": "tsx scripts/seed.ts"`

- [ ] **Step 1:** Insert ~15 items across categories for dev user (use admin client)

- [ ] **Step 2:** Document running seed in comment at top of script

---

## Phase 2 — Capture pipeline (Track B)

### Task 7: URL utilities + tests

**Files:**
- Create: `src/lib/url/normalize.ts`, `src/lib/url/fingerprint.ts`, `src/lib/url/domain.ts`
- Test: `src/lib/url/normalize.test.ts`

- [ ] **Step 1:** Write failing tests for strip UTM params, trailing slash, `youtu.be` resolution stub

- [ ] **Step 2:** Implement `normalizeUrl(raw: string): string`

- [ ] **Step 3:** Implement `fingerprint(canonical: string): string` (SHA-256 hex)

- [ ] **Step 4:** Run `npm test` — pass

---

### Task 8: Metadata extraction

**Files:**
- Create: `src/lib/enrichment/fetch.ts`, `src/lib/enrichment/extract.ts`, `src/lib/enrichment/parsers/generic.ts`, `src/lib/enrichment/parsers/imdb.ts`, `src/lib/enrichment/parsers/goodreads.ts`
- Test: `src/lib/enrichment/extract.test.ts` with fixtures in `src/lib/enrichment/fixtures/`

- [ ] **Step 1:** Add HTML fixtures (saved snippets) for IMDb, Goodreads, generic blog

- [ ] **Step 2:** Test OG + JSON-LD extraction

- [ ] **Step 3:** Implement `fetchPage(url)` with 8s timeout and browser-like User-Agent

- [ ] **Step 4:** Implement domain parsers returning `structured` fragments

---

### Task 9: Classifier

**Files:**
- Create: `src/lib/classify/domain-map.ts`, `src/lib/classify/index.ts`
- Test: `src/lib/classify/index.test.ts`

- [ ] **Step 1:** Tests for imdb → movies_and_tv, goodreads → books, unknown → articles low confidence

- [ ] **Step 2:** Implement classifier per design spec priority order

---

### Task 10: Enrichment job orchestrator

**Files:**
- Create: `src/lib/jobs/enrich-item.ts`

- [ ] **Step 1:** Implement `enrichItem(itemId: string)` using admin client

- [ ] **Step 2:** On success: set `processing_status = ready`, `enriched_at`, populate fields

- [ ] **Step 3:** On failure: increment attempts, set `failed` after 3

- [ ] **Step 4:** Apply status rule: confidence >= 0.6 → `want`, else `inbox`

---

### Task 11: POST /api/capture

**Files:**
- Create: `src/lib/auth/capture-token.ts`, `src/app/api/capture/route.ts`, `src/lib/types/api.ts`

- [ ] **Step 1:** Token validation (hash compare against `capture_tokens`)

- [ ] **Step 2:** Session auth fallback for web manual capture

- [ ] **Step 3:** Insert item with `processing_status = pending`, dedupe by fingerprint

- [ ] **Step 4:** Fire-and-forget `enrichItem` (or queue — do not await in response)

- [ ] **Step 5:** Integration test with `curl` + test token

---

### Task 12: Cron enrichment endpoint

**Files:**
- Create: `src/app/api/jobs/enrich/route.ts`, `vercel.json` cron config

- [ ] **Step 1:** Verify `CRON_SECRET` header

- [ ] **Step 2:** Claim up to 10 pending items (`processing` with row lock pattern or `FOR UPDATE SKIP LOCKED` via RPC)

- [ ] **Step 3:** Configure Vercel cron every minute (or document manual trigger for local dev)

---

### Task 13: Items API

**Files:**
- Create: `src/app/api/items/route.ts`, `src/app/api/items/[id]/route.ts`, `src/app/api/items/[id]/retry-enrichment/route.ts`

- [ ] **Step 1:** GET list with filters from contract

- [ ] **Step 2:** GET/PATCH/DELETE by id

- [ ] **Step 3:** POST retry-enrichment

---

### Task 14: Collections + capture tokens API

**Files:**
- Create: `src/app/api/collections/route.ts`, `src/app/api/collections/[id]/route.ts`, `src/app/api/capture-tokens/route.ts`, `src/app/api/capture-tokens/[id]/route.ts`

- [ ] **Step 1:** CRUD collections

- [ ] **Step 2:** Create token (return plaintext once), revoke token

---

## Phase 3 — Library UI (Track C)

### Task 15: Design tokens + layout

**Files:**
- Create: `src/lib/shelves.ts`, `src/components/layout/AppShell.tsx`, `src/app/(app)/layout.tsx`

- [ ] **Step 1:** Implement `SHELVES` from `docs/ui-shelves.md`

- [ ] **Step 2:** App shell with bottom nav (mobile) / side nav (desktop)

- [ ] **Step 3:** CSS variables for warm library theme (light + dark)

---

### Task 16: ItemCard + grid

**Files:**
- Create: `src/components/items/ItemCard.tsx`, `src/components/items/ItemGrid.tsx`, `src/components/items/ItemCardSkeleton.tsx`

- [ ] **Step 1:** Card with image, title, subtitle, processing shimmer

- [ ] **Step 2:** Respect `display.card_aspect` defaults by category

- [ ] **Step 3:** Use `next/image` with remote patterns in `next.config.ts`

---

### Task 17: Library page with shelf tabs

**Files:**
- Create: `src/app/(app)/library/page.tsx`, `src/hooks/useItems.ts`

- [ ] **Step 1:** Shelf tabs filter query params

- [ ] **Step 2:** Fetch items from API or Supabase client (pick one pattern; server components preferred for initial load)

- [ ] **Step 3:** Inbox badge count on tab

---

### Task 18: Realtime enrichment updates

**Files:**
- Create: `src/hooks/useItemRealtime.ts`

- [ ] **Step 1:** Subscribe to `items` updates for current user

- [ ] **Step 2:** Merge `ready` state into grid without full reload

---

### Task 19: Item detail page

**Files:**
- Create: `src/app/(app)/item/[id]/page.tsx`, `src/components/items/ItemDetail.tsx`, `src/components/items/StructuredFields.tsx`

- [ ] **Step 1:** Hero, metadata grid per category schema

- [ ] **Step 2:** Edit note, status, category, tags, collections

- [ ] **Step 3:** Open original link + retry enrichment

---

### Task 20: Inbox actions

**Files:**
- Create: `src/components/inbox/InboxActions.tsx`

- [ ] **Step 1:** Action sheet: want / planned / dismiss / change category

- [ ] **Step 2:** Optimistic UI updates

---

### Task 21: Search + manual add

**Files:**
- Create: `src/app/(app)/search/page.tsx`, `src/app/(app)/add/page.tsx`

- [ ] **Step 1:** Search with debounced `q`

- [ ] **Step 2:** Paste URL form → POST /api/capture with session auth

---

### Task 22: Settings + token management

**Files:**
- Create: `src/app/(app)/settings/page.tsx`, `src/components/settings/CaptureTokens.tsx`

- [ ] **Step 1:** List tokens (prefix only)

- [ ] **Step 2:** Create + copy token UI

- [ ] **Step 3:** Revoke token

---

## Phase 4 — Chrome extension (Track D)

### Task 23: Extension scaffold

**Files:**
- Create: `extension/manifest.json`, `extension/popup.html`, `extension/popup.ts`, `extension/background.ts`, `extension/styles.css`

- [ ] **Step 1:** MV3 manifest with `activeTab`, host permission for app API domain

- [ ] **Step 2:** Popup: save current tab URL, optional note field

- [ ] **Step 3:** Settings: paste capture token (chrome.storage.local)

- [ ] **Step 4:** POST to `/api/capture` with `source: chrome_extension`

- [ ] **Step 5:** Document load-unpacked steps in `docs/chrome-extension.md`

---

## Phase 5 — Mobile capture + PWA (Track E)

### Task 24: iOS Shortcut documentation

**Files:**
- Create: `docs/ios-shortcut.md`

- [ ] **Step 1:** Step-by-step: Share → Shortcut → Get URLs → POST JSON with Bearer token

- [ ] **Step 2:** Example JSON body matching API contract

- [ ] **Step 3:** Troubleshooting (401, duplicate, failed enrichment)

---

### Task 25: PWA manifest

**Files:**
- Create: `public/manifest.json`, `public/icons/*`, modify `src/app/layout.tsx`

- [ ] **Step 1:** Web app manifest with name, icons, theme colors

- [ ] **Step 2:** Apple meta tags for home screen

- [ ] **Step 3:** Verify install prompt on iOS Safari (Add to Home Screen)

---

## Phase 6 — Integration QA (Track F)

### Task 26: QA matrix

**Files:**
- Create: `docs/qa-checklist.md`

- [ ] **Step 1:** Test URLs: IMDb film, Goodreads book, NYT article, Amazon product, Google Maps restaurant, recipe blog

- [ ] **Step 2:** Each URL via extension + Shortcut (or curl with token)

- [ ] **Step 3:** Verify dedupe (capture same URL twice)

- [ ] **Step 4:** Verify inbox routing for low-confidence URL

- [ ] **Step 5:** Verify collection assign + shelf filtering

- [ ] **Step 6:** File bugs as GitHub issues or fix inline

---

## Environment variables (production)

| Variable | Where |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (secret) |
| `CRON_SECRET` | Vercel (secret) |

## Supabase MCP usage (implementation)

When Supabase plugin is connected:

1. `execute_sql` for ad-hoc policy tests during development
2. `get_advisors` after migrations
3. `search_docs` for `@supabase/ssr` patterns before auth implementation

Do not use `apply_migration` for iterative local schema experiments (per Supabase skill).

## Verification commands

```bash
npm run dev          # App on :3000
npm test             # Vitest unit tests
supabase db reset    # Fresh local DB
curl -X POST http://localhost:3000/api/capture \
  -H "Authorization: Bearer bmly_..." \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.imdb.com/title/tt1375666/","source":"ios_shortcut"}'
```

## Suggested commit milestones

1. `chore: next.js scaffold + supabase clients`
2. `feat(db): initial schema and rls`
3. `feat(api): capture and enrichment pipeline`
4. `feat(ui): library shelves and item detail`
5. `feat(extension): chrome capture popup`
6. `docs: ios shortcut and qa checklist`

---

**Plan complete.** Saved to `docs/superpowers/plans/2026-05-15-keepswell.md`.

**Execution options:**

1. **Subagent-driven (recommended)** — Fresh subagent per task; review between tasks.
2. **Inline execution** — Implement task-by-task in one session with checkpoints.

Which approach do you want to start implementation with?
