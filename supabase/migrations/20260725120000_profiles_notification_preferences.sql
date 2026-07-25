/*
  Profiles + notification preferences.

  Until now a thèque user was a bare `auth.users` row: there was nowhere to
  store an email preference, an unsubscribe flag, or a send cadence, which
  blocks the weekly "shelf letter". This adds `public.profiles` — exactly one
  row per auth user, created by trigger (never by the client), carrying the
  denormalized email plus the digest preferences.

  Security posture matches the enrichment RPC migrations: SECURITY DEFINER
  functions with a pinned search_path, `revoke ... from public/anon/authenticated`
  followed by explicit grants. Clients get SELECT on their own row and UPDATE on
  the two preference columns only — `email`, `unsubscribe_token` and
  `last_digest_sent_at` are server-owned and not client-writable.

  Every statement is idempotent and safe to re-run.
*/

-- Table --------------------------------------------------------------------

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Denormalized from auth.users so the digest job never has to read the auth
  -- schema; kept in sync by the update trigger below.
  email text,
  digest_enabled boolean not null default true,
  -- 0 = Sunday … 6 = Saturday, matching JavaScript's Date#getUTCDay().
  digest_day smallint not null default 0
    constraint profiles_digest_day_range check (digest_day between 0 and 6),
  -- 24 random bytes, hex-encoded: 192 bits of entropy and URL-safe without
  -- escaping (base64 would need +/= handling in the one-click unsubscribe link).
  unsubscribe_token text not null unique default encode(gen_random_bytes (24), 'hex'),
  last_digest_sent_at timestamptz,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

-- The digest job scans "who is due today"; only enabled profiles are eligible.
create index if not exists profiles_digest_due_idx
  on public.profiles (digest_day, last_digest_sent_at)
  where digest_enabled;

-- updated_at trigger -------------------------------------------------------

drop trigger if exists profiles_updated_at on public.profiles;

create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at ();

-- RLS ----------------------------------------------------------------------

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid ()));

drop policy if exists profiles_update_own on public.profiles;

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid ()))
  with check (user_id = (select auth.uid ()));

-- Deliberately no insert policy for `authenticated`: rows are created only by
-- handle_new_user() (SECURITY DEFINER), so a client cannot forge a profile for
-- another user id or mint its own unsubscribe token.

-- Grants -------------------------------------------------------------------
-- Supabase's default privileges hand `anon`/`authenticated` full DML on new
-- public tables; strip that and re-grant the narrow surface the app needs.

revoke all on table public.profiles from public, anon, authenticated;

grant select on table public.profiles to authenticated;

grant update (digest_enabled, digest_day) on table public.profiles to authenticated;

grant all on table public.profiles to service_role;

-- auth.users triggers ------------------------------------------------------

create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
exception
  -- Never let a profile write abort the signup transaction. An exception in an
  -- AFTER INSERT trigger on auth.users rolls the whole thing back, which
  -- surfaces to the user as an opaque "Database error saving new user" and
  -- makes the product unregisterable. A missing profile row is recoverable
  -- (the backfill below is re-runnable, and the accessors fall back to
  -- DEFAULT_DIGEST_PREFERENCES); a broken signup is not.
  when others then
    raise warning 'handle_new_user: profile insert failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

revoke all on function public.handle_new_user () from public, anon, authenticated;

create or replace function public.handle_user_email_change ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do update set email = excluded.email;
  return new;
exception
  -- Same reasoning as handle_new_user: an email change must never fail because
  -- the denormalized copy could not be written. The digest job tolerates a
  -- stale address far better than the user tolerates a broken email change.
  when others then
    raise warning 'handle_user_email_change: profile sync failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

revoke all on function public.handle_user_email_change ()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user ();

drop trigger if exists on_auth_user_email_updated on auth.users;

create trigger on_auth_user_email_updated
after update of email on auth.users
for each row
when (new.email is distinct from old.email)
execute function public.handle_user_email_change ();

-- Backfill -----------------------------------------------------------------

insert into public.profiles (user_id, email)
select u.id, u.email
from auth.users u
on conflict (user_id) do nothing;
