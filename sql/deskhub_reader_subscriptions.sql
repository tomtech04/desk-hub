-- Lets the desk hub's read-only role (sql/deskhub_reader_role.sql) count PayIt
-- Plus subscriptions: how many merchants pay, and what they paid this month.
-- For a hub whose deskhub_reader role already exists; a fresh setup gets the
-- same lines from deskhub_reader_role.sql.
--
-- Same rules as the rest of the role: SELECT only, only the columns the hub
-- sums, no store transaction ids. Like the role itself this changes the
-- production database, so apply it only with the PayIt team's sign-off:
--   supabase db query --linked -f sql/deskhub_reader_subscriptions.sql
--
-- To remove it:
--   drop policy deskhub_reader_select on public.store_subscriptions;
--   revoke select on public.store_subscriptions from deskhub_reader;

grant select (business_id, environment, status, in_trial, price_cents, current_period_started_at)
  on public.store_subscriptions to deskhub_reader;

create policy deskhub_reader_select on public.store_subscriptions
  for select to deskhub_reader using (true);
