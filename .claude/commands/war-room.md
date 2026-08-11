---
description: One launch-day production health pass — traffic, errors, signups, captures, new issues. Loop it with `/loop 25m /war-room`.
---

Run ONE read-only health pass over production theque and report. This is designed
to be looped on launch day: `/loop 25m /war-room`.

**First, read `.claude/war-room.md`** — the persistent war-room log. It carries the
infra constants (Vercel project/team ids, Supabase project, schema gotchas), the
running totals, the previous pass numbers to diff against, the known error clusters,
open issues, and the watch list. Use it instead of re-deriving any of that. If the
file is missing, proceed from scratch and create it at the end.

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
   captures, runtime errors, new issues) against the **previous pass numbers from
   `.claude/war-room.md`** (first-ever pass = baseline). Escalate to 🔴 for: any 5xx
   spike, capture failure rate over ~10%, login/Turnstile errors, an issue
   reporting data loss — or traffic arriving with zero signups over several
   passes (funnel broken).
6. **Update `.claude/war-room.md`** before finishing:
   - overwrite the **Running totals** "As of" values,
   - append one terse row to the **Pass log**,
   - at/after UTC midnight, append the closed day to the **Daily rollup**,
   - adjust **error clusters / open issues / watch list** on any status change
     (new cluster, recurrence, a watched user returning, an issue filed/closed),
   - note any cadence change under **Loop cadence history**.
   Keep edits minimal and in the existing table shapes — this file is the memory the
   next pass depends on.

Strictly read-only **against production**: never write to prod, never redeploy, never
restart anything — report and let the owner decide. (Updating `.claude/war-room.md`
locally is expected and is not a prod write.)
