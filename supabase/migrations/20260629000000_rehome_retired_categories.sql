-- ADR 0004: retire the `music`, `apps`, and `videos` categories and re-home
-- their existing rows to a surviving category so nothing is orphaned.
--
--   music → articles
--   apps  → products
--   videos → (none exist)
--
-- Only the `category` column is touched: `status` (including `done`) and the
-- verdict columns (`rating_personal`, `verdict`, `done_at`) are preserved.
--
-- Per ADR 0004 the `item_category` enum values are left DORMANT in Postgres
-- (the classifier no longer emits them and the TypeScript union drops them);
-- physically dropping the enum values is an optional follow-up, out of scope.

update public.items set category = 'articles' where category = 'music';
update public.items set category = 'products' where category = 'apps';
