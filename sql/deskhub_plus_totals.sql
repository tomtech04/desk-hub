-- PayIt Plus numbers for the desk hub, as five totals and nothing else.
--
-- The hub's read-only role (sql/deskhub_reader_role.sql) can't read the
-- subscriptions table, and this deliberately doesn't change that. It gets one
-- function that returns only: merchants paying now, how many paid this month,
-- what they paid (store price, before Apple's cut), merchants in a free trial,
-- and merchants whose payment is failing. No business ids, no names.
--
-- Left out of every number: comped businesses (businesses.plan_comped, the
-- admin panel's "Comp Plus"), anything that isn't a Production App Store
-- subscription, and the test businesses the hub passes in (its own list of test
-- accounts, the same one it uses to leave them out of sales).
--
-- This changes the production database: it adds a function and one permission.
-- Apply it with:
--   supabase --workdir .supabase-link db query --linked -f "$PWD/sql/deskhub_plus_totals.sql"
-- (from the desk-hub folder; the full path matters, the tool reads -f relative to --workdir)
-- Applied to the production PayIt project on 2026-10-20.
--
-- To remove it:
--   drop function public.deskhub_plus_totals(uuid[], timestamptz);

create or replace function public.deskhub_plus_totals(excluded uuid[], month_start timestamptz)
returns table (paying integer, paid_this_month integer, month_cents bigint, in_trial integer, billing_issues integer)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    (count(*) filter (where s.status in ('active', 'grace_period') and not coalesce(s.in_trial, false)))::integer,
    (count(*) filter (where not coalesce(s.in_trial, false) and s.current_period_started_at >= month_start))::integer,
    coalesce(sum(s.price_cents) filter (where not coalesce(s.in_trial, false) and s.current_period_started_at >= month_start), 0)::bigint,
    (count(*) filter (where coalesce(s.in_trial, false) and s.status = 'active'))::integer,
    (count(*) filter (where s.status = 'billing_retry'))::integer
  from public.store_subscriptions s
  join public.businesses b on b.id = s.business_id
  where s.environment = 'Production'
    and not coalesce(b.plan_comped, false)
    and not (s.business_id = any (coalesce(excluded, '{}'::uuid[])));
$$;

-- Supabase grants new functions in public to anon and authenticated, which would
-- let anyone on the internet call this through the API. Only the hub's role (and
-- the service key, which the hub's fallback uses) may.
revoke all on function public.deskhub_plus_totals(uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.deskhub_plus_totals(uuid[], timestamptz) to deskhub_reader;
