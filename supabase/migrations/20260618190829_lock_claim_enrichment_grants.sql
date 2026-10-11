/*
  Lock public.claim_pending_enrichment_items down to service_role only.

  This SECURITY DEFINER function bypasses RLS and is meant to be called only by
  the cron/worker (service_role). The two-argument overload added in
  20260607205822_claim_enrichment_per_user_cap.sql was created with Supabase's
  default privileges, which grant EXECUTE to `anon` and `authenticated`. A plain
  `revoke ... from public` (as in that migration) does NOT remove those explicit
  role grants, so the function stayed callable by signed-in and anonymous clients
  via /rest/v1/rpc/claim_pending_enrichment_items — a Supabase security-advisor
  finding (lints 0028/0029) and a regression from the original lock-down.

  The single-argument legacy overload is already restricted to
  postgres/service_role, so it is intentionally left untouched.

  All statements here are idempotent and safe to re-run.
*/

revoke all on function public.claim_pending_enrichment_items(integer, integer)
  from public, anon, authenticated;

grant execute on function public.claim_pending_enrichment_items(integer, integer)
  to service_role;

-- Pin a stable search_path on the updated_at trigger function to clear the
-- function_search_path_mutable advisor (lint 0011). The body only calls now()
-- (pg_catalog), so an empty search_path is safe.
alter function public.set_updated_at() set search_path = '';
