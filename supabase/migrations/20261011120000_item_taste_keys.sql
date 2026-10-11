-- Taste keys for public.items (ADR 0020).
-- genre_keys holds keys from the fixed genre list of the item category.
-- mood_keys holds keys from the fixed mood list.
-- taste_tagged_at is null until the LLM tagging call has run for the item.
-- The database has no check constraint on the values. The app code validates
-- every write (src/lib/taste/).
-- The migration has no index. A later migration adds a GIN index if the
-- filter becomes slow.
-- The migration only adds objects. It is safe to run two times.

alter table public.items
  add column if not exists genre_keys text[] not null default '{}',
  add column if not exists mood_keys text[] not null default '{}',
  add column if not exists taste_tagged_at timestamptz;

-- RLS: public.items already has row level security enabled. The existing
-- policies test user_id and cover the new columns. This migration adds no
-- policy.
