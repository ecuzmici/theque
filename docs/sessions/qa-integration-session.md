# QA Integration Session — Theque

**Purpose:** Validate capture, enrichment, shelves, and card/detail UI per category.  
**Out of scope:** Interactive email login (tested manually by owner). **Do not** open `/login` or submit the email form.

**Audience:** QA agent with **Playwright MCP**.  
**Default environment:** **local** (`http://localhost:3000`) to avoid Supabase email rate limits.

## Setup (local)

```bash
npm install
npm run dev
npm run qa:install-browsers   # once per machine
```

In `.env.local` (see `.env.local.example`):

```env
QA_DEV_SESSION_SECRET=some-long-random-string
QA_DEV_EMAIL=your-supabase-login-email@example.com
```

Get a capture token for API tests: after session bootstrap, open **Settings → Capture tokens** in the app (or use an existing `bmly_…` token).

**Playwright MCP:** copy `docs/cursor-mcp.example.json` → `.cursor/mcp.json`, reload Cursor.

### Bootstrap auth (no email sent)

```bash
npm run qa:session-url
```

Copy the printed URL. **First Playwright step:** navigate to that URL → redirects to `/library` with session cookies. Do not use `/login`.

## Setup (production — optional)

Only if explicitly asked. User must **already be logged in** in the browser context Playwright uses. **Never** submit the email OTP form (rate limits). Start at `/library` after user confirms auth.

## Reference URLs

| ID | Type | URL |
|----|------|-----|
| M1 | IMDb film | https://www.imdb.com/title/tt1375666/ |
| B1 | Goodreads book | https://www.goodreads.com/book/show/5907.The_Hobbit |
| A1 | Article | https://css-tricks.com/snippets/css/a-guide-to-flexbox/ |
| P1 | Product | https://www.amazon.com/dp/B0BDHWDR12 |
| R1 | Restaurant / place | https://www.google.com/maps/place/Caf%C3%A9+de+Flore/@48.8541604,2.3325599,17z |
| T1 | Travel | https://www.lonelyplanet.com/articles/where-to-stay-in-paris |
| C1 | Recipe | https://www.kingarthurbaking.com/recipes/chocolate-chip-cookies-recipe |
| I1 | Low confidence | https://example.com/ |

## Session flow

### Phase 0 — Session smoke (not login)

- [ ] `npm run qa:session-url` → open URL in Playwright → land on `/library`.
- [ ] Shelf tabs visible: All, Books, Watch, Eat, Shop, Travel, Read, Cook, Inbox.
- [ ] `/login` is **not** tested.

### Phase 1 — Capture via web UI (`/add`)

For each URL (M1, B1, A1, …):

1. Go to **Add** (`/add`).
2. Paste URL, note `QA-[ID]-[date]`, submit.
3. Wait for enrichment (≤90s); refresh if needed.
4. Record item id from `/item/[id]`.

### Phase 2 — Shelf placement

| ID | Expected shelf(s) |
|----|-------------------|
| M1 | Watch |
| B1 | Books |
| A1 | Read |
| P1 | Shop |
| R1 | Eat |
| T1 | Travel |
| C1 | Cook |
| I1 | Inbox (likely) |

- [ ] Each shelf tab shows/hides the item correctly.
- [ ] **All** includes non-dismissed items.

### Phase 3 — Card & detail (Playwright)

For each `/item/[id]`:

- [ ] Hero image or placeholder.
- [ ] Title present; structured fields per `docs/category-schemas.md`.
- [ ] External link opens correct URL.
- [ ] Screenshots: `qa-screenshots/{ID}-library.png`, `{ID}-detail.png`.

### Phase 4 — API capture (`curl`)

Requires capture token from Settings.

```bash
curl -s -X POST "http://localhost:3000/api/capture" \
  -H "Authorization: Bearer bmly_..." \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://www.imdb.com/title/tt1375666/\",\"note\":\"QA-api-M1\",\"source\":\"manual\"}"
```

- [ ] Second identical POST → `"created": false`.
- [ ] POST without Bearer → **401**.

### Phase 5 — Enrichment job (local)

Trigger enrichment for pending items (if cron not running):

```bash
curl -s -X POST "http://localhost:3000/api/jobs/enrich" \
  -H "Authorization: Bearer $CRON_SECRET"
```

(Use `CRON_SECRET` from `.env.local`.)

### Phase 6 — Extension (optional)

See `docs/chrome-extension.md`. API base `http://localhost:3000`. Skip if not installed; note BLOCKED.

### Phase 7 — Regression

- [ ] **Search** finds a captured title or `QA-` note.
- [ ] **Inbox** badge count matches inbox items.
- [ ] **Settings** loads; capture token list works.
- [ ] `npm test` passes.

## Playwright tips

- First navigation: **qa-session URL**, not `/login`.
- Mobile pass: viewport 390×844.
- Use accessibility snapshots before clicks.

## Pass / fail

**Pass:** Capture works, correct shelf, card/detail OK, no 500s on core paths.  
**Fail:** Wrong shelf, broken layout, enrichment stuck >2 min, capture 500.  
**Blocked:** Missing `QA_DEV_*` env, no capture token, extension not loaded.

## Report template

```markdown
# Theque integration QA — YYYY-MM-DD

Environment: local | production
Auth: qa-session | user pre-authenticated

| ID | Capture | Shelf | Card | Detail | Notes |
|----|---------|-------|------|--------|-------|
| M1 | | | | | |

## Unit tests
npm test: pass | fail

## Blockers / fixes
```

## Related

- `docs/sessions/qa-integration-prompt.md` — paste into Cursor  
- `docs/qa-checklist.md`  
- `AGENTS.md`
