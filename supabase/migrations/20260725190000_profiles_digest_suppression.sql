/*
  Deliverability suppression for the weekly letter (bounces and complaints).

  Nothing consumed Resend webhooks, so a hard-bouncing address was retried every
  cycle forever and a spam complaint changed nothing at all. On a young sending
  domain with `p=quarantine` DMARC that is the fastest way to wreck delivery for
  every other profile, because reputation is shared across the whole domain.

  The columns here are deliberately NOT a second copy of `digest_enabled`:

    digest_enabled            — the user's stated preference. Client-writable.
    digest_suppressed_at      — a server-owned fact about the address. Not.

  Conflating them would make a bounce look like the user turned the letter off,
  make the Settings toggle display a lie, and let a user "re-enable" their way
  back into bouncing at the domain's expense.

  Security posture matches 20260725120000_profiles_notification_preferences.sql
  and 20260725170000_profiles_ai_personalization_consent.sql: the base migration
  did `revoke all ... from public, anon, authenticated` and then re-granted a
  narrow column-level UPDATE, so every migration that adds a column has to
  re-issue that grant. The grant below is re-issued **without** the new columns,
  which is what keeps them server-owned: `authenticated` can still SELECT them
  (Settings explains the suppression) but can never write them.

  Every statement is idempotent and safe to re-run.
*/

-- Suppression columns ------------------------------------------------------

alter table public.profiles
  add column if not exists digest_suppressed_at timestamptz;

comment on column public.profiles.digest_suppressed_at is
  'Server-owned: when the weekly letter stopped being deliverable to this address (hard bounce, spam complaint, or repeated soft bounces). Null means deliverable. Distinct from digest_enabled, which is the user''s own preference.';

alter table public.profiles
  add column if not exists digest_suppression_reason text;

comment on column public.profiles.digest_suppression_reason is
  'Server-owned: why the address was suppressed. One of hard_bounce, complaint, repeated_soft_bounce. Null when digest_suppressed_at is null.';

alter table public.profiles
  add column if not exists digest_soft_bounce_count smallint not null default 0;

comment on column public.profiles.digest_soft_bounce_count is
  'Server-owned: consecutive transient bounces with no delivery in between. Reset to 0 by an email.delivered webhook so a mailbox that was briefly full does not accumulate its way to suppression over months.';

-- A tiny closed vocabulary, checked in the database as well as in TypeScript,
-- so a future writer cannot invent a reason the Settings copy has no words for.
-- `not valid` is avoided deliberately: the column is new, so every existing row
-- is null and the constraint validates instantly.
alter table public.profiles
  drop constraint if exists profiles_digest_suppression_reason_check;

alter table public.profiles
  add constraint profiles_digest_suppression_reason_check check (
    digest_suppression_reason is null
    or digest_suppression_reason in ('hard_bounce', 'complaint', 'repeated_soft_bounce')
  );

-- Grants -------------------------------------------------------------------
-- Re-issue the column-level UPDATE grant established by the base migration.
-- The three columns above are intentionally absent: they are written only by
-- the service-role webhook handler. `grant select` from the base migration is
-- unchanged and still covers them, so Settings can read and explain the state.

grant update (digest_enabled, digest_day, ai_personalization_enabled)
  on table public.profiles to authenticated;

-- Webhook de-duplication ---------------------------------------------------
-- Svix retries a failed delivery with the same `svix-id` (and a fresh
-- timestamp, which is why replay protection and de-duplication have to be two
-- different mechanisms). Suppression is naturally idempotent, but incrementing
-- digest_soft_bounce_count is not — a redelivered event would count twice and
-- walk a healthy address towards suppression. This table is the claim check:
-- the handler inserts the id first and only acts if the insert won.

create table if not exists public.email_webhook_events (
  svix_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now ()
);

comment on table public.email_webhook_events is
  'Claim checks for processed Resend/Svix webhook deliveries, keyed on svix-id. Service-role only; exists purely to make non-idempotent handling (the soft-bounce counter) exactly-once.';

-- Only ever scanned for pruning old rows; the primary key serves the dedupe.
create index if not exists email_webhook_events_received_at_idx
  on public.email_webhook_events (received_at);

alter table public.email_webhook_events enable row level security;

-- No policies at all: with RLS on and nothing granted, `anon` and
-- `authenticated` cannot see or write a single row. Only the service-role
-- webhook handler touches this table, and service_role bypasses RLS.
revoke all on table public.email_webhook_events from public, anon, authenticated;

grant all on table public.email_webhook_events to service_role;
