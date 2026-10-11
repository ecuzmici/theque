-- Taste-loop focus: drop planned status, tags, collections, and sharing.
-- Data at decision time: 0 tag/collection rows, 2 planned items → safe to hard-delete.

-- Fold planned into want before recreating the status enum.
update public.items
set status = 'want'
where status = 'planned';

alter type item_status rename to item_status_old;

create type item_status as enum (
  'inbox',
  'want',
  'done',
  'dismissed'
);

alter table public.items
  alter column status drop default;

alter table public.items
  alter column status type item_status
  using status::text::item_status;

alter table public.items
  alter column status set default 'inbox'::item_status;

drop type item_status_old;

-- Drop grouping tables (empty at migration time).
drop table if exists public.collection_items;
drop table if exists public.item_tags;
drop table if exists public.collections;
drop table if exists public.tags;
