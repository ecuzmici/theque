---
status: accepted
---

# Data for the lab picks: rank order, keep time, reading goal

## Context

On 2026-11-20 the owner picked six prototypes from the idea lab for a real build: release radar, head to head, your year (wrapped), reading diary, taste map and spring cleaning. Four of them only read data. Three choices need storage:

1. Head to head keeps the order that the user picks between two items.
2. Spring cleaning keeps an item when the user taps "Keep".
3. The reading diary keeps a yearly goal.

The prototypes kept all three in `localStorage`. That state is lost on a new device or a new browser.

## Decision

1. **`items.rank_order double precision`, nullable.** The order applies to one user and one category.
   - The sort is `rating_personal` desc, then `rank_order` asc. A low key is a better place.
   - The key of an item with rating R is in the open band (R, R + 1).
   - A new item gets the midpoint between its two neighbours. When the gap is less than 1e-9, the app gives the whole rating block new, even keys.
   - A trigger (`items_clear_rank_order_on_rating`) sets `rank_order` to null when `rating_personal` changes. The item then counts as not placed, and head to head asks about it again.
   - The RPC `set_item_rank_orders` writes a batch of keys in one UPDATE. It checks that each key is in the band of the current rating. When one row does not match, it rolls back the whole batch. It is security invoker, so RLS applies.
   - The rules are in `src/lib/rank/rank-key.ts`.
2. **`items.kept_at timestamptz`, nullable.** "Keep" in spring cleaning sets it to the current time.
   - An item is forgotten when all three conditions are true:
     - Its status is `want`.
     - `created_at` is older than the cutoff.
     - `kept_at` is null or older than the cutoff.
   - So the forgotten age of a kept item starts again from `kept_at`.
   - `src/lib/shelves.ts` holds the rule. The Forgotten shelf, the "N forgotten" count, the stats count, the random pick, the digest and the spring cleaning pass use it.
   - "Let go" sets `status = 'dismissed'` through the item PATCH route, so its side effects still run. That route clears the pin. Undo sets `want` again and pins the item again when it was pinned.
3. **`user_metadata.reading_goal` in Supabase Auth.** The value is a whole number of books from 1 to 500.
   - The diary writes it with `auth.updateUser`. It needs no table and no migration.
   - The goal applies to the current year only. Earlier years show no pace. The app keeps no goal history.

Three migrations add the objects:

- `20261120112219_item_rank_order_kept_at` adds the two columns.
- `20261120165243_item_rank_order_batch` adds the RPC.
- `20261120170943_item_rank_order_clear_on_rating` adds the trigger.

The existing RLS policies on `items` test `user_id` and cover the new columns.

## Consequences

- Head to head and spring cleaning keep their state across devices.
- A rating change makes an item lose its place. The owner must rank it again.
- The goal has no history. A goal for an earlier year is not kept.
- No feature calls an LLM. Release radar calls Hardcover and TMDB, and caches each response for one day.
