-- EPUB file columns for public.items.
-- This migration tracks one uploaded EPUB file per item.
-- The columns hold the Google Drive file id, the file name, the size, the
-- SHA-256 digest, and the upload time.
-- The digest lets the app detect a re-upload of the same file.
-- All columns stay null when the item has no file.
-- The migration only adds objects. It is safe to run two times.

alter table public.items
  add column if not exists file_drive_id text,
  add column if not exists file_name text,
  add column if not exists file_bytes integer
    constraint items_file_bytes_positive check (file_bytes > 0),
  add column if not exists file_sha256 text
    constraint items_file_sha256_hex check (file_sha256 ~ '^[0-9a-fA-F]{64}$'),
  add column if not exists file_uploaded_at timestamptz;

-- The five file columns describe one upload. A row must have all of them or
-- none of them. Existing rows have five nulls, so the constraint accepts them.
-- Postgres has no `add constraint if not exists`, so the guard below keeps the
-- migration idempotent.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.items'::regclass
      and conname = 'items_file_columns_complete'
  ) then
    alter table public.items
      add constraint items_file_columns_complete check (
        num_nonnulls (
          file_drive_id,
          file_name,
          file_bytes,
          file_sha256,
          file_uploaded_at
        ) in (0, 5)
      );
  end if;
end;
$$;

-- The index is partial because almost every item has no file. A partial index
-- indexes only the rows with a file. It stays small, and it does not slow down
-- writes to the rows without a file. It follows the style of
-- `items_processing_pending_idx` in the initial schema.
create index if not exists items_user_id_file_drive_id_idx
  on public.items (user_id)
  where file_drive_id is not null;

-- RLS: `public.items` already has row level security enabled. The policies
-- `items_select_own`, `items_insert_own`, `items_update_own`, and
-- `items_delete_own` test `user_id = (select auth.uid ())`. Postgres RLS
-- filters rows, not columns. The existing policies therefore cover the new
-- columns. This migration adds no policy.
