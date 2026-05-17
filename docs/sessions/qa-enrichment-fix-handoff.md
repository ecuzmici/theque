# Handoff: Fix enrichment & QA matrix failures (2026-05-15)

**Paste this entire document into a new agent session** to implement fixes and re-verify.  
**Product:** Theque (repo `bookmarkly`) — personal visual taste library, PoC, single user.  
**Do not** test interactive email login. Use local `http://localhost:3000` unless told otherwise.

---

## Mission

Improve **live URL enrichment** so the integration QA matrix (capture → shelf → card → detail) passes for all category IDs. A QA run on **2026-05-15** found that **shelf routing and capture work**, but **many domains return sparse metadata** when fetched server-side (empty titles, missing structured fields, missing images).

**Success:** After your changes, re-run the verification section below. Target **PASS** on capture, shelf, card, and detail for each ID (except known PoC limits documented in notes).

---

## Repo map (where to work)

| Area | Path |
|------|------|
| Fetch HTML | `src/lib/enrichment/fetch.ts` |
| Parse orchestration | `src/lib/enrichment/extract.ts` |
| Domain parsers | `src/lib/enrichment/parsers/` (`imdb.ts`, `goodreads.ts`, `generic.ts`) |
| Classification | `src/lib/classify/` |
| Enrichment job | `src/lib/jobs/enrich-item.ts` |
| Capture + inline enrich | `src/app/api/capture/route.ts` (`after(() => enrichItem(...))`) |
| Cron batch enrich | `src/app/api/jobs/enrich/route.ts` |
| Structured UI | `src/components/items/StructuredFields.tsx` |
| Category field spec | `docs/category-schemas.md` |
| Shelves (code-defined) | `src/lib/shelves.ts` |
| Unit tests | `src/lib/enrichment/extract.test.ts`, `npm test` |
| QA session flow | `docs/sessions/qa-integration-session.md` |
| QA checklist URLs | `docs/qa-checklist.md` |

**Important:** Vitest already passes on **fixtures** (e.g. `fixtures/imdb-movie.html`). Failures are **live-fetch vs production HTML**, bot blocking, or missing fallbacks when JSON-LD/OG is absent.

---

## QA baseline (2026-05-15) — what failed

| ID | Expected shelf | URL used in QA | Capture | Shelf | Card | Detail | Notes |
|----|----------------|----------------|---------|-------|------|--------|-------|
| **M1** | Watch | `https://www.imdb.com/title/tt1375666/` | PASS | PASS | FAIL | FAIL | Category `movies_and_tv` set; **empty title**; card shows `www.imdb.com`; Details only `Site Name: IMDb`; no image. Item id example: `b7cadc54-ffe8-4280-9077-14c2aab09b82`. |
| **B1** | Books | `https://www.goodreads.com/book/show/5907.The_Hobbit` | PASS | PASS | PASS | PASS | **Reference implementation** — do not regress. |
| **A1** | Read | `https://www.bbc.com/news/articles/cwy5r7xzn92o` | PASS | PASS | PARTIAL | PARTIAL | Title truncated to **"BBC"**; no article structured fields; no image; `status` stayed `inbox` despite `articles` category. |
| **P1** | Shop | `https://www.amazon.com/dp/B0BDHWDR12` | PASS | PASS | PARTIAL | PARTIAL | Long raw Amazon title; **no product structured fields**; no image. |
| **R1** | Eat | Google Maps place (Café de Flore, Paris) | PASS | PASS | PARTIAL | PARTIAL | Title **"Google Maps"**; image sometimes present; only `site_name` in Details — **no place name/address**. |
| **T1** | Travel | `https://www.airbnb.com/rooms/52929145` | PASS | PASS | FAIL | FAIL | Listing **404** in live fetch → title "404 Page Not Found - Airbnb". Category `travel` OK. **Update matrix URL** to a live listing. |
| **C1** | Cook | `https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/` | PASS | PASS | FAIL | FAIL | Category `recipes` set; title stayed **domain**; no Recipe schema fields in UI. |
| **I1** | Inbox (likely) | `https://example.com/` | PASS | PASS | PASS | PARTIAL | Title "Example Domain"; `status=inbox` OK. Also appears on **Read** because category classified as `articles` — document or fix if product wants inbox-only visibility. |

**Screenshots from failed run:** `qa-screenshots/M1-*.png`, `C1-*.png`, `T1-detail.png`.

**API / unit tests (already healthy — do not break):**

- `POST /api/capture` without Bearer → **401**
- Dedupe: second identical URL → `created: false`
- `npm test` → 16/16 passed

---

## Per-issue implementation guidance

### P0 — M1 IMDb (`movies_and_tv`)

**Symptom:** `enrichItem` marks `processing_status: ready` but `title` empty; `structured` ≈ `{ site_name: "IMDb" }` only.

**Hypothesis:** `parseImdb` in `parsers/imdb.ts` depends on **JSON-LD** (`Movie` / `TVSeries`). Live IMDb HTML from `fetchPage` may omit or alter JSON-LD vs `fixtures/imdb-movie.html`.

**Directions (pick minimal viable):**

1. Log or inspect **live HTML** from `fetchPage` for M1 URL; compare to fixture.
2. Add **fallbacks**: OG `og:title`, `<title>`, embedded `__NEXT_DATA__` / script JSON if IMDb uses them.
3. Ensure `extractFromHtml` sets top-level `title` from `title_hint` when parser only sets structured hints (`enrich-item.ts` already uses `extracted.title ?? titleHint ?? row.title` — verify `extract.ts` populates `title`).
4. Add/extend **fixture + test** that mirrors **current** IMDb HTML snippet (not only ideal case).
5. Pass criteria: title like **"Inception"** (or current film name), structured fields per `docs/category-schemas.md` (`year`, `directors`, etc.), hero image or acceptable placeholder.

### P0 — C1 Recipe (`recipes`)

**Symptom:** Category `recipes` but title `www.allrecipes.com`; no `Recipe` fields in Details.

**Hypothesis:** Allrecipes blocks or strips schema.org `Recipe` for server `fetch`.

**Directions:**

1. Confirm `generic.ts` JSON-LD `Recipe` extraction path.
2. Fallback: OG title/description/image; microdata; optional alternate recipe URL in QA matrix (e.g. site known to allow bots).
3. Update `docs/qa-checklist.md` / session doc with **stable recipe URL** once chosen.
4. Pass criteria: human-readable recipe title, at least **prep time / yield / rating** or equivalent per `category-schemas.md`.

### P1 — T1 Travel (`travel`)

**Symptom:** 404 HTML stored as title.

**Directions:**

1. Replace QA URL with a **verified live** Airbnb (or Booking) listing; document in `docs/sessions/qa-integration-session.md` and `docs/qa-checklist.md`.
2. Improve **generic** travel extraction (OG + JSON-LD `LodgingBusiness` / `Product`) when parser is generic-only.
3. Pass criteria: listing title (not "404"), travel category, image if available.

### P2 — A1 Article (`articles`)

**Symptom:** Title "BBC"; no byline/date; no image.

**Directions:**

1. Strengthen `parsers/generic.ts` for `NewsArticle` / `Article` JSON-LD and OG article tags.
2. Consider promoting `status` to `want` when `category_confidence >= 0.6` (see `enrich-item.ts` — verify BBC item isn’t stuck `inbox` incorrectly).
3. Pass criteria: **article headline** (not site name only), optional author/date in structured, image or placeholder.

### P2 — P1 Product (`products` / Shop shelf)

**Symptom:** Verbose Amazon title; no structured product fields; no image.

**Directions:**

1. OG `product:` / JSON-LD `Product` in generic parser.
2. Optional: trim/normalize Amazon titles for card display.
3. Pass criteria: title + at least one of brand/price/image in structured or card.

### P2 — R1 Restaurant (`restaurants` / Eat shelf)

**Symptom:** Title "Google Maps"; no place name.

**Directions:**

1. Parse Maps share URLs: extract place name from HTML, JSON-LD, or URL path/query.
2. Pass criteria: **place name** as title (e.g. "Café de Flore"), not "Google Maps".

### P3 — I1 Inbox behavior (`example.com`)

**Symptom:** Correct on Inbox; **also** on Read shelf (`articles` + `status=inbox`).

**Directions (product decision):**

- Either accept dual visibility (document in `docs/ui-shelves.md`), **or**
- Adjust classifier so `example.com` stays low-confidence / inbox-only, **or**
- Filter Read shelf to exclude `status=inbox` items.

Only change if aligning with PoC intent; not a parser bug per se.

### Cross-cutting

- **`fetch.ts`:** Consider status-code checks, retry, or clearer `enrichment_error` when body is challenge/captcha HTML.
- **Do not** add LLM classification (product constraint).
- Keep diffs minimal; match existing patterns in `AGENTS.md`.

---

## Suggested QA matrix URLs (post-fix)

Use these in verification (update docs if you change them):

| ID | URL |
|----|-----|
| M1 | `https://www.imdb.com/title/tt1375666/` |
| B1 | `https://www.goodreads.com/book/show/5907.The_Hobbit` |
| A1 | `https://css-tricks.com/snippets/css/a-guide-to-flexbox/` |
| P1 | `https://www.amazon.com/dp/B0BDHWDR12` |
| R1 | `https://www.google.com/maps/place/Caf%C3%A9+de+Flore/@48.8541604,2.3325599,17z` |
| T1 | `https://www.lonelyplanet.com/articles/where-to-stay-in-paris` |
| C1 | `https://www.kingarthurbaking.com/recipes/chocolate-chip-cookies-recipe` |
| I1 | `https://example.com/` |

---

## Post-implementation verification

Run this checklist after code changes. Auth: **no magic link**.

### 0. Setup

```bash
npm install
npm run dev   # :3000
```

`.env.local` must include `QA_DEV_SESSION_SECRET`, `QA_DEV_EMAIL`, `CRON_SECRET` (see `.env.local.example`). Never commit `.env.local`.

```bash
npm run qa:session-url
```

Open printed URL once in browser or Playwright → must land on `/library` with shelf tabs visible.

### 1. Unit tests (required before claiming done)

```bash
npm test
```

- All tests pass.
- Add/update tests in `extract.test.ts` for any new parser fallbacks (prefer fixture HTML captured from live page snippets).

### 2. Re-capture matrix (web UI)

For each ID **M1, B1, A1, P1, R1, T1, C1, I1**:

1. Go to `/add`.
2. Paste URL, note `QA-[ID]-verify` (e.g. `QA-M1-verify`).
3. Submit; wait ≤90s for enrichment (refresh item page if needed).
4. If stuck `pending`, trigger batch job:

   ```bash
   # Use CRON_SECRET from .env.local — do not paste secret into chat logs
   curl.exe -s -X POST "http://localhost:3000/api/jobs/enrich" -H "Authorization: Bearer <CRON_SECRET>"
   ```

### 3. Per-ID pass criteria

| ID | Shelf tab | Card | Detail (`/item/[id]`) |
|----|-----------|------|------------------------|
| M1 | **Watch** | Title ≠ domain only; shows film name | Structured: year/directors/genres per schema; image or placeholder |
| B1 | **Books** | (regression) Rich title + author | Same as before QA (authors, ratings, image) |
| A1 | **Read** | Article headline | OG/article fields; image optional |
| P1 | **Shop** | Sensible product title | Some product structured fields and/or image |
| R1 | **Eat** | Place name | Place-related structured fields |
| T1 | **Travel** | Listing title (not 404) | Travel metadata; image optional |
| C1 | **Cook** | Recipe name | Recipe fields (time, yield, etc.) |
| I1 | **Inbox** | "Example Domain" or similar | Low confidence OK; document if also on Read |

### 4. API smoke (regression)

```powershell
# 401 without token — expect unauthorized
$body = '{"url":"https://example.com/","note":"QA-api","source":"manual"}'
try { Invoke-WebRequest -Uri "http://localhost:3000/api/capture" -Method POST -ContentType "application/json" -Body $body } catch { $_.Exception.Response.StatusCode.value__ }
# Should print 401
```

With a capture token from **Settings → Capture tokens**:

- First `POST /api/capture` with new URL → `created: true` (201).
- Second identical POST → `created: false` (200).

### 5. Search

- `/search` for **"Hobbit"** or a newly captured title → item appears.

### 6. Report template (fill in after verification)

```markdown
# Enrichment fix verification — YYYY-MM-DD

| ID | Capture | Shelf | Card | Detail | Notes |
|----|---------|-------|------|--------|-------|
| M1 | | | | | |
| B1 | | | | | |
| A1 | | | | | |
| P1 | | | | | |
| R1 | | | | | |
| T1 | | | | | |
| C1 | | | | | |
| I1 | | | | | |

npm test: pass | fail
API 401 + dedupe: pass | fail
```

Save failure screenshots to `qa-screenshots/{ID}-library.png` and `{ID}-detail.png`.

### 7. Optional full integration pass

Paste `docs/sessions/qa-integration-prompt.md` into a **QA Integration** agent session with Playwright MCP for end-to-end browser validation.

---

## Constraints for the implementing agent

- **Single user PoC** — no multi-tenant, no LLM classify.
- **Shelves are code-defined** — do not add DB shelf tables.
- **Minimal diffs** — no drive-by refactors.
- **Never commit** `.env.local`, capture tokens, or `CRON_SECRET`.
- **Do not** run magic-link `/login` tests.
- Run `npm test` before marking work complete.

---

## Related commits / context

- QA integration run: **2026-05-15**, environment **local**.
- B1 (Goodreads) is the **gold path** for expected enrichment depth.
- IMDb parser unit test passes on fixture; live M1 failure is the highest-impact fix.
