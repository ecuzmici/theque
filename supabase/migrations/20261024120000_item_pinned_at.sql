-- Pins for public.items.
-- pinned_at is null when the item is not pinned. It holds the pin time when
-- the item is pinned. Pinned items lead the Up next row and sort first on
-- every shelf. The app code keeps 4 pins in each category for each user
-- (src/lib/items/pins.ts). A new pin past the limit unpins the oldest pin of
-- that category. The app code clears the pin when the item becomes
-- done or dismissed.
-- The migration only adds objects. It is safe to run two times.

alter table public.items
  add column if not exists pinned_at timestamptz;

-- RLS: public.items already has row level security enabled. The existing
-- policies test user_id and cover the new column. This migration adds no
-- policy.
