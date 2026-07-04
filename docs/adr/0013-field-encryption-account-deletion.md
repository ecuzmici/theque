---
status: accepted
---

# Encrypt user-authored text at the application layer + add account deletion

Opening the Supabase dashboard today shows every user's saved items in plaintext —
including the two fields users *write themselves*: the free-text `note` on an item and
the free-text `verdict` they give when marking something done. Those are the highest
PII-density fields in the product ("re-read after the breakup"), and the operator being
able to casually read them contradicts the private-library positioning.

Honest framing that bounds this ADR: Supabase already encrypts at rest (disk-level), and
GDPR does not forbid the controller from being able to process user data — the goals here
are **privacy by design (Art. 25)**: ciphertext in the dashboard, in SQL dumps, and in
backups for the fields that carry real personal text, plus **right to erasure (Art. 17)**:
a self-service "delete my account". True zero-knowledge E2EE is explicitly rejected (see
Rejected alternatives): the server must read URLs to enrich, titles to classify/recommend,
and items to send the weekly digest while the user is offline. The realistic guarantee is:
*the operator can't casually see it, and a DB/dashboard/backup leak reveals ciphertext;
the app's server code, holding the key, keeps working.*

## Decisions

### A. Application-layer field encryption for `items.note` and `items.verdict`

- **Mechanism:** AES-256-GCM in Next.js server code via `node:crypto` (Supabase has
  deprecated in-database pgsodium/TCE and recommends app-layer encryption). New module
  `src/lib/crypto/field-crypto.ts`, guarded with `import "server-only"` so it can never
  reach a client bundle.
- **Wire format:** values stored in the *same* text columns as
  `enc.v1.<iv>.<ciphertext>.<tag>` (base64url segments). The `v1` version prefix gives
  key rotation for free later (`enc.v2.` tried against a newer key).
- **Key:** `FIELD_ENCRYPTION_KEY` env var — base64, 32 bytes (`openssl rand -base64 32`).
  Add to `.env.local.example` (placeholder only), `.env.local`, and Vercel production env.
  Losing the key means losing note/verdict contents — say so in `.env.local.example`.
- **Dual-read = the no-breakage guarantee:** `decryptField()` returns values without the
  `enc.` prefix untouched (legacy plaintext passthrough); throws on a malformed or
  undecryptable `enc.*` value (surface corruption, never render ciphertext as content).
  Writes always encrypt. Existing rows therefore keep working on day one; the backfill
  is safe to run any time and re-run.
- **Scope is exactly `note` and `verdict`.** Titles, URLs, descriptions, and `structured`
  stay plaintext — they feed enrichment, classification, resolvers, dedup, the
  client-side grid, realtime, and the FTS index (see Rejected alternatives).

**Write sites (encrypt before insert/update):**

- `PATCH /api/items/[id]` — the single route through which note edits
  (`ItemEditSheet` → `ItemDetail` fetch) and verdict/rating saves
  (`ItemMarkDoneDialog` via `LibraryItemsSection.onSave`) already flow.
- `POST /api/capture` — the extension popup sends an optional note with the captured URL.
- `POST /api/items` (manual add) — if it accepts a note field, encrypt there too.
- Audit for any other route writing `note`/`verdict` before closing the issue.

**Read boundaries (decrypt before returning/rendering):** one shared helper, e.g.
`decryptItemFields(row)`, applied at every server boundary that hands items to the UI:

- `src/app/(app)/item/[id]/page.tsx` (server-rendered detail page).
- `GET` and `PATCH` responses in `/api/items/[id]` and the `GET /api/items` list/search route.
- The library page's server-side initial load (`fetchLibraryItemsForShelf`).
- `src/lib/recommend/taste-profile.ts` (verdict text feeds the recommendation prompt).
- The digest job needs **no change** — verified it reads neither field.

**The one real refactor — client-direct reads.** `LIBRARY_ITEM_SUMMARY_SELECT`
(`src/lib/library-items-for-shelf.ts`) includes `verdict`, and the library card renders
the verdict quote (`ItemCardVerdictControl.tsx` line ~68). Two client paths currently
receive raw rows straight from PostgREST and would show ciphertext:

1. **Client refetches** in `LibraryPageClient` (sort/shelf changes): route them through a
   server endpoint instead — extend `GET /api/items` with the shelf/sort parameters so it
   reuses `fetchLibraryItemsForShelf` server-side and decrypts. The browser stops querying
   `items` directly for summaries.
2. **Realtime** (`useItemRealtime`): keep using the payload row for *shelf-membership*
   decisions (`itemMatchesShelf` needs only status/category — plaintext), but never render
   `note`/`verdict` from a realtime payload; when a displayed item's content changes,
   refetch it via `GET /api/items/[id]` (which decrypts).

RLS is unchanged — encryption is a second layer on top of it, not a replacement.

**Search index migration.** `search_vector` is a *generated* column that currently
indexes `note`; left alone it would index ciphertext. New migration: drop and regenerate
`search_vector` **without the `note` term** (title/subtitle/description/domain weights
unchanged), recreate the GIN index. This is also a privacy statement — private notes are
no longer in any index. Known UX change: search stops matching note text; acceptable.

**Backfill.** `scripts/backfill-field-encryption.mjs`: service-role client from
`.env.local`, batches of ~100, `where note is not null and note not like 'enc.%'` (same
for verdict), updates in place, idempotent, prints only counts — never values. Run once
after deploy; prod is currently tiny so this is instant.

**Hygiene:** never log decrypted values or ciphertext internals; `enrichment_error` and
any debug output must not embed note/verdict.

### B. Account deletion (Settings → Danger zone)

- **UI:** a "Danger zone" section at the bottom of `src/app/(app)/settings/page.tsx`,
  visually separated, with a destructive-variant `<Button />` (keeps the coarse-pointer
  hit-target policy). Clicking opens a confirmation dialog that (a) lists exactly what is
  deleted — saved items, collections and their share links, capture tokens, recommendation
  history, cached cover images, the account itself — (b) states it is immediate and
  irreversible, and (c) requires typing `delete` to enable the confirm button.
- **API:** `POST /api/account/delete`, body `{ confirm: "delete" }`.
  1. Resolve the user from the **session** (server client). Never accept a user id from
     the body. Reject without a valid session or exact confirmation string.
  2. With the admin client (`src/lib/supabase/admin.ts`, service role, server-only):
     list and remove all objects in the `item-images` bucket under the `<userId>/` prefix
     (paginate in batches of ~100 until empty — the bucket is public, keyed by
     unguessable ids, so purging covers matters).
  3. `admin.auth.admin.deleteUser(userId)` — every user table (`items`, `tags`,
     `item_tags`, `collections` → `collection_items`, `capture_tokens`,
     `recommendation_outcomes`) references `auth.users` with `on delete cascade`, so one
     call erases the lot. Share pages 404 and capture tokens 401 automatically.
  4. Sign out (clear Supabase cookies) and have the client redirect to `/login?deleted=1`,
     which shows a calm one-line confirmation.
- Order matters: storage purge **before** `deleteUser`, since the storage prefix is
  derived from a user id that must still be resolvable if the purge needs retrying.
  If the storage purge partially fails, still proceed with `deleteUser` and report the
  orphaned-file count in the response (rows referencing the files are gone either way);
  log object *counts*, never paths with ids.

## Rollout order

1. Ship A's code (crypto lib + tests, encrypt-on-write, decrypt boundaries, client-refetch
   reroute, search-vector migration) — dual-read means it deploys safely against existing
   plaintext rows.
2. Set `FIELD_ENCRYPTION_KEY` in Vercel before merging; deploy; run the backfill script.
3. Ship B (independent of A; can land in the same PR or after).
4. Rollback story: decrypt-on-read keeps working if encryption of new writes is disabled;
   rows already encrypted remain readable as long as the key stays set. Do not rotate or
   remove the key as a rollback step.

## Acceptance criteria

- Supabase table editor shows `enc.v1.…` for note/verdict on any row written or
  backfilled after deploy; the app renders the plaintext everywhere it did before
  (detail page, edit sheet, verdict quote on library cards, after sort changes, after a
  realtime update, in recommendations).
- A pre-existing plaintext row still renders correctly *before* the backfill runs.
- Search still matches titles/descriptions/domains; no longer matches note text; no test
  or query references the old `search_vector` definition.
- Tampered ciphertext fails closed (error state, not garbled render).
- `npm test` green, including new unit tests: roundtrip, tamper detection (GCM auth tag),
  legacy passthrough, null/empty handling, missing-key behavior.
- Deleting an account: signs the user out, removes all rows across the cascade tables,
  empties `item-images/<userId>/`, invalidates capture tokens and share links, and the
  email can immediately re-register as a fresh empty account.

## Rejected alternatives

- **Full E2EE / zero-knowledge (client-held keys):** breaks enrichment (server fetches the
  URL), recommendations (titles/verdicts go to the LLM server-side), the weekly digest
  (server reads items with no user present), share pages, and extension capture. Would
  require re-architecting the product around client-side processing. Rejected.
- **Encrypting titles/URLs/descriptions now:** kills FTS search, dedup-by-fingerprint
  interplay, client grid reads, and realtime for marginal gain — the operator still holds
  the key. Revisit post-launch only on real user demand ("Tier 2").
- **pgsodium / Transparent Column Encryption in Postgres:** deprecated by Supabase;
  key-exposure footguns; app-layer is their recommended path.
- **Doing nothing (rely on disk encryption + RLS):** leaves users' most personal free text
  readable in every dashboard session, SQL export, and backup. Rejected as inconsistent
  with the product's promise.

## Follow-ups (not in scope here)

- Privacy-policy copy: mention self-service deletion and disclose that titles/verdict text
  are sent to the LLM for recommendations (closes the open consent question from ADR 0002).
- Clear `raw_metadata` after successful enrichment (data minimization; separate small issue).
- Key rotation runbook (`enc.v2.`) once there are meaningful numbers of users.
