# QA Integration Session — Theque

**Purpose:** One session to validate every capture integration and shelf/card rendering.  
**Audience:** QA agent (or human) with **Playwright MCP** enabled.  
**Duration:** ~45–90 minutes for full matrix.

## Setup

1. **MCP:** Copy `docs/cursor-mcp.example.json` to `.cursor/mcp.json` (local, gitignored). In Cursor: Settings → MCP → ensure `playwright` is connected (reload window if needed).
2. **Browsers (once per machine):**
   ```bash
   npm run qa:install-browsers
   ```
3. **Target environment** (pick one):
   - **Production:** https://theque.vercel.app — use your real account (magic link).
   - **Local:** `npm run dev` → http://localhost:3000
4. **Capture token (API/extension tests):** Settings → Capture tokens → create → copy `bmly_…` once.
5. **Optional:** Chrome extension built (`npm run build`), loaded from `extension/`, API base = target origin.

## Reference URLs

Use stable public URLs; replace if a link dies.

| ID | Type | URL |
|----|------|-----|
| M1 | IMDb film | https://www.imdb.com/title/tt1375666/ |
| B1 | Goodreads book | https://www.goodreads.com/book/show/5907.The_Hobbit |
| A1 | Article | https://www.bbc.com/news (any article) |
| P1 | Product | https://www.amazon.com/dp/B0BDHWDR12 (or any product DP link) |
| R1 | Restaurant / place | Google Maps place share link (paste from Maps app) |
| T1 | Travel | https://www.airbnb.com/rooms/ (any listing) |
| C1 | Recipe | Any blog post with visible Recipe schema (e.g. serious eats recipe) |
| I1 | Low confidence | https://example.com/ |

## Session flow

### Phase 0 — Smoke

- [ ] Open `/login` — page renders, email field works.
- [ ] Complete magic link login (user action if needed).
- [ ] Land on `/library` — shelf tabs visible (All, Books, Watch, … Inbox).

### Phase 1 — Capture via web UI

For each URL (M1, B1, A1, …):

1. Go to **Add** (`/add`) or use capture flow in app.
2. Paste URL, optional note `QA-[ID]-[date]`, submit.
3. Wait for enrichment (≤60s); refresh or rely on realtime if visible.
4. Record item id from URL `/item/[id]`.

### Phase 2 — Shelf placement

For each captured item:

| ID | Expected shelf(s) | Must NOT appear on |
|----|-------------------|---------------------|
| M1 | Watch | Books only (wrong category) |
| B1 | Books | Watch |
| A1 | Read | — |
| P1 | Shop | — |
| R1 | Eat | — |
| T1 | Travel | — |
| C1 | Cook | — |
| I1 | Inbox (likely) | Watch/Books until triaged |

- [ ] Click each shelf tab; confirm card appears or absent as expected.
- [ ] **All** tab shows non-dismissed items.

### Phase 3 — Card & detail rendering (Playwright)

For each item on `/item/[id]`:

- [ ] Hero image loads (or graceful placeholder).
- [ ] Title matches source site (not empty "Untitled" unless scrape failed).
- [ ] Structured section shows category fields (see `docs/category-schemas.md`).
- [ ] **Open original** / external link uses correct URL.
- [ ] Screenshot: card on library + detail page (name files `qa-M1-library.png`, etc.).

**Category-specific expectations:**

| ID | Structured fields to verify |
|----|----------------------------|
| M1 | `year`, `directors`, optional `runtime_minutes` |
| B1 | `authors`, `published_year` |
| A1 | description / site_name from OG |
| P1 | product-ish OG fields |
| R1 | at least title; cuisine optional |
| T1 | title, image |
| C1 | recipe-related structured keys if parsed |
| I1 | minimal card OK; stays in inbox |

### Phase 4 — API capture (curl)

Use token from Settings. Replace `BASE` and `TOKEN`.

```bash
curl -s -X POST "%BASE%/api/capture" \
  -H "Authorization: Bearer %TOKEN%" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://www.imdb.com/title/tt1375666/\",\"note\":\"QA-api-M1\",\"source\":\"manual\"}"
```

- [ ] Second identical POST returns `"created": false` (dedupe).
- [ ] POST without header returns 401.

### Phase 5 — Extension (optional)

- [ ] Popup: API base + token saved.
- [ ] Save current tab on IMDb → item in library with `source` chrome path.

### Phase 6 — Regression

- [ ] **Search** finds `QA-` note or known title.
- [ ] **Inbox** badge count matches inbox items.
- [ ] **Retry enrichment** on a failed item if any (Settings or detail action).
- [ ] Run unit tests: `npm test` (parser fixtures must pass).

## Playwright MCP tips

- Start with `browser_navigate` to login URL.
- Use accessibility snapshots before clicking ambiguous buttons.
- Set viewport to mobile size for one pass: 390×844.
- Save screenshots to `qa-screenshots/` in repo (gitignored) or attach to report only.

## Pass / fail

**Pass:** Item captured, correct shelf, card/detail render with acceptable metadata, no console errors on critical paths.  
**Fail:** Wrong shelf, blank card, stuck processing >2 min, broken auth, 500 on capture.  
**Blocked:** Cannot login, no capture token, extension not installed (note in report).

## Report template

Copy into chat or `docs/sessions/reports/YYYY-MM-DD-qa.md`:

```markdown
# Theque integration QA — YYYY-MM-DD

Environment: production | local
Tester: agent | human

| ID | Capture | Shelf | Card | Detail | Notes |
|----|---------|-------|------|--------|-------|
| M1 | | | | | |
...

## Unit tests
npm test: pass | fail

## Blockers

## Recommended fixes
```

## Related docs

- `docs/qa-checklist.md` — full checklist  
- `AGENTS.md` — repo map and agent roles  
- `docs/sessions/qa-integration-agent.md` — agent prompt  
