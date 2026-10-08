# Theque — Data Model

Postgres on Supabase. All user tables in `public` with **RLS enabled**. Use `auth.uid()` for policies; never trust client-only filtering.

## Enums

```sql
-- Seven live categories. `gifts`, `music`, `apps`, and `videos` are retired from
-- the documented taxonomy (see docs/adr/0004-fewer-shelves-retired-categories.md).
-- Per ADR 0004, retired values may remain dormant in the Postgres enum (nothing
-- writes them once the classifier rules are gone); the live taxonomy is these seven.
create type item_category as enum (
  'books',
  'movies_and_tv',
  'restaurants',
  'products',
  'travel',
  'recipes',
  'articles'
);

create type item_status as enum (
  'inbox',
  'want',
  'planned',
  'done',
  'dismissed'
);

create type item_source as enum (
  'chrome_extension',
  'ios_shortcut',
  'manual',
  'mobile_share_extension'  -- reserved for future
);

create type processing_status as enum (
  'pending',
  'processing',
  'ready',
  'failed'
);

create type category_source as enum (
  'domain',
  'schema_org',
  'heuristic',
  'llm',
  'manual'
);
```

## Tables

### `items`

Central entity. One row per saved URL per user (deduped by fingerprint).

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | `gen_random_uuid()` — aligns with `auth.uid()` |
| `user_id` | `uuid` NOT NULL | FK → `auth.users(id)` ON DELETE CASCADE |
| `url` | `text` NOT NULL | As submitted |
| `canonical_url` | `text` NOT NULL | Normalized for dedup/display |
| `url_fingerprint` | `text` NOT NULL | Hash of canonical URL |
| `domain` | `text` NOT NULL | e.g. `www.imdb.com` |
| `title` | `text` | Nullable until enrichment |
| `subtitle` | `text` | e.g. year, author one-liner |
| `description` | `text` | |
| `image_url` | `text` | Remote URL |
| `image_storage_path` | `text` | Supabase Storage path if proxied |
| `category` | `item_category` | Nullable until classified |
| `category_confidence` | `real` | 0–1 |
| `category_source` | `category_source` | |
| `status` | `item_status` NOT NULL | Default `inbox` |
| `source` | `item_source` NOT NULL | |
| `note` | `text` | User note at capture or later |
| `processing_status` | `processing_status` NOT NULL | Default `pending` |
| `enrichment_error` | `text` | Last error message |
| `enrichment_attempts` | `smallint` NOT NULL | Default 0, max 3 |
| `enriched_at` | `timestamptz` | |
| `structured` | `jsonb` NOT NULL | Default `{}` — category fields |
| `raw_metadata` | `jsonb` NOT NULL | Default `{}` — OG, JSON-LD snapshot plus optional LLM/debug metadata |
| `display` | `jsonb` NOT NULL | Default `{}` — UI overrides |
| `created_at` | `timestamptz` NOT NULL | Default `now()` |
| `updated_at` | `timestamptz` NOT NULL | Default `now()` |

**Constraints**

```sql
unique (user_id, url_fingerprint)
```

**Indexes**

```sql
create index items_user_id_status_idx on items (user_id, status);
create index items_user_id_category_idx on items (user_id, category);
create index items_user_id_created_at_idx on items (user_id, created_at desc);
create index items_processing_pending_idx on items (processing_status)
  where processing_status in ('pending', 'processing');
```

> **Removed tables:** `tags`, `item_tags`, `collections`, and `collection_items` were dropped in
> `20260628120000_taste_loop_focus.sql` (unused — zero rows at decision time). The capture API
> still accepts their legacy request fields as no-ops.

### `capture_tokens`

For Chrome extension, iOS Shortcut, and other capture clients. **Store hash only.**

| Column | Type |
|--------|------|
| `id` | `uuid` PK |
| `user_id` | `uuid` NOT NULL |
| `name` | `text` NOT NULL — e.g. "iPhone Shortcut" |
| `token_hash` | `text` NOT NULL — SHA-256 of secret |
| `token_prefix` | `text` NOT NULL — first 8 chars for UI identification |
| `last_used_at` | `timestamptz` |
| `revoked_at` | `timestamptz` |
| `created_at` | `timestamptz` |

```sql
unique (token_hash)
```

Token format: `bmly_<32 random bytes base64url>`. Show plaintext once on create.

## RLS policies

Enable RLS on all tables. Pattern for user-owned rows:

```sql
-- items: SELECT, INSERT, UPDATE, DELETE
create policy items_select_own on items for select to authenticated
  using (user_id = auth.uid());

create policy items_insert_own on items for insert to authenticated
  with check (user_id = auth.uid());

create policy items_update_own on items for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy items_delete_own on items for delete to authenticated
  using (user_id = auth.uid());
```

Apply the same `user_id = auth.uid()` pattern to `capture_tokens`.

**Capture API note:** Route handlers accept either a web session or a `bmly_...` Bearer token. Token-authenticated requests use the service role only inside server code to insert on behalf of the validated user. Do not expose service role to clients.

## Triggers

```sql
-- updated_at on items
create trigger items_updated_at before update on items
  for each row execute function moddatetime(updated_at);
```

## Storage

Bucket: `item-images` (private)

- Path: `{user_id}/{item_id}/cover.{ext}`
- RLS: user can read/write only their prefix
- Used when proxying remote images

## Dedup behavior

On capture, compute `url_fingerprint` from `canonical_url`. If row exists for `(user_id, url_fingerprint)`:

- Return existing item (`200`, `created: false`)
- Ignore duplicate notes/tags/collections/hints and return the existing row

## Status defaults after enrichment

| Condition | Default `status` |
|-----------|------------------|
| `category_confidence >= 0.6` | `want` |
| else | `inbox` |

User can always override.

## Optional LLM enrichment

The deterministic pipeline remains the default source of truth. When `LLM_ENRICHMENT_ENABLED=true` and AI Gateway auth is present, the enrichment job may call an LLM through the AI Gateway to fill sparse structured fields and can set `category_source = 'llm'` only when the eligibility gate allows a category suggestion. User-set `manual` categories are preserved except for intentionally sparse/blocked metadata recovery paths documented in `docs/category-schemas.md`.

## Realtime

Subscribe to `items` changes for `user_id = auth.uid()` so cards update when `processing_status` → `ready`.
