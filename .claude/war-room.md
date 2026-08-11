# War-room log — theque production health

Persistent memory for the `/war-room` skill. The skill **reads this file first** (to
recover infra constants, the query shapes, running totals, and known issues) and
**updates it at the end of every pass** (new snapshot, appended pass-log row, and
any status change to the error clusters / issues / watch list).

Keep it terse and factual. This is operational history, not prose. All times UTC.

---

## Infra & query constants (stable — reuse, don't re-derive)

| Thing | Value |
|-------|-------|
| Vercel project id | `prj_9EMrqLPA2SFMg7P3LAcwBOkRPKfg` |
| Vercel team id | `team_LibGMYFZWlg0COPEDcaECNsn` |
| Supabase project | `jucaqjkgyhyzixzaisjr` |
| App URL (prod) | https://theque.vercel.app · public: https://theque.app |
| `VERCEL_TOKEN` | in `.env.local` — grep it, never print it |

**Schema gotchas** (verified — do not guess):
- Users live in **`auth.users`** (not `profiles`). Newest signup = `order by created_at desc limit 1`.
- Items table is **`items`**; enrichment state column is **`processing_status`** with values
  `pending` / `processing` / `failed` (NOT `enrichment_status`). Error text in `enrichment_error`.
- "today" in SQL = `date_trunc('day', now())` which is **UTC**. Traffic `since=<UTC-day>` must
  also be UTC — the local calendar can be a day ahead of UTC; always compute `date -u`.

**Traffic fetch** (Web Analytics REST, `by=day` and `by=referrerHostname`): the API rejects
`since >= until`, so right after UTC midnight the day query returns `[]` (normal, not a drop).

**Runtime-log fetch** (verified 2026-07-08): the Vercel **MCP** `get_runtime_errors` needs an
interactive OAuth flow (`mcp__plugin_vercel_vercel__authenticate`) that can't complete unattended.
Fallback that works with `VERCEL_TOKEN`: `vercel logs <prod-deployment-hostname> --token=$VERCEL_TOKEN
--scope=ecuzmicis-projects --json` (wrap in `timeout 30`; returns a small tail of recent function/
edge-middleware invocations with `responseStatusCode`/`level` — scan for 5xx or error level). The REST
`/v3/deployments/{id}/events` endpoint returns **build** logs only, not runtime. Current prod deployment:
`dpl_D6sRAPnvr9bNoXA91sSYw64FfuhT` (commit a57b499, "ADR 0016: record final model roster +
recency-nudge findings", READY as of 2026-08-10). Prior: `dpl_DZqsStrruXt9i3hBRKmWa6GKN4LS`
(8a33b43, empty-recommendations fix), `dpl_4Qz6zMi3yJ453y4h3tvFKvyv6BCS` (7149683, ADR 0015).

---

## Running totals (update each pass)

| Metric | Value | As of |
|--------|-------|-------|
| Signups total | **13** | 2026-08-10 22:47 |
| Items total | **229** | 2026-08-10 22:47 |
| Items unfinished (pending/processing) | 0 | 2026-08-10 22:47 |
| Items failed (lifetime) | 1 (~0.4%) | 2026-08-10 22:47 |

**Baseline for judging "organic" signups:** 11 pre-organic accounts = 10 pre-launch + 1 Emil
test (`kuzmosmurf@gmail.com`). Discount Emil's own test accounts. First real organic signup was
`sidotep834@doefy.com` → took total from 11 to 12 (churned, disposable email).
`mikepetrov365@gmail.com` (2026-07-09, 12→13) is **NOT organic** — a personal friend of
Emil's (confirmed 2026-07-16). So known-person accounts = 12; organic = sidotep only,
and effectively **zero retained organic signups** to date.

---

## Daily rollup (append one row per UTC day at/after midnight)

| UTC day | Visitors | Pageviews | Signups | Captures | Top referrers | Errors | Notes |
|---------|----------|-----------|---------|----------|---------------|--------|-------|
| 2026-07-04 (launch day 1) | — | — | 0 organic | — | HN (primary), Reddit, Chrome Web Store | — | Cold browsing; zero organic conversions. Login later confirmed working — not a broken funnel. |
| 2026-07-05 (launch day 2) | 19 | 90 | 1 | 8 | direct 11 · HN 8 · google 2 · accounts.google 1 · chromewebstore 1 · temp-mail 1 | 2 non-fatal clusters | First organic signup (sidotep, 00:21). Plateaued ~15/80 midday, drifted to 19/90 by EOD. An existing user returned ~21:07 and captured 2 (items 179→181). |
| 2026-07-06 | 9 | 9 | 0 | 0 | HN 6 · direct 3 | 0 | Quiet HN trickle, no conversions. Loop paused ~00:4x–17:25; two passes bracketed the day. Totals held 12/181. |
| 2026-07-07 | 4 | 4 | 0 | 0 | direct 4 | 0 | Fully quiet; single manual pass at 18:01 (auto-loop off). All direct, no conversions/errors. Totals held 12/181. |
| 2026-07-08 | 1 | 1 | 0 | 0 | direct | — | Quiet; pass at 19:25 clean. |
| 2026-07-09 | 6 | 24 | 1 (friend) | 6 | direct 6 | — | `mikepetrov365@gmail.com` 00:47 — Emil's friend, **not organic**; activated with 5 captures in 5 min. +1 Emil capture. |
| 2026-07-10 | 1 | 1 | 0 | 0 | — | — | Quiet (no pass ran; reconstructed 07-16). |
| 2026-07-11 | 3 | 13 | 0 | 5 | — | — | Pre-launch user `migotkaa2003` returned, +5 captures (→40 items). |
| 2026-07-12 | 1 | 1 | 0 | 0 | — | — | Quiet. |
| 2026-07-13 | 3 | 7 | 0 | 1 | — | — | 1 Emil capture. |
| 2026-07-14 | 13 | 18 | 0 | 0 | direct 13 · bing 1 | — | Unexplained direct-only bump, zero engagement — likely bot/scanner sweep, not a referral wave. |
| 2026-07-15 | 4 | 4 | 0 | 0 | — | — | Quiet. |
| 2026-07-16 → 2026-07-21 (gap, no pass) | — | — | 0 | 3 | — | — | No loop running; reconstructed 07-22. Only signal: items 193→196 (+3 captures, no new signups). Commit 7149683 (ADR 0015 richer recommend cards) shipped to prod 07-16 ~21:16 (dpl_4Qz6zMi3yJ453y4h3tvFKvyv6BCS). |
| 2026-07-22 → 2026-08-10 (gap, no pass) | 43 | 119 | 0 | +33 | direct 43 · bing 1 | 0 | No loop running; reconstructed 08-10. Steady 1–7 visitors/day, near-all direct, zero new signups. Items 196→229 — existing-user/dogfood captures during ADR 0015/0016 work. Commits 8a33b43 + a57b499 (ADR 0016 recommendation fixes) shipped to prod; current deployment dpl_D6sRAPnvr9bNoXA91sSYw64FfuhT. |

---

## Pass log (append terse row each pass; newest at bottom)

Format: `UTC time — verdict — visitors/pageviews, signups today, captures today, errors(45m), new issues — note`

- 2026-07-05 18:05 — 🟢 — 15/80, 1, 6, 0, none — flat
- 2026-07-05 18:20–19:20 — 🟢 ×5 — 15/80 flat throughout, 1, 6, 0, none — launch spike settled
- 2026-07-05 19:20 — cadence widened 15m→30m (over-sampling idle system)
- 2026-07-05 19:37–20:37 — 🟢 — 15/80, 1, 6, 0, none — flat
- 2026-07-05 21:07 — 🟡 — 17/88, 1, 8, **2 clusters**, none — existing user returned +2 captures; refresh-token 400 + sharp load failure surfaced (both non-fatal)
- 2026-07-05 21:37 — 🟢 — 17/88, 1, 8, 0, none — clusters didn't recur
- 2026-07-05 22:07–23:39 — 🟢 — drifted 18/89 → 19/90, 1, 8, 0, none — late HN trickle, no conversions
- 2026-07-06 00:09 — 🟢 — daily counters rolled to 0 at UTC midnight; totals held 12/181
- 2026-07-06 00:39 — 🟢 — 1/1 (HN), 0, 0, 0, none — first visit of new day
- 2026-07-06 00:4x — **loop paused** by owner (post-launch, quiet). Resume on demand.
- 2026-07-06 17:25 — 🟢 — 7/7 (HN 5 · direct 2), 0, 0, 0, none — resumed after ~17h pause; totals held 12/181, no conversions from light HN trickle
- 2026-07-07 18:01 — 🟢 — 4/4 (all direct), 0, 0, 0, none — ~24h since prior pass; 10 prod requests/24h all 200, no runtime errors; totals held 12/181
- 2026-07-08 19:25 — 🟢 — 1/1 (direct), 0, 0, 0, none — ~25h since prior pass (manual, auto-loop off). Runtime logs snapshot (18:35–18:56Z) 5 req all 200/info, no 5xx/login errors. Vercel MCP get_runtime_errors unavailable (needs OAuth) → used CLI `vercel logs` + build-events REST as fallback, both clean. Totals held 12/181; enrichment 180 ready / 1 failed (lifetime benign) / 0 pending. sidotep still 6 items, no return.
- 2026-07-16 20:31 — 🟢 — 0/0 today, 0, 0, 0, none — ~8 days since prior pass (manual). Gap recap: +1 signup (mikepetrov 07-09, 5 captures — later confirmed a friend, not organic) + migotkaa returned 07-11 (+5); totals 12/181 → **13/193**. Enrichment clean (0 pending, same 1 lifetime failed). `vercel logs` tail empty (consistent with 0 visitors today); no retroactive runtime-error visibility over the gap, but all 12 captures succeeded and no issues were filed. 07-14 bump (13 direct visitors, 0 engagement) looks like a scanner sweep. sidotep never returned.
- 2026-07-22 22:15 — 🟢 — 2/3-4 today (direct only), 0, 0, 0, none — ~6 days since prior pass (manual). Gap recap: 193→196 items (+3 captures), 0 new signups; commit 7149683 (ADR 0015 recommend cards) deployed to prod 07-16 ~21:16, now READY as current deployment. `vercel logs` tail (recent window) all 200/info, no 5xx. Enrichment clean (0 pending, same 1 lifetime failed, ~0.5%). No new GitHub issues since 07-16 (`gh issue list --search created:>=2026-07-16` empty). sidotep and mikepetrov still no return.
- 2026-08-10 22:47 — 🟢 — 0/0 today (UTC day nearly closed), 0, 1 capture today, 0, none — ~19 days since prior pass (manual). Gap recap: 43 visitors / 119 pageviews over 19 days, all direct except 1 bing; **0 new signups**; items 196→229 (+33, existing users). Enrichment clean: 0 pending, 0 processing, same 1 lifetime failed (~0.4%). `vercel logs` tail (last ~30 min) 4 requests, all 200/info on theque.app `/`, no 5xx and no login/Turnstile errors. No new GitHub issues since 07-22 (search empty); open set unchanged (#69, #36). Neither error cluster recurred. Watch-list users still absent.

---

## Known runtime error clusters (update status; both first seen pre-launch)

1. **`AuthApiError: Invalid Refresh Token: Refresh Token Not Found`** — route `/middleware`,
   status 400, first seen 2026-06-21, count 4 as of 2026-07-05. **Benign** — routine Supabase
   auth churn (expired/stale refresh cookie → user re-logs in). Not a 5xx, not a login outage.
   No action. Do not escalate on this alone.

2. **`[image-cache] sharp / libvips-cpp.so failed to load (linux-x64)`** — route `/api/capture`,
   first seen 2026-06-30, count 2 as of 2026-07-05. **Fix-worthy but non-fatal.** `dominant_color`
   extraction throws and fails open — items still capture & save — but **palette sort + placeholder
   tinting are silently degraded** for every capture since 2026-06-30. Likely fix: bundle the
   linux-x64 `sharp` binary in the Vercel build (`npm install --os=linux --cpu=x64 sharp` or the
   optional-deps flag). **Not yet filed as a GitHub issue** (owner offered, not yet accepted).

---

## Open GitHub issues seen during monitoring

- **#69** — `useItemStatusRealtime merges raw realtime payload fields (note/verdict leak shape,
  follow-up to #68)` — `needs-triage`, created 2026-07-04. Open, not new. No data-loss report.

---

## Watch list

| User | Why | Baseline | Last seen | Status |
|------|-----|----------|-----------|--------|
| `sidotep834@doefy.com` | First organic signup (disposable email, manhwa/amazon.es captures) | 6 items, sign-in 2026-07-05 00:21:52 | 2026-07-05 00:21:52 | No return through 2026-08-10 22:47. Likely churned (disposable email). Flag if sign-in or capture count changes. |
| `mikepetrov365@gmail.com` | Emil's friend (not organic); activated immediately (5 captures in first 5 min) | 5 items, sign-in 2026-07-09 00:47:39 | 2026-07-09 00:52:30 (capture) | No return through 2026-08-10 22:47. Interesting for retention, not acquisition. |

---

## Loop cadence history

- Started 15 min (launch day). Widened to **30 min** at 2026-07-05 19:20 (idle over-sampling).
  **Paused** 2026-07-06 ~00:4x post-launch. Cron jobs are session-only; re-create with
  `/loop <interval> /war-room` or CronCreate when resuming.
  **Fully paused** 2026-07-07 18:0x by owner — no auto-loop; owner will run `/war-room`
  manually on demand. System idle (HN cold, no conversions/errors across last passes).
