/*
  Rewrite claim_pending_enrichment_items to cap rows per user per batch.
  A window-function partitioned by user_id selects at most `per_user_cap`
  items per user before the global `batch_size` limit, preventing one user
  from starving others in a cron run.

  The candidate CTE separates window-function selection from the FOR UPDATE
  lock because Postgres forbids window functions in the same query as
  FOR UPDATE.
*/

create or replace function public.claim_pending_enrichment_items(
  batch_size int default 10,
  per_user_cap int default 3
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
             row_number() over (partition by user_id order by created_at asc) as rn
      from public.items
      where processing_status = 'pending'
    ) s
    where rn <= per_user_cap
    order by id
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

revoke all on function public.claim_pending_enrichment_items(integer, integer) from public;

grant execute on function public.claim_pending_enrichment_items(integer, integer) to service_role;
