-- Clear items.rank_order when rating_personal changes (head to head, ADR 0024).
--
-- A head-to-head key is valid only inside the band of the rating it was
-- ranked under. When the rating changes, this trigger sets rank_order to
-- null. Without it, an old key can become valid again when the user sets
-- the old rating back, and it can tie with a newer key.
-- The migration only adds objects. It is safe to run two times.

create or replace function public.clear_rank_order_on_rating_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.rating_personal is distinct from old.rating_personal then
    new.rank_order := null;
  end if;
  return new;
end;
$$;

create or replace trigger items_clear_rank_order_on_rating
  before update of rating_personal on public.items
  for each row
  execute function public.clear_rank_order_on_rating_change();
