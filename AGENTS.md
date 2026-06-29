# Theque — Agent guide

Personal **visual taste library**: capture URLs (Chrome extension, API, manual add) → enrich into category-aware cards → browse **shelves** (smart views) and **collections** (user context).

## Product constraints (PoC)

- **Single user**, private; no multi-tenant or social features.
- **Shelves are code-defined** (`src/lib/shelves.ts`), not DB tables. **Collections** are user-created in Postgres.
- **Classification/enrichment**: deterministic domain map + schema.org + heuristics first; optional gated Gemini enrichment can fill sparse metadata and, when allowed, set `category_source = llm`.
- **Web auth**: email OTP is primary; magic-link callback remains as fallback. **Capture auth**: `Bearer bmly_…` tokens for extension/Shortcut.
- **iOS Shortcut** is documented but lower priority than Chrome + web QA.

## Environments

| Environment | App URL | Supabase project |
|-------------|---------|------------------|
| Production | https://theque.vercel.app | `jucaqjkgyhyzixzaisjr` (dashboard name: **theque**) |
| Local | http://localhost:3000 | Same project; keys in `.env.local` |

Public thèque URL (users, redirects, Chrome extension default): **`https://theque.app`**. Vercel production deployment hostname (shown above): **`https://theque.vercel.app`** — keep both straight when pairing extension/docs with infra.

GitHub: https://github.com/ecuzmici/theque  
Vercel project: **theque** (linked to repo `master`).

Required env vars: see `.env.local.example`. Never commit `.env.local`. Gemini env vars are optional and server-only.

## Commands

```bash
npm install
npm run dev              # Next.js on :3000
npm run build            # extension tsc + next build
npm test                 # Vitest (parsers, classify, auth utils, timestamps, url, LLM helpers)
npm run seed             # optional demo rows (needs SEED_USER_ID)
npm run supabase:sync-auth   # optional; needs SUPABASE_ACCESS_TOKEN
```

Chrome extension: `npm run build` then load unpacked from `extension/` (not repo root). See `docs/chrome-extension.md`.

## Repository map

| Path | Purpose |
|------|---------|
| `src/app/(app)/` | Authenticated UI: library, item detail, add, search, settings |
| `src/app/login` + `src/app/auth/callback` | Email OTP login and magic-link fallback callback |
| `src/middleware.ts` | Session-aware route guards and auth redirects |
| `src/app/api/capture` | Token-authenticated URL capture |
| `src/app/api/jobs/enrich` | Cron/manual enrichment (needs `CRON_SECRET`) |
| `src/app/api/jobs/digest` | Weekly "saved and forgot" digest (needs `CRON_SECRET`; sends via Resend when configured) |
| `src/app/share/[token]` | Public read-only collection page (unguessable `share_token`) |
| `src/lib/enrichment/` | Fetch HTML, `extract.ts`, parsers (`imdb`, `goodreads`, `generic`) |
| `src/lib/classify/` | Domain + schema.org + hints → `ItemCategory` |
| `src/lib/shelves.ts` | Shelf definitions (All, Books, Watch, Articles, Other, Done, Inbox) |
| `src/components/items/` | `ItemCard`, `ItemDetail`, `StructuredFields` |
| `extension/` | MV3 popup + background; storage keys `theque_capture_token`, `theque_api_base_url` |
| `supabase/migrations/` | Schema + RLS + `claim_pending_enrichment` RPC |
| `docs/` | Product, API, QA checklist, chrome-extension, category schemas |

## Categories & integrations

`ItemCategory` enum (seven categories): `books`, `movies_and_tv`, `restaurants`, `products`, `travel`, `recipes`, `articles`. `music`, `apps`, and `videos` were retired (see `docs/adr/0004-fewer-shelves-retired-categories.md`); their URLs re-home to a survivor (video → `movies_and_tv`, music → `articles`, apps → `products`).

The steady-state shelf strip is **All · Books · Watch · Articles · Done**. The long-tail categories (`restaurants`, `products`, `travel`, `recipes`) share one grouped **Other** shelf; **Other** and **Inbox** are shown only when non-empty.

| Category | Shelf tab | Parser / domain hints | Unit fixtures |
|----------|-----------|----------------------|---------------|
| `movies_and_tv` | Watch | `parsers/imdb.ts`, imdb/tmdb/letterboxd domains | `fixtures/imdb-movie.html` |
| `books` | Books | `parsers/goodreads.ts`, goodreads domains | `fixtures/goodreads-book.html` |
| `articles` | Articles | `parsers/generic.ts` (OG + JSON-LD) | `fixtures/generic-blog.html` |
| `products` | Other | generic + amazon/etsy domains | live URLs in QA doc |
| `restaurants` | Other | generic (often sparse) | Maps/Yelp URLs in QA doc |
| `travel` | Other | domain map | booking/airbnb URLs |
| `recipes` | Other | schema.org Recipe via generic | recipe blog URLs |
| (low confidence) | Inbox | `status = inbox` | obscure homepage URLs |

Structured field display: `src/components/items/StructuredFields.tsx` + `docs/category-schemas.md`.

## Auth flows

- **Web**: `/login` is a two-step Supabase email OTP flow. `signInWithOtp` sends the email; `verifyOtp({ type: "email" })` signs in with the copied code. `src/app/login/login-utils.ts` normalizes 6-10 digit tokens and keeps `next` redirects local.
- **Magic-link fallback**: `supabase/templates/magic_link.html` shows `{{ .Token }}` prominently and keeps `{{ .ConfirmationURL }}` as the secondary "Open Theque instead" path. `/auth/callback` exchanges clicked-link codes and sets cookies on the redirect response.
- **Middleware**: `src/middleware.ts` protects `/library`, `/settings`, `/item`, `/search`, and `/add`; guest redirects include `?next=...`, and signed-in users are redirected from `/` or `/login` to the library while preserving refreshed Supabase cookies.
- **Capture API**: `Authorization: Bearer <capture_token>`; create tokens in **Settings → Capture tokens** (shown once).

Supabase redirect URLs must include production and localhost app/callback URLs (see `supabase/config.toml`). Use `npm run supabase:sync-auth` after changing the hosted auth template or redirect allow-list; it reads `SUPABASE_ACCESS_TOKEN` from the environment or `.env.local`.

## MCP servers (local Cursor)

`.cursor/` is **gitignored**. Copy `docs/cursor-mcp.example.json` → `.cursor/mcp.json` for Playwright MCP, then reload Cursor.

- **playwright** — browser automation for E2E QA (`@playwright/mcp`).
- **Supabase** — enable via Cursor Supabase plugin (migrations, SQL, project metadata).

After cloning, run once: `npm run qa:install-browsers`.

## Specialized agents

| Agent | When to use |
|-------|-------------|
| **QA Integration** | Local-first; **no magic-link tests**. Paste `docs/sessions/qa-integration-prompt.md`; auth via `npm run qa:session-url` |
| Code reviewer | After large feature chunks (superpowers plugin) |

## Agent skills

### Issue tracker

Issues live in **GitHub Issues** for `ecuzmici/theque`, via the `gh` CLI. External PRs are **not** a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical five-role vocabulary, names unchanged (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

**Single-context**: one `CONTEXT.md` + `docs/adr/` at the repo root (created lazily by the domain skills). See `docs/agents/domain.md`.

## Working conventions

- Match existing patterns; minimal diffs; no drive-by refactors.
- Run `npm test` before claiming parser/classify changes are done.
- For auth/login changes, update `src/app/login/login-utils.test.ts` when redirect or OTP validation behavior changes.
- Touch UX uses Tailwind custom variants in `src/app/globals.css`: `pointer-coarse`, `lg-fine`, `--tap-target-min`, and `.ks-pointer-coarse-min-hit`. Prefer `<Button />` for controls so coarse-pointer hit targets stay at roughly 44px without making desktop layouts bulky.
- Shelves: change filters in `shelves.ts` + `shelf-filter.ts`, not ad-hoc queries in pages. Forgotten is no longer a tab — it is an age-based (`olderThanDays`) nudge surfaced as an "N forgotten" insights chip plus the weekly digest.
- Taste loop: marking an item done goes through the category-aware verb (`doneVerb`) and stores `rating_personal` / `verdict` / `done_at`; enrichment extracts `dominant_color` / `dominant_hue` (sharp) for palette sort and placeholder tinting.
- Library toolbar: shuffle ("Tonight's pick", `/api/items/random`), sort (recent/color/title via `fetchLibraryItemsForShelf`), wall mode, and Inbox swipe triage are wired in `LibraryPageClient`.
- New domain parser: add under `src/lib/enrichment/parsers/`, wire in `extract.ts`, add fixture + test in `extract.test.ts`.
- LLM enrichment is optional and gated by `LLM_ENRICHMENT_ENABLED=true` plus `GEMINI_API_KEY`; deterministic extraction must still work without it.
- Free category resolvers live in `src/lib/enrichment/resolvers/` (TMDB, Google Books, iTunes, YouTube oEmbed, GitHub); they run after classify when important fields are sparse and rank above LLM output. Add a new source by adding a `CategoryResolver` and registering it in `resolvers/index.ts`.
- Blocked/sparse, snapshot-less pages can fall back to Jina Reader (`JINA_READER_ENABLED`) and Gemini Google Search grounding (`LLM_GROUNDING_ENABLED`); both opt-in, default off, fail-open. Grounding is skipped when the URL already contains a canonical entity id (`src/lib/enrichment/url-identity.ts`).
- Do not commit secrets, `.env.local`, or `.vercel/`.

## Documentation index

- `docs/product-brief.md` — vision and PoC scope  
- `docs/data-model.md` — tables and RLS  
- `docs/api-contract.md` — REST shapes  
- `docs/qa-checklist.md` — URL matrix and pass criteria  
- `docs/ui-shelves.md` — shelf tabs and card grid  
- `docs/chrome-extension.md` — MV3 setup  

## QA handoff

For integration QA: **new chat** + Playwright MCP + paste **`docs/sessions/qa-integration-prompt.md`**.  
Local auth: `QA_DEV_SESSION_SECRET` + `QA_DEV_EMAIL` in `.env.local`, then `npm run qa:session-url` (no email sent).

Report failures with URL, client (web/extension/API), shelf, screenshot, and item id if any.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
