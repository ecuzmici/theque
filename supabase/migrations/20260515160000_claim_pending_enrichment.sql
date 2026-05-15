/*
  Atomically claim pending enrichment rows for cron / worker fan-out.
*/

create or replace function public.claim_pending_enrichment_items (batch_size int default 10)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with cte as (
    select id
    from public.items
    where processing_status = 'pending'
    order by created_at asc
    limit batch_size
    for update skip locked
  )
  update public.items i
  set processing_status = 'processing'
  from cte
  where i.id = cte.id
  returning i.id;
end;
$$;

revoke all on function public.claim_pending_enrichment_items (integer) from public;

grant execute on function public.claim_pending_enrichment_items (integer) to service_role;
