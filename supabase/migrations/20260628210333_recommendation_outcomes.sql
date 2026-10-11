-- Recommendation outcome log (ADR 0002): tracks shown / saved / dismissed picks per user.
create table public.recommendation_outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null,
  external_id text,
  title_norm text not null,
  outcome text not null,
  dismiss_reason text,
  shown_at timestamptz not null default now(),
  acted_at timestamptz,
  constraint recommendation_outcomes_category_check
    check (category in ('books', 'movies_and_tv')),
  constraint recommendation_outcomes_outcome_check
    check (outcome in ('shown', 'saved', 'dismissed')),
  constraint recommendation_outcomes_dismiss_reason_check
    check (
      dismiss_reason is null
      or dismiss_reason in ('not_my_thing', 'already_seen', 'not_right_now')
    )
);

create index recommendation_outcomes_user_category_idx
  on public.recommendation_outcomes (user_id, category);

create index recommendation_outcomes_user_shown_at_idx
  on public.recommendation_outcomes (user_id, shown_at desc);

alter table public.recommendation_outcomes enable row level security;

create policy recommendation_outcomes_select_own on public.recommendation_outcomes
  for select using (auth.uid() = user_id);

create policy recommendation_outcomes_insert_own on public.recommendation_outcomes
  for insert with check (auth.uid() = user_id);

create policy recommendation_outcomes_update_own on public.recommendation_outcomes
  for update using (auth.uid() = user_id);

create policy recommendation_outcomes_delete_own on public.recommendation_outcomes
  for delete using (auth.uid() = user_id);
