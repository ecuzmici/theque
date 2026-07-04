---
description: One launch-day production health pass — traffic, errors, signups, captures, new issues. Loop it with `/loop 25m /war-room`.
---

Run ONE read-only health pass over production theque and report. This is designed
to be looped on launch day: `/loop 25m /war-room`.

1. **Traffic** — Vercel Web Analytics REST API. Requires `VERCEL_TOKEN` in
   `.env.local` (grep for it; never print it). If the token is missing, skip this
   step and say so in the report.
   - Resolve the project id once per conversation:
     `GET https://api.vercel.com/v9/projects/theque` with
     `Authorization: Bearer $VERCEL_TOKEN`. If that 403/404s, the project lives in
     a team — list teams (`/v2/teams`) and retry with `teamId=`.
   - Visitors + pageviews today:
     `GET https://api.vercel.com/v1/query/web-analytics/visits/aggregate`
     with `projectId`, `since=<today>`, `until=<now>`, `by=day`.
   - Where traffic comes from:
     same endpoint with `by=referrerHostname&limit=5` — on launch day this shows
     whether HN/PH/Reddit posts are actually sending people.
   - Hobby-plan limits to keep in mind: 1-month reporting window, 50k events/mo
     (collection pauses if exceeded), and custom events are NOT collected on
     Hobby — funnel numbers come from the Supabase step, which is ground truth
     anyway.
2. **Vercel errors** (project **theque**, production deployment, via Vercel MCP):
   `get_runtime_errors` and a skim of `get_runtime_logs`. Note any 5xx, unhandled
   rejections, or Turnstile/login failures.
3. **Supabase** (project `jucaqjkgyhyzixzaisjr`, SELECT-only via `execute_sql`):
   - new profiles in the last 30 min and total today
   - items captured in the last 30 min
   - enrichment health: items stuck in a pending/error state
4. **GitHub**: new issues since the previous pass
   (`gh issue list --state open --search "created:>=<date>"`).
5. Report with the verdict first: **🟢 all quiet / 🟡 watch / 🔴 action needed** plus a
   one-line reason, then a small delta table (visitors, top referrer, signups,
   captures, runtime errors, new issues) against the numbers from your previous
   pass in this conversation (first pass = baseline). Escalate to 🔴 for: any 5xx
   spike, capture failure rate over ~10%, login/Turnstile errors, an issue
   reporting data loss — or traffic arriving with zero signups over several
   passes (funnel broken).

Strictly read-only: never write to prod, never redeploy, never restart anything —
report and let the owner decide.
