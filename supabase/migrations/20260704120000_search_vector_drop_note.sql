-- ADR 0013: `note` is about to be encrypted at rest (enc.v1.* ciphertext), so it
-- must no longer feed the full-text index. Drop and regenerate `search_vector`
-- without the `note` term; title/subtitle/description/domain weights unchanged.
-- Accepted UX change: search stops matching note text.
drop index if exists items_search_vector_idx;
alter table items drop column if exists search_vector;

-- Weights: A=title, B=subtitle, C=description, D=domain
alter table items add column search_vector tsvector generated always as (
  setweight(to_tsvector('simple', coalesce(title,'')),'A') ||
  setweight(to_tsvector('simple', coalesce(subtitle,'')),'B') ||
  setweight(to_tsvector('simple', coalesce(description,'')),'C') ||
  setweight(to_tsvector('simple', coalesce(domain,'')),'D')
) stored;

create index items_search_vector_idx on items using gin (search_vector);
