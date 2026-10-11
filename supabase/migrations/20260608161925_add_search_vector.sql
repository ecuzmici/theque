-- E3: Full-text search vector column + GIN index
-- Weights: A=title, B=subtitle, C=description+note, D=domain
alter table items add column search_vector tsvector generated always as (
  setweight(to_tsvector('simple', coalesce(title,'')),'A') ||
  setweight(to_tsvector('simple', coalesce(subtitle,'')),'B') ||
  setweight(to_tsvector('simple', coalesce(description,'')),'C') ||
  setweight(to_tsvector('simple', coalesce(note,'')),'C') ||
  setweight(to_tsvector('simple', coalesce(domain,'')),'D')
) stored;
create index items_search_vector_idx on items using gin (search_vector);
