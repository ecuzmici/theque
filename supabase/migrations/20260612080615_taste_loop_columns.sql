-- Taste-loop and presentation columns
-- items: dominant cover color (hex + hue bucket) for palette sorting and
-- placeholder tinting; personal rating/verdict/done_at to close the loop
-- when an item is marked done.
alter table public.items
  add column if not exists dominant_color text,
  add column if not exists dominant_hue smallint,
  add column if not exists rating_personal smallint
    constraint items_rating_personal_range check (rating_personal between 1 and 5),
  add column if not exists verdict text,
  add column if not exists done_at timestamptz;

-- collections: optional unguessable token enabling a read-only share page.
alter table public.collections
  add column if not exists share_token text;

create unique index if not exists collections_share_token_key
  on public.collections (share_token)
  where share_token is not null;
