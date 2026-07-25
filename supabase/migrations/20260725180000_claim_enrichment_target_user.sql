/*
  Add an optional `target_user` to claim_pending_enrichment_items.

  ## Why

  Bulk import (`POST /api/import`) lands rows at `processing_status = 'pending'`
  and leaves the covers to enrichment. The only drain was the daily cron, which
  claims a globally fair slice — so a 400-row import took months to get its
  covers. `POST /api/items/enrich-pending` lets the signed-in user drain *their
  own* backlog while the import wizard watches, and it needs a claim that is
  both user-scoped and atomic.

  A second claim path would be a second place to get `for update skip locked`
  wrong, so this extends the existing function instead: `target_user is null`
  keeps the exact cron behaviour (per-user cap, `id` order), and a non-null
  `target_user` restricts the candidate set to that user and drops the cap —
  when a batch belongs to one user by construction, capping it per user is
  just a smaller batch_size.

  ## Overloads must be dropped, not left alongside

  `create or replace function` with a *different* argument count creates a new
  overload rather than replacing. Leaving the old 1- and 2-argument versions in
  place would make the cron's existing call
  `(batch_size => …, per_user_cap => …)` ambiguous — it would match both the
  2-arg function and the 3-arg one with `target_user` defaulted, and Postgres
  errors on ambiguity rather than picking. So both legacy signatures are dropped
  first. This is deploy-safe in either order: currently-deployed code calls with
  named `batch_size`/`per_user_cap`, which resolves to the new function with
  `target_user` defaulted to null.

  ## Security posture

  Unchanged from 20260618120000: `security definer` + pinned `search_path`, and
  EXECUTE granted to `service_role` only. `drop function` takes the old grants
  with it, and the new function is created with Supabase's default privileges
  (which include `anon`/`authenticated`), so the revoke below is load-bearing —
  advisor lints 0028/0029. The route calls this with the service-role client and
  passes `target_user` from the verified session, never from the request body.
*/

drop function if exists public.claim_pending_enrichment_items (integer);
drop function if exists public.claim_pending_enrichment_items (integer, integer);

create or replace function public.claim_pending_enrichment_items (
  batch_size int default 10,
  per_user_cap int default 3,
  target_user uuid default null
)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select id from (
      select id,
             created_at,
             row_number() over (partition by user_id order by created_at asc) as rn
      from public.items
      where processing_status = 'pending'
        and (target_user is null or user_id = target_user)
    ) s
    -- The per-user cap only means something for a shared (cron) run.
    where target_user is not null or rn <= per_user_cap
    -- Shared runs keep the historical `id` ordering: stable, and it makes
    -- concurrent runs take row locks in the same order. A user-scoped drain
    -- instead takes the newest rows first, because the library's default sort
    -- is most-recent-first — those are the cards on screen while they wait.
    order by (case when target_user is null then null else created_at end) desc nulls last,
             id
    limit batch_size
  ),
  locked as (
    select i.id
    from public.items i
    join candidates c on c.id = i.id
    where i.processing_status = 'pending'
    for update skip locked
  )
  update public.items i
  set processing_status = 'processing'
  from locked l
  where i.id = l.id
  returning i.id;
end;
$$;

revoke all on function public.claim_pending_enrichment_items (integer, integer, uuid)
  from public, anon, authenticated;

grant execute on function public.claim_pending_enrichment_items (integer, integer, uuid)
  to service_role;

/*
  The user-scoped claim filters on `user_id` *and* `processing_status`, then
  orders by `created_at`. `items_processing_pending_idx` is keyed on
  `processing_status` alone, so on a large library that meant scanning every
  pending row in the table to find one user's. Partial on 'pending' only: rows
  in 'processing' are never claim candidates, and keeping them out holds the
  index to the size of the actual backlog.
*/
create index if not exists items_user_pending_created_at_idx
  on public.items (user_id, created_at desc)
  where processing_status = 'pending';
