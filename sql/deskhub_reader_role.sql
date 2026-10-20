-- A read-only Postgres login for the desk hub (a Raspberry Pi dashboard on
-- Tomas's desk), so it can show today's sales and system status without
-- holding the service-role key.
--
-- Least privilege, column by column: the hub needs amounts and statuses to
-- sum, which business a payment belongs to (to leave out team/test
-- businesses, same rule as PayIt's admin panel), and the hourly system
-- checks. Nothing that identifies a customer, no auth schema, no writes.
--
-- This file lives in the desk hub's own repo on purpose. It is NOT a PayIt
-- migration and is never added to PayIt's repo or migration history: it only
-- adds one role plus SELECT-only policies for that role, and changes nothing
-- any existing role can see or do. Because it does change the production
-- database, apply it only with the PayIt team's sign-off
-- (scripts/setup-readonly-db.sh asks before doing anything).
--
-- To remove it completely:
--   drop policy deskhub_reader_select on public.payments;
--   drop policy deskhub_reader_select on public.businesses;
--   drop policy deskhub_reader_select on public.admin_system_checks;
--   drop policy deskhub_reader_select on public.admin_ignored_transactions;
--   drop owned by deskhub_reader; drop role deskhub_reader;
--
-- The password is deliberately NOT set here, since this file is committed to
-- git. It is set once, out of band:
--   alter role deskhub_reader with password '<generated>';
-- Until then the role exists but cannot log in.

create role deskhub_reader with login nosuperuser nocreatedb nocreaterole noinherit nobypassrls noreplication;

-- Belt and braces: every session starts read-only and can't run away with
-- the database. (A session could still opt back out of read-only, which is
-- why the grants below are the real boundary, not this.)
alter role deskhub_reader set default_transaction_read_only = on;
alter role deskhub_reader set statement_timeout = '15s';

grant usage on schema public to deskhub_reader;

grant select (id, transaction_id, business_id, provider, status, amount_cents, created_at)
  on public.payments to deskhub_reader;
grant select (id, owner_id, created_at)
  on public.businesses to deskhub_reader;
grant select (system, status, detail, checked_at)
  on public.admin_system_checks to deskhub_reader;
grant select (transaction_id)
  on public.admin_ignored_transactions to deskhub_reader;

-- All four tables have RLS enabled, and their existing policies are written
-- for anon/authenticated (or, for the admin tables, don't exist at all), so
-- the grants above alone would return zero rows. These policies apply only
-- to deskhub_reader and only to SELECT; the column grants still limit what
-- it can see within each row.
create policy deskhub_reader_select on public.payments
  for select to deskhub_reader using (true);
create policy deskhub_reader_select on public.businesses
  for select to deskhub_reader using (true);
create policy deskhub_reader_select on public.admin_system_checks
  for select to deskhub_reader using (true);
create policy deskhub_reader_select on public.admin_ignored_transactions
  for select to deskhub_reader using (true);
