-- Head to head order and spring cleaning "keep" time for public.items.
-- See docs/adr/0024-lab-picks-data-choices.md.
--
-- rank_order is null when the user did not rank the item. It holds the
-- position of the item in the user's order for its category. A lower value
-- ranks higher. A new item gets the midpoint between its two neighbours.
--
-- kept_at is null when the user did not keep the item in spring cleaning.
-- It holds the time of the last "Keep". The forgotten age of the item
-- starts again from kept_at.
--
-- The migration only adds objects. It is safe to run two times.

alter table public.items
  add column if not exists rank_order double precision,
  add column if not exists kept_at timestamptz;

-- RLS: public.items already has row level security enabled. The existing
-- policies test user_id and cover the new columns. This migration adds no
-- policy.
