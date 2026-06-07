---
description: Implement one workstream from the remediation plan, end to end.
argument-hint: <letter, e.g. B> or "prelim"
---

You are executing the Theque remediation plan. The plan is the source of truth:
`docs/superpowers/plans/2026-06-07-remediation-plan.md`.

1. Read the plan in full, paying particular attention to **Progress tracker**,
   **Conventions**, **Tooling available to the executor**, and **Cross-cutting: testing & rollout**.
2. Restate, in 3–5 lines, the scope and acceptance criteria of **Workstream $ARGUMENTS**
   so we agree before you write code. (If `$ARGUMENTS` is "prelim", just do the Vercel
   domain check and record the answer in the Progress tracker.)
3. Implement **Workstream $ARGUMENTS** end to end:
   - Follow the Conventions exactly: minimal diffs, match existing patterns, **no drive-by refactors**.
   - For any DB change: apply the migration via the **Supabase connector**, verify it landed
     (query `pg_enum` / `information_schema`), then regenerate `src/lib/database.types.ts`
     and fix every resulting type error (watch the `Record<ItemCategory, …>` maps).
   - Add or update tests where the Conventions require it.
   - Run `npm test` and `npm run build` — both must pass before you call it done.
   - Work on a dedicated feature branch; open a PR when green.
   - Where relevant, use the **Vercel connector** to confirm the deployment is healthy after merge.
4. Update the **Progress tracker** checkbox for this workstream (done / deferred / blocked, with a one-line note).
5. If you catch yourself repeating a failed approach or debugging in circles, **STOP and report back**
   instead of papering over it — that is the signal to escalate to Opus for this step.

Begin with step 2.
