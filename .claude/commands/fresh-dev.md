---
description: Kill every stray Next dev server and restart clean on :3000 from this working tree.
---

The dev server on :3000 is often stale — a server started from another session or
worktree keeps serving old code. Reset it deterministically:

1. Kill everything: `pkill -f "next dev" || true`, then `lsof -ti:3000 | xargs -r kill -9`.
   Confirm :3000 is free (`lsof -ti:3000` returns nothing). If other ports still have
   `next dev` listeners (`ps aux | grep "next dev"`), kill those too — a worktree server
   on :3001+ is usually the source of "I'm seeing old code" confusion.
2. Start fresh **from the repo root of this working tree**: `npm run dev` in the background.
3. Poll `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` until it returns
   200 (allow up to ~60s; the first compile is slow).
4. Report back, so there is never doubt about what :3000 is serving:
   - git branch + short SHA of this working tree (`git branch --show-current`, `git log -1 --oneline`)
   - whether the working tree has uncommitted changes that will be part of what renders
   - confirmation that no other `next dev` process survives

If the user still reports stale code after this, do not argue with the symptom — re-run
step 1 and show the `ps` output before restarting.
