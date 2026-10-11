# Theque

Personal visual taste library: capture URLs from Chrome, the web app, API clients, or an iOS Shortcut; enrich them into category-aware cards; browse them through code-defined shelves.

**Public app:** https://theque.app<br>
**Vercel deployment:** https://theque.vercel.app

See `docs/product-brief.md`, `docs/data-model.md`, and `docs/api-contract.md` for product, schema, and endpoint details.

## Stack

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4
- Supabase Auth, Postgres, RLS, and server-side service-role jobs
- Chrome MV3 extension in `extension/`
- Optional LLM enrichment through the Vercel AI Gateway behind `LLM_ENRICHMENT_ENABLED=true`

## Setup

Copy `.env.local.example` to `.env.local` and fill the Supabase keys from [the dashboard](https://supabase.com/dashboard). At minimum local development needs:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
```

Then install and run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Web sign-in uses a two-step Supabase email OTP flow; the emailed magic-link button still works through `/auth/callback` as a fallback.

Optional demo data:

```bash
npm run seed
```

Requires `SEED_USER_ID` (your Supabase `auth.users` UUID) in `.env.local`.

## Chrome Extension

The extension compiles TypeScript from `extension/popup.ts` and `extension/background.ts` into gitignored JS files.

```bash
npm run build:extension
```

Load unpacked from the `extension/` folder, not the repo root. The production extension connects to `https://theque.app` and stores its `bmly_...` capture token in `chrome.storage.local`. See `docs/chrome-extension.md`.

## QA

For local integration QA, set `QA_DEV_SESSION_SECRET` and `QA_DEV_EMAIL` in `.env.local`, then:

```bash
npm run qa:install-browsers
npm run qa:session-url
```

Use the printed URL to create a local session without sending email. The full QA handoff is in `docs/sessions/qa-integration-prompt.md`.

## Scripts

| Command | Purpose |
| ------- | ------- |
| `npm run dev` | Start the Next.js dev server on port 3000 |
| `npm run build` | Compile the extension, then run `next build` |
| `npm run build:extension` | Compile Chrome extension TypeScript only |
| `npm run start` | Serve a production Next.js build |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest |
| `npm run seed` | Insert sample rows; needs `SEED_USER_ID` |
| `npm run supabase:sync-auth` | Sync hosted Supabase auth redirects/templates; needs `SUPABASE_ACCESS_TOKEN` |
| `npm run qa:install-browsers` | Install Chromium for Playwright QA |
| `npm run qa:session-url` | Print a local QA session bootstrap URL |

## Documentation

- `docs/chrome-extension.md` — MV3 setup and connection flow
- `docs/api-contract.md` — REST endpoints and response shapes
- `docs/category-schemas.md` — structured metadata and LLM enrichment notes
- `docs/data-model.md` — tables, enums, RLS, and lifecycle behavior
- `docs/ui-shelves.md` — shelf filters and UI behavior
- `docs/qa-checklist.md` — integration QA matrix
