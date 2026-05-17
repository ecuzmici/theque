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
| `src/lib/enrichment/` | Fetch HTML, `extract.ts`, parsers (`imdb`, `goodreads`, `generic`) |
| `src/lib/classify/` | Domain + schema.org + hints → `ItemCategory` |
| `src/lib/shelves.ts` | Shelf definitions (All, Books, Watch, … Inbox) |
| `src/components/items/` | `ItemCard`, `ItemDetail`, `StructuredFields` |
| `extension/` | MV3 popup + background; storage keys `theque_capture_token`, `theque_api_base_url` |
| `supabase/migrations/` | Schema + RLS + `claim_pending_enrichment` RPC |
| `docs/` | Product, API, QA checklist, chrome-extension, category schemas |

## Categories & integrations

`ItemCategory` enum: `books`, `movies_and_tv`, `restaurants`, `products`, `gifts`, `travel`, `recipes`, `articles`.

| Category | Shelf tab | Parser / domain hints | Unit fixtures |
|----------|-----------|----------------------|---------------|
| `movies_and_tv` | Watch | `parsers/imdb.ts`, imdb/tmdb/letterboxd domains | `fixtures/imdb-movie.html` |
| `books` | Books | `parsers/goodreads.ts`, goodreads domains | `fixtures/goodreads-book.html` |
| `articles` | Read | `parsers/generic.ts` (OG + JSON-LD) | `fixtures/generic-blog.html` |
| `products` / `gifts` | Shop | generic + amazon/etsy domains | live URLs in QA doc |
| `restaurants` | Eat | generic (often sparse) | Maps/Yelp URLs in QA doc |
| `travel` | Travel | domain map | booking/airbnb URLs |
| `recipes` | Cook | schema.org Recipe via generic | recipe blog URLs |
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

## Working conventions

- Match existing patterns; minimal diffs; no drive-by refactors.
- Run `npm test` before claiming parser/classify changes are done.
- For auth/login changes, update `src/app/login/login-utils.test.ts` when redirect or OTP validation behavior changes.
- Touch UX uses Tailwind custom variants in `src/app/globals.css`: `pointer-coarse`, `lg-fine`, `--tap-target-min`, and `.ks-pointer-coarse-min-hit`. Prefer `<Button />` for controls so coarse-pointer hit targets stay at roughly 44px without making desktop layouts bulky.
- Shelves: change filters in `shelves.ts` + `shelf-filter.ts`, not ad-hoc queries in pages.
- New domain parser: add under `src/lib/enrichment/parsers/`, wire in `extract.ts`, add fixture + test in `extract.test.ts`.
- LLM enrichment is optional and gated by `LLM_ENRICHMENT_ENABLED=true` plus `GEMINI_API_KEY`; deterministic extraction must still work without it.
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
