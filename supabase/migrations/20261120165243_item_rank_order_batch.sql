-- Atomic batch write for items.rank_order (head to head, ADR 0024).
--
-- set_item_rank_orders takes a JSON array of {"id": uuid, "rank_order": number | null}.
-- One UPDATE writes all rows, so a batch applies in full or not at all.
-- A null rank_order clears the key. A number must be in the open band
-- (rating_personal, rating_personal + 1) of a done item. When a row does not
-- match (wrong user, wrong band, not done, unknown id), the function raises
-- an error and Postgres rolls back the whole batch.
--
-- The function is security invoker, so the RLS policies on items apply.
-- Only signed-in users can call it.

create or replace function public.set_item_rank_orders(writes jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  expected integer := jsonb_array_length(writes);
  changed integer;
begin
  update public.items i
     set rank_order = (w.value->>'rank_order')::double precision
    from jsonb_array_elements(writes) w
   where i.id = (w.value->>'id')::uuid
     and i.user_id = (select auth.uid())
     and (
       w.value->>'rank_order' is null
       or (
         i.status = 'done'
         and i.rating_personal is not null
         and (w.value->>'rank_order')::double precision > i.rating_personal
         and (w.value->>'rank_order')::double precision < i.rating_personal + 1
       )
     );
  get diagnostics changed = row_count;
  if changed <> expected then
    raise exception 'rank_order batch rejected: % of % rows match', changed, expected
      using errcode = '22023';
  end if;
  return changed;
end;
$$;

revoke all on function public.set_item_rank_orders(jsonb) from public, anon;
grant execute on function public.set_item_rank_orders(jsonb) to authenticated;
