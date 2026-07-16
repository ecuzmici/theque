---
name: verify
description: Runtime-verify a theque change end-to-end — dev server, QA session, API drives, Playwright UI drives, and cleanup rules for the shared Supabase project.
---

# Verifying theque changes at runtime

## Launch

- `/fresh-dev` (project skill) resets :3000 deterministically; the dev server serves the working tree including uncommitted changes.
- Auth handle: `npm run qa:session-url` prints a one-shot login URL (no email). `curl -c jar.txt "<url>"` captures the session cookies; reuse with `-b jar.txt` for API drives.

## Accounts — read before driving anything stateful

- **`QA_DEV_EMAIL` in `.env.local` may point at Emil's real account** (`ecuzmici@gmail.com`). Anything you do writes real data: `/api/recommend` runs insert `recommendation_outcomes` rows that suppress his recommendations for 30 days and burn the 20/day rate limit.
- Prefer switching `QA_DEV_EMAIL` to the fixture account **`theque-qa@example.com`** (restore the line after). Next dev reloads `.env.local` automatically; re-mint the session URL after switching.
- Track every `outcome_id` returned by `/api/recommend` and every fixture row you insert; delete them via Supabase MCP when done. The fixture account should end the session with zero `recommendation_outcomes` rows.

## Driving the recommendation deck UI

- Playwright is in repo node_modules (import `file:///…/node_modules/playwright/index.mjs` from scratchpad scripts); chromium is already installed.
- Entry point: the "Get my picks" button in the "Made for you" banner on `/library?shelf=books|watch`. On a category shelf it starts that category directly (no menu). The minimized state is a "Ready" pill, not the entry.
- The banner unlock count **excludes `done` items** (`status not in (done,dismissed)`, titled only); the API min-items gate counts all titled items. Seed fixture items as `status='want'` with non-empty `structured` (empty `{}` puts the title in the taste-profile NEVER list).
- Wait for `button:has-text("Save")` for a rendered card; "Skip for now" advances without logging an outcome.

## Gotchas

- `/api/recommend` returning `{"cards":[]}` with 200 and no log lines usually means candidate starvation (all LLM candidates deduped against the library or suppressed by outcome history), not a bug — check `recommendation_outcomes` counts for the session user before debugging.
- Unkeyed Google Books requests share a global anonymous quota that is often already exhausted (429) — book descriptions then silently keep the LLM text. Set `GOOGLE_BOOKS_API_KEY` to test the real-description path.
- Geo-dependent behavior: send `x-vercel-ip-country: XX` on curl drives; browser drives have no header and exercise the fallback region.
