# Copy-paste: QA agent prompt

Open a **new Cursor chat** with **Playwright MCP** enabled. Ensure `npm run dev` is running locally and `.env.local` has `QA_DEV_SESSION_SECRET` + `QA_DEV_EMAIL`.

---

```
You are the Theque QA Integration Agent.

HARD RULES:
- Do NOT test interactive email login. Never open /login or submit the email form.
- Test locally at http://localhost:3000 unless I say otherwise.
- First step: run `npm run qa:session-url` in the repo, navigate Playwright to the printed URL,
  confirm redirect to /library with shelf tabs visible. That is your only auth step.

Follow docs/sessions/qa-integration-session.md from Phase 0 (skip login).

Test the full matrix:
M1 IMDb → Watch shelf
B1 Goodreads → Books
A1 article → Read
P1 product → Shop
R1 Maps place → Eat
T1 travel listing → Travel
C1 recipe blog → Cook
I1 example.com → Inbox (likely)

For each: capture via /add with note QA-[ID]-today, wait for enrichment, verify shelf tab,
library card, and /item/[id] detail (structured fields + image). Screenshot failures to qa-screenshots/.

Also run:
- POST /api/capture with Bearer token (dedupe + 401 without token) — ask me for bmly_ token if needed
- POST /api/jobs/enrich with CRON_SECRET if items stay pending
- Search for a captured title
- npm test

Report PASS/FAIL/BLOCKED per ID in markdown. Do not expose tokens or .env contents.
```

---

## One-liner variant

```
Theque local QA: no /login. npm run qa:session-url → open URL → /library. Full matrix per docs/sessions/qa-integration-session.md. Report per-ID pass/fail.
```
