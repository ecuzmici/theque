# Theque — Agent guide

Personal **visual taste library**: capture URLs (Chrome extension, API, manual add) → enrich into category-aware cards → browse **shelves** (smart views).

## Product constraints (PoC)

- **Multi-user, open registration**, but **no social/sharing features** — each Profile is a private, RLS-isolated library (see `docs/adr/0010-login-code-otp-oauth-open-registration.md` and `docs/adr/0001-personal-taste-loop-no-grouping-no-sharing.md`). "Single-user" survives only as the per-Profile *feeling*, not a cap on accounts.
- **Shelves are code-defined** (`src/lib/shelves.ts`), not DB tables. Collections and tags were removed (unused); the capture API still accepts `collection_ids` / `tag_names` from legacy clients as no-ops.
- **Classification/enrichment**: deterministic domain map + schema.org + heuristics first; optional gated LLM enrichment (AI Gateway) can fill sparse metadata and, when allowed, set `category_source = llm`.
- **Web auth**: a hybrid login — **GitHub** / **Google** OAuth plus an **email code** (OTP) fallback. There is **no magic link** (see ADR 0010). Bot sign-ups are held off by Cloudflare Turnstile on the email-code request. **Capture auth**: `Bearer bmly_…` tokens for extension/Shortcut.
- **iOS Shortcut** is documented but lower priority than Chrome + web QA.

## Environments

| Environment | App URL | Supabase project |
|-------------|---------|------------------|
| Production | https://theque.vercel.app | `jucaqjkgyhyzixzaisjr` (dashboard name: **theque**) |
| Local | http://localhost:3000 | Same project; keys in `.env.local` |

Public thèque URL (users, redirects, Chrome extension default): **`https://theque.app`**. Vercel production deployment hostname (shown above): **`https://theque.vercel.app`** — keep both straight when pairing extension/docs with infra.

GitHub: https://github.com/ecuzmici/theque  
Vercel project: **theque** (linked to repo `master`).

Required env vars: see `.env.local.example`. Never commit `.env.local`. AI Gateway and Gemini env vars are optional and server-only.

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
| `src/app/login` + `src/app/auth/callback` | Hybrid login (GitHub/Google OAuth + email code); `/auth/callback` is the OAuth code-exchange route |
| `src/proxy.ts` | Session-aware route guards and auth redirects (Next 16 proxy, formerly `middleware.ts`) |
| `src/app/api/capture` | Token-authenticated URL capture |
| `src/app/api/jobs/enrich` | Cron/manual enrichment (needs `CRON_SECRET`) |
| `src/app/api/jobs/digest` | Manual "saved and forgot" digest for one account (needs `CRON_SECRET` and `DIGEST_USER_ID`; no cron runs it; sends via Resend when configured) |
| `src/lib/enrichment/` | Fetch HTML, `extract.ts`, parsers (`imdb`, `goodreads`, `generic`) |
| `src/lib/classify/` | Domain + schema.org + hints → `ItemCategory` |
| `src/lib/shelves.ts` | Shelf definitions (All, Books, Watch, Articles, Other, Inbox) |
| `src/components/items/` | `ItemCard`, `ItemDetail`, `StructuredFields` |
| `extension/` | MV3 popup + background; storage keys `theque_capture_token`, `theque_api_base_url` |
| `supabase/migrations/` | Schema + RLS + `claim_pending_enrichment` RPC |
| `docs/` | Product, API, QA checklist, chrome-extension, category schemas |

## Categories & integrations

`ItemCategory` enum (seven categories): `books`, `movies_and_tv`, `restaurants`, `products`, `travel`, `recipes`, `articles`. `music`, `apps`, and `videos` were retired (see `docs/adr/0004-fewer-shelves-retired-categories.md`); their URLs re-home to a survivor (video → `movies_and_tv`, music → `articles`, apps → `products`).

The steady-state shelf strip is **All · Books · Watch · Articles** (the Done shelf was removed; consumed items stay on their category shelf behind a **Hide done** toggle). The long-tail categories (`restaurants`, `products`, `travel`, `recipes`) share one grouped **Other** shelf; **Other** and **Inbox** are shown only when non-empty.

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

- **Web**: `/login` is a hybrid screen. **OAuth** (`signInWithOAuth({ provider })` for `github`/`google`) redirects to the provider and back to `/auth/callback`, which calls `exchangeCodeForSession` and sets cookies on the redirect. **Email code** is the fallback: `signInWithOtp` sends the code (no `emailRedirectTo`, so no clickable link); `verifyOtp({ type: "email" })` signs in with the copied code, verified client-side. `src/app/login/login-utils.ts` normalizes 6-10 digit tokens and keeps `next` redirects local. The email-code send is gated by Turnstile when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set; OAuth is not captcha-gated.
- **Identity linking** is automatic by verified email, so GitHub / Google / email-code for one person resolve to one Profile (`supabase/templates/magic_link.html` is the code-only email). There is no magic link and no `/auth/confirm` interstitial — both were removed in ADR 0010.
- **Proxy**: `src/proxy.ts` protects `/library`, `/stats`, `/settings`, `/item`, `/search`, and `/add`; guest redirects include `?next=...`, and signed-in users are redirected from `/` or `/login` to the library while preserving refreshed Supabase cookies.
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
- LLM enrichment is optional and gated by `LLM_ENRICHMENT_ENABLED=true` plus AI Gateway auth (`AI_GATEWAY_API_KEY` locally, OIDC on Vercel); deterministic extraction must still work without it. Models and reasoning settings live in `src/lib/enrichment/llm/llm-config.ts` (ADR 0017). The `gemini-*` file names are historical; only grounded search still calls Gemini (`GEMINI_API_KEY`).
- Background LLM enrichment has a daily cap per user (`ENRICH_LLM_DAILY_LIMIT`, default 100); past the cap it keeps the deterministic result and sets `raw_metadata.llm_skipped = "daily_cap"`. "Enrich with AI" proposals cap at `AI_PROPOSAL_DAILY_LIMIT` (default 30). `AI_LIMIT_ELEVATED_USER_IDS` raises both.
- Book files (the "Kobo file" block, `POST|DELETE /api/items/:id/file`) are limited to the user ids in `BOOK_FILE_USER_IDS` (`src/lib/book-file-access.ts`; code default when unset). Item and account deletion also delete the Drive file.
- `note` and `verdict` are ciphertext in the database and in Realtime payloads (ADR 0013). Decrypt with `decryptItemFields` at every boundary, and refetch `GET /api/items/:id` on a Realtime event instead of merging the payload.
- Free category resolvers live in `src/lib/enrichment/resolvers/` (TMDB, Google Books, iTunes, YouTube oEmbed, GitHub); they run after classify when important fields are sparse and rank above LLM output. Add a new source by adding a `CategoryResolver` and registering it in `resolvers/index.ts`.
- Blocked/sparse, snapshot-less pages can fall back to Jina Reader (`JINA_READER_ENABLED`) and Gemini Google Search grounding (`LLM_GROUNDING_ENABLED`); both opt-in, default off, fail-open. Grounding is skipped when the URL already contains a canonical entity id (`src/lib/enrichment/url-identity.ts`).
- `npm run lint` ignores `.claude/**` (agent worktrees) and the compiled extension `.js` files. CI (`.github/workflows/ci.yml`) runs Vitest, `tsc` for the app and for `extension/tsconfig.test.json`, lint, and the extension build on each push. Vercel runs `next build`.
- Do not commit secrets, `.env.local`, or `.vercel/`.

## Documentation index

- `docs/product-brief.md` — vision and PoC scope  
- `docs/data-model.md` — tables and RLS  
- `docs/api-contract.md` — REST shapes  
- `docs/qa-checklist.md` — URL matrix and pass criteria  
- `docs/ui-shelves.md` — shelf tabs and card grid  
- `docs/chrome-extension.md` — MV3 setup  
- `docs/possible-features.md` — undetailed brainstormed ideas, append-only (`/note-idea`)  

## QA handoff

For integration QA: **new chat** + Playwright MCP + paste **`docs/sessions/qa-integration-prompt.md`**.  
Local auth: `QA_DEV_SESSION_SECRET` + `QA_DEV_EMAIL` in `.env.local`, then `npm run qa:session-url` (no email sent).

Report failures with URL, client (web/extension/API), shelf, screenshot, and item id if any.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
