-- Evaluate auth.uid() one time per query, not one time per row
-- (Supabase advisor auth_rls_initplan). Limit the recommendation_outcomes
-- policies to the authenticated role, and add the missing with check on its
-- update policy. Index the capture_tokens foreign key.
-- Applied to production with the Supabase MCP tool on 2026-10-11.

alter policy items_select_own on public.items
  using (user_id = (select auth.uid()));
alter policy items_insert_own on public.items
  with check (user_id = (select auth.uid()));
alter policy items_update_own on public.items
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy items_delete_own on public.items
  using (user_id = (select auth.uid()));

alter policy capture_tokens_select_own on public.capture_tokens
  using (user_id = (select auth.uid()));
alter policy capture_tokens_insert_own on public.capture_tokens
  with check (user_id = (select auth.uid()));
alter policy capture_tokens_update_own on public.capture_tokens
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy capture_tokens_delete_own on public.capture_tokens
  using (user_id = (select auth.uid()));

alter policy recommendation_outcomes_select_own on public.recommendation_outcomes
  to authenticated using (user_id = (select auth.uid()));
alter policy recommendation_outcomes_insert_own on public.recommendation_outcomes
  to authenticated with check (user_id = (select auth.uid()));
alter policy recommendation_outcomes_update_own on public.recommendation_outcomes
  to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy recommendation_outcomes_delete_own on public.recommendation_outcomes
  to authenticated using (user_id = (select auth.uid()));

create index if not exists capture_tokens_user_id_idx on public.capture_tokens (user_id);
