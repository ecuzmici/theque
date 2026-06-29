# Theque — Category Schemas

`structured` JSONB holds category-specific extracted fields. `raw_metadata` stores the full extraction snapshot (OG tags, JSON-LD array, parser outputs). PoC uses **best-effort** parsing — no strict JSON Schema validation in v0.1.

## Common fields (all categories)

May appear in `structured` when known:

```json
{
  "site_name": "IMDb",
  "original_type": "Movie",
  "rating": 8.8,
  "rating_scale": 10
}
```

## `books`

**Domain hints:** `goodreads.com`, `amazon.com` (books), `storytel.com`

```json
{
  "authors": ["Christopher Paolini"],
  "isbn": "978-0-375-82669-6",
  "published_year": 2023,
  "page_count": 688,
  "average_rating": 4.2,
  "ratings_count": 12000
}
```

**Display subtitle:** `"Paolini · 2023"`

## `movies_and_tv`

**Domain hints:** `imdb.com`, `themoviedb.org`, `letterboxd.com`

```json
{
  "year": 2010,
  "directors": ["Christopher Nolan"],
  "runtime_minutes": 148,
  "genres": ["Action", "Sci-Fi"],
  "media_type": "movie"
}
```

**Display subtitle:** `"Nolan · 2010"`

## `restaurants`

**Domain hints:** `google.com/maps`, `yelp.com`, `tripadvisor.com`

PoC: often sparse without Places API.

```json
{
  "cuisine": "Italian",
  "price_level": "$$",
  "address": "Amsterdam",
  "place_name": "Restaurant Name"
}
```

**Display subtitle:** `"Italian · Amsterdam"` or domain fallback

## `products`

**Domain hints:** `amazon.*`, `etsy.com`, product OG `product:*`

```json
{
  "brand": "Sony",
  "price": { "amount": 299.99, "currency": "EUR" },
  "availability": "in_stock"
}
```

## `travel`

**Domain hints:** booking, airbnb, travel blogs with `TravelAction` schema

```json
{
  "destination": "Kyoto",
  "travel_dates": null,
  "lodging_name": "Ryokan Example"
}
```

## `recipes`

**Domain hints:** schema.org `Recipe`

```json
{
  "author": "Chef Name",
  "prep_time_minutes": 15,
  "cook_time_minutes": 30,
  "yield": "4 servings",
  "ingredients": ["flour", "eggs"]
}
```

## `articles`

Default fallback for news, blogs, magazines.

```json
{
  "author": "Jane Doe",
  "published_at": "2026-01-15T00:00:00Z",
  "reading_time_minutes": 8,
  "publisher": "The Atlantic"
}
```

## `display` overrides (UI)

Separate from `structured` — user or system UI preferences:

```json
{
  "card_aspect": "2/3",
  "title_override": null,
  "image_override_url": null,
  "accent_color": "#1a1a2e"
}
```

**Default aspects by category**

| Category | Aspect |
|----------|--------|
| books | 2/3 |
| movies_and_tv | 2/3 |
| restaurants | 16/9 |
| products | 1/1 |
| recipes | 16/9 |
| articles | 16/9 |
| travel | 16/9 |

## Classifier output

```json
{
  "category": "movies_and_tv",
  "category_confidence": 0.95,
  "category_source": "domain"
}
```

Written to item columns, not inside `structured`. `category_source` may be
`domain`, `schema_org`, `heuristic`, `manual`, or `llm`.

## `raw_metadata` shape

```json
{
  "fetched_at": "ISO8601",
  "final_url": "https://...",
  "status_code": 200,
  "open_graph": { "og:title": "...", "og:image": "..." },
  "twitter": {},
  "json_ld": [{ "@type": "Movie", "name": "..." }],
  "parser": "imdb"
}
```

### `raw_metadata.llm`

When LLM enrichment is enabled, Theque records the Gemini attempt for debugging.
Gemini normally enriches fields for the deterministic category. When
deterministic evidence is weak, blocked, or sparse, Gemini may also return a
validated category suggestion. If the suggestion is applied, the item columns are
updated with `category_source: "llm"`.

Manual categories are protected unless the item has no useful metadata: weak or
missing title, missing description and image, empty structured fields, and
blocked/sparse fetch evidence.

```json
{
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "status": "enhanced",
  "confidence": 0.82,
  "sources": ["open_graph", "json_ld"],
  "returned_fields": ["authors", "published_year"],
  "category_suggestion": {
    "category": "restaurants",
    "confidence": 0.78,
    "allowed": true,
    "applied": true,
    "reason": "blocked_or_sparse_fetch"
  },
  "enriched_at": "2026-05-16T00:00:00.000Z"
}
```

### `raw_metadata.ai_review`

When a user clicks `Enrich with AI`, Gemini can propose a full metadata rewrite
for the item, including category changes. The proposal is shown to the user
before any data is written. If the user accepts it, Theque records the accepted
proposal in `raw_metadata.ai_review`.

```json
{
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "status": "accepted",
  "accepted_fields": [
    "category",
    "category_confidence",
    "category_source",
    "title",
    "structured"
  ],
  "proposal": {
    "category": "books",
    "category_confidence": 0.93,
    "title": "A Drop of Corruption",
    "subtitle": null,
    "description": "A detective fantasy sequel.",
    "image_url": "https://...",
    "structured": {
      "authors": ["Robert Jackson Bennett"]
    },
    "confidence": 0.88,
    "sources": ["url"],
    "notes": "Amazon Kindle listing"
  },
  "accepted_at": "2026-05-16T00:00:00.000Z"
}
```

## LLM Rollout

Roll out Gemini enrichment conservatively:

```text
1. Local only with LLM_ENRICHMENT_ENABLED=true.
2. Production deploy with LLM_ENRICHMENT_ENABLED=false.
3. Enable only after local QA on sparse pages from docs/qa-checklist.md.
4. Review raw_metadata.llm on real items before broadening usage.
```
