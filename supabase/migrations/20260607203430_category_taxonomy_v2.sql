-- A1: Remove 'gifts' from item_category (migrate to 'products').
-- A3: Add 'music', 'videos', 'apps'.
--
-- Postgres cannot drop a single enum value, so we rename the old type,
-- create a new one with the desired values, migrate the column, and drop
-- the old type. The additive values are included in the new definition
-- so both phases land in one migration.

alter type item_category rename to item_category_old;

create type item_category as enum (
  'books',
  'movies_and_tv',
  'restaurants',
  'products',
  'travel',
  'recipes',
  'articles',
  'music',
  'videos',
  'apps'
);

alter table items
  alter column category type item_category
  using (
    case category::text
      when 'gifts' then 'products'
      else category::text
    end::item_category
  );

drop type item_category_old;
