/*
  AI personalization consent on profiles.

  The weekly "shelf letter" can carry a generated recommendation card, and
  generating one sends the profile's item titles and their free-text `verdict`
  notes to an LLM through the Vercel AI Gateway. The interactive deck does that
  only because a signed-in person pressed a button; a weekly cron would do it on
  a schedule nobody triggered. ADR 0002 listed that as an open question.

  This adds the consent flag that closes it. `default false` is the whole point:
  a default-true column would be consent in name only, and every existing row
  backfills to "not consented" rather than silently opting people in.

  Posture matches 20260725120000_profiles_notification_preferences.sql — the
  column joins the narrow client-writable set via a column-level UPDATE grant
  (Supabase's defaults would otherwise let a client rewrite server-owned columns
  such as `unsubscribe_token` or `last_digest_sent_at`).

  Every statement is idempotent and safe to re-run.
*/

-- Column -------------------------------------------------------------------

alter table public.profiles
  add column if not exists ai_personalization_enabled boolean not null default false;

comment on column public.profiles.ai_personalization_enabled is
  'Opt-in consent to send this profile''s item titles and verdict notes to the LLM provider for the weekly letter''s recommendation card. Default false; only the profile owner can change it.';

-- Grants -------------------------------------------------------------------
-- The base migration revoked everything and re-granted UPDATE on the two
-- preference columns; re-issue that grant with the new column included. Without
-- this the Settings toggle would fail with "permission denied for column".

grant update (digest_enabled, digest_day, ai_personalization_enabled)
  on table public.profiles to authenticated;
