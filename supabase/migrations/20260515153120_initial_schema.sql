/*
  Theque initial schema — synced from docs/data-model.md
  Hosted project already has this applied; this migration keeps the repo aligned.
*/

create extension if not exists pgcrypto;

-- Enums --------------------------------------------------------------------

create type item_category as enum (
  'books',
  'movies_and_tv',
  'restaurants',
  'products',
  'gifts',
  'travel',
  'recipes',
  'articles'
);

create type item_status as enum (
  'inbox',
  'want',
  'planned',
  'done',
  'dismissed'
);

create type item_source as enum (
  'chrome_extension',
  'ios_shortcut',
  'manual',
  'mobile_share_extension'
);

create type processing_status as enum (
  'pending',
  'processing',
  'ready',
  'failed'
);

create type category_source as enum (
  'domain',
  'schema_org',
  'heuristic',
  'manual'
);

-- Tables -------------------------------------------------------------------

create table public.items (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  url text not null,
  canonical_url text not null,
  url_fingerprint text not null,
  domain text not null,
  title text,
  subtitle text,
  description text,
  image_url text,
  image_storage_path text,
  category item_category,
  category_confidence real,
  category_source category_source,
  status item_status not null default 'inbox',
  source item_source not null,
  note text,
  processing_status processing_status not null default 'pending',
  enrichment_error text,
  enrichment_attempts smallint not null default 0,
  enriched_at timestamptz,
  structured jsonb not null default '{}',
  raw_metadata jsonb not null default '{}',
  display jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now (),
  unique (user_id, url_fingerprint)
);

create index items_user_id_status_idx on public.items (user_id, status);
create index items_user_id_category_idx on public.items (user_id, category);
create index items_user_id_created_at_idx on public.items (user_id, created_at desc);

create index items_processing_pending_idx on public.items (processing_status)
  where processing_status in ('pending', 'processing');

create table public.tags (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now (),
  unique (user_id, name)
);

create table public.item_tags (
  item_id uuid not null references public.items (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (item_id, tag_id)
);

create table public.collections (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  cover_image_url text,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  unique (user_id, name)
);

create table public.collection_items (
  collection_id uuid not null references public.collections (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  added_at timestamptz not null default now (),
  primary key (collection_id, item_id)
);

create table public.capture_tokens (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  token_hash text not null,
  token_prefix text not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now (),
  unique (token_hash)
);

-- updated_at triggers ------------------------------------------------------

-- Production has set_updated_at() and items_set_updated_at. The repo file had
-- other names, so a fresh replay failed at 20260618190829 (it alters
-- set_updated_at). Renamed on 2026-10-11 to match production.
create or replace function public.set_updated_at ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger items_set_updated_at
before update on public.items
for each row execute function public.set_updated_at ();

create trigger collections_set_updated_at
before update on public.collections
for each row execute function public.set_updated_at ();

-- RLS ----------------------------------------------------------------------

alter table public.items enable row level security;
alter table public.tags enable row level security;
alter table public.item_tags enable row level security;
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
alter table public.capture_tokens enable row level security;

-- items
create policy items_select_own on public.items
  for select to authenticated
  using (user_id = (select auth.uid ()));

create policy items_insert_own on public.items
  for insert to authenticated
  with check (user_id = (select auth.uid ()));

create policy items_update_own on public.items
  for update to authenticated
  using (user_id = (select auth.uid ()))
  with check (user_id = (select auth.uid ()));

create policy items_delete_own on public.items
  for delete to authenticated
  using (user_id = (select auth.uid ()));

-- tags
create policy tags_select_own on public.tags
  for select to authenticated
  using (user_id = (select auth.uid ()));

create policy tags_insert_own on public.tags
  for insert to authenticated
  with check (user_id = (select auth.uid ()));

create policy tags_update_own on public.tags
  for update to authenticated
  using (user_id = (select auth.uid ()))
  with check (user_id = (select auth.uid ()));

create policy tags_delete_own on public.tags
  for delete to authenticated
  using (user_id = (select auth.uid ()));

-- collections
create policy collections_select_own on public.collections
  for select to authenticated
  using (user_id = (select auth.uid ()));

create policy collections_insert_own on public.collections
  for insert to authenticated
  with check (user_id = (select auth.uid ()));

create policy collections_update_own on public.collections
  for update to authenticated
  using (user_id = (select auth.uid ()))
  with check (user_id = (select auth.uid ()));

create policy collections_delete_own on public.collections
  for delete to authenticated
  using (user_id = (select auth.uid ()));

-- capture_tokens
create policy capture_tokens_select_own on public.capture_tokens
  for select to authenticated
  using (user_id = (select auth.uid ()));

create policy capture_tokens_insert_own on public.capture_tokens
  for insert to authenticated
  with check (user_id = (select auth.uid ()));

create policy capture_tokens_update_own on public.capture_tokens
  for update to authenticated
  using (user_id = (select auth.uid ()))
  with check (user_id = (select auth.uid ()));

create policy capture_tokens_delete_own on public.capture_tokens
  for delete to authenticated
  using (user_id = (select auth.uid ()));

-- item_tags (parent item must belong to user)
create policy item_tags_select on public.item_tags
  for select to authenticated
  using (
    exists (
      select 1 from public.items i
      where i.id = item_tags.item_id and i.user_id = (select auth.uid ())
    )
  );

create policy item_tags_insert on public.item_tags
  for insert to authenticated
  with check (
    exists (
      select 1 from public.items i
      where i.id = item_tags.item_id and i.user_id = (select auth.uid ())
    )
    and exists (
      select 1 from public.tags t
      where t.id = item_tags.tag_id and t.user_id = (select auth.uid ())
    )
  );

create policy item_tags_delete on public.item_tags
  for delete to authenticated
  using (
    exists (
      select 1 from public.items i
      where i.id = item_tags.item_id and i.user_id = (select auth.uid ())
    )
  );

-- collection_items
create policy collection_items_select on public.collection_items
  for select to authenticated
  using (
    exists (
      select 1 from public.collections c
      where c.id = collection_items.collection_id and c.user_id = (select auth.uid ())
    )
    and exists (
      select 1 from public.items i
      where i.id = collection_items.item_id and i.user_id = (select auth.uid ())
    )
  );

create policy collection_items_insert on public.collection_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.collections c
      where c.id = collection_items.collection_id and c.user_id = (select auth.uid ())
    )
    and exists (
      select 1 from public.items i
      where i.id = collection_items.item_id and i.user_id = (select auth.uid ())
    )
  );

create policy collection_items_delete on public.collection_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.collections c
      where c.id = collection_items.collection_id and c.user_id = (select auth.uid ())
    )
  );

-- Storage (private bucket item-images) ------------------------------------

insert into storage.buckets (id, name, public)
values ('item-images', 'item-images', false)
on conflict (id) do nothing;

create policy item_images_read_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'item-images'
    and (storage.foldername (name))[1] = (select auth.uid ())::text
  );

create policy item_images_write_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'item-images'
    and (storage.foldername (name))[1] = (select auth.uid ())::text
  );

create policy item_images_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'item-images'
    and (storage.foldername (name))[1] = (select auth.uid ())::text
  )
  with check (
    bucket_id = 'item-images'
    and (storage.foldername (name))[1] = (select auth.uid ())::text
  );

create policy item_images_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'item-images'
    and (storage.foldername (name))[1] = (select auth.uid ())::text
  );
