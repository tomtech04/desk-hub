// PayIt stats from Supabase, read-only. The credential never leaves the Pi; the
// screen sees totals plus the latest few payments as amount, method, status and
// time, never who paid or which business.
//
// Preferred: PAYIT_DATABASE_URL, a Postgres login as `deskhub_reader` — a role
// that can SELECT only the columns used below (sql/deskhub_reader_role.sql). Fallback: the service-role key
// over PostgREST, which works but can read and write everything.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ROOT, TZ, fetchJson, startOfDay, tzOffset, zonedToUtc } from './util.js';

const DATABASE_URL = process.env.PAYIT_DATABASE_URL;
const URL_BASE = process.env.SUPABASE_URL?.replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
// Mirrors the PayIt admin panel's reporting rules: any
// business owned by a team/test account is left out of revenue, as is any
// transaction marked ignored in admin_ignored_transactions. The read-only role
// can't look users up by email, so it takes the owners' user ids directly.
const TEST_OWNER_IDS = list(process.env.PAYIT_TEST_OWNER_IDS);
const TEST_EMAILS = list(process.env.PAYIT_TEST_ACCOUNT_EMAILS);
const EXTRA_EXCLUDED = list(process.env.PAYIT_EXCLUDE_BUSINESS_IDS);
// Payment methods left out of every PayIt number on the hub. Cash by default: it's
// recorded by hand at the counter and never goes through the platform.
const EXCLUDED_PROVIDERS = new Set(list(process.env.PAYIT_EXCLUDE_PROVIDERS ?? 'cash').map((p) => p.toLowerCase()));

export const payitConfigured = Boolean(DATABASE_URL || (URL_BASE && KEY));
export const payitMode = DATABASE_URL ? 'read-only role' : URL_BASE && KEY ? 'service key' : 'off';

// --- Postgres as deskhub_reader -------------------------------------------

function pgSource() {
  const pool = new pg.Pool({
    connectionString: DATABASE_URL.replace(/[?&]sslmode=[^&]*/, ''),
    // Supabase's pooler presents a certificate from Supabase's own CA, not a
    // public one; verify against it rather than turning verification off.
    ssl: { ca: fs.readFileSync(path.join(ROOT, 'server/supabase-ca.pem'), 'utf8') },
    max: 2,
    idleTimeoutMillis: 30e3,
    connectionTimeoutMillis: 10e3,
  });
  pool.on('error', (err) => console.error('[payit] pool:', err.message));
  const q = async (sql, params) => (await pool.query(sql, params)).rows;
  const iso = (rows, key) => rows.map((r) => ({ ...r, [key]: r[key]?.toISOString() ?? null }));
  return {
    payments: async (since) => iso(await q(
      'select amount_cents, status, provider, business_id, transaction_id, created_at from public.payments where created_at >= $1 order by created_at',
      [new Date(since)]), 'created_at'),
    newBusinessCount: async (since) => Number((await q('select count(*) from public.businesses where created_at >= $1', [new Date(since)]))[0].count),
    checks: async (since) => iso(await q(
      'select system, status, detail, checked_at from public.admin_system_checks where checked_at >= $1 order by checked_at desc',
      [new Date(since)]), 'checked_at'),
    ignored: async () => (await q('select transaction_id from public.admin_ignored_transactions')).map((r) => r.transaction_id),
    testBusinesses: async () => TEST_OWNER_IDS.length
      ? (await q('select id from public.businesses where owner_id = any($1::uuid[])', [TEST_OWNER_IDS])).map((r) => r.id)
      : [],
    subscriptions: async () => iso(await q(
      "select business_id, status, in_trial, price_cents, current_period_started_at from public.store_subscriptions where environment = 'Production'"),
    'current_period_started_at'),
  };
}

// --- PostgREST with the service key (fallback) ----------------------------

function restSource() {
  // New-style `sb_secret_...` keys aren't JWTs and go in `apikey` only;
  // legacy service_role JWTs also need the Authorization header.
  const headers = KEY.startsWith('sb_') ? { apikey: KEY } : { apikey: KEY, Authorization: `Bearer ${KEY}` };
  const rest = (pathAndQuery) => fetchJson(`${URL_BASE}/rest/v1/${pathAndQuery}`, { headers });
  const rpc = (fn, args) => fetchJson(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
  });
  const iso = (ms) => encodeURIComponent(new Date(ms).toISOString());
  return {
    payments: (since) => rest(`payments?select=amount_cents,status,provider,business_id,transaction_id,created_at&created_at=gte.${iso(since)}&order=created_at.asc&limit=20000`),
    newBusinessCount: async (since) => (await rest(`businesses?select=id&created_at=gte.${iso(since)}`)).length,
    checks: (since) => rest(`admin_system_checks?select=system,status,detail,checked_at&checked_at=gte.${iso(since)}&order=checked_at.desc`),
    ignored: async () => (await rest('admin_ignored_transactions?select=transaction_id')).map((r) => r.transaction_id),
    testBusinesses: async () => {
      const owners = [...TEST_OWNER_IDS];
      for (const email of TEST_EMAILS) {
        const id = await rpc('lookup_user_id_by_email', { p_email: email }).catch(() => null);
        if (id) owners.push(id);
      }
      if (!owners.length) return [];
      return (await rest(`businesses?select=id&owner_id=in.(${owners.map(encodeURIComponent).join(',')})`)).map((b) => b.id);
    },
    subscriptions: () => rest('store_subscriptions?select=business_id,status,in_trial,price_cents,current_period_started_at&environment=eq.Production'),
  };
}

const db = DATABASE_URL ? pgSource() : URL_BASE && KEY ? restSource() : null;

// Test-owned businesses change rarely; resolve them hourly, not every minute.
let exclusions = { at: 0, businessIds: new Set(EXTRA_EXCLUDED) };
async function excludedBusinesses() {
  if (Date.now() - exclusions.at < 3600e3) return exclusions.businessIds;
  const ids = new Set([...EXTRA_EXCLUDED, ...(await db.testBusinesses())]);
  exclusions = { at: Date.now(), businessIds: ids };
  return ids;
}

// Platform profit, the way the admin panel measures it: the application fees
// Stripe actually paid the platform, minus any that were refunded. That lives
// in Stripe, not the database, so it needs a key. Use a RESTRICTED key with
// only "Application Fees: Read"; it can't see cards or move money.
const STRIPE_KEY = process.env.STRIPE_RESTRICTED_KEY;
// Connected accounts whose fees shouldn't count (team/test accounts), comma-separated acct_ ids.
const STRIPE_EXCLUDE = new Set(list(process.env.PAYIT_EXCLUDE_STRIPE_ACCOUNTS));

async function loadFees(sinceMs) {
  const fees = [];
  let after = null;
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ limit: '100', 'created[gte]': String(Math.floor(sinceMs / 1000)) });
    if (after) q.set('starting_after', after);
    const res = await fetch(`https://api.stripe.com/v1/application_fees?${q}`, { headers: { Authorization: `Bearer ${STRIPE_KEY}` }, signal: AbortSignal.timeout(15000) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error?.message || `Stripe responded ${res.status}`);
    fees.push(...body.data);
    if (!body.has_more || !body.data.length) break;
    after = body.data.at(-1).id;
  }
  return fees
    .filter((f) => f.livemode && !STRIPE_EXCLUDE.has(typeof f.account === 'string' ? f.account : f.account?.id))
    .map((f) => ({ at: f.created * 1000, kept: f.amount - f.amount_refunded }));
}

// PayIt Plus, the plan merchants pay PayIt for through the App Store
// (store_subscriptions: one row per business, production only). "Paid this
// month" is a billing period that started this month outside a free trial;
// revenue is the store price before Apple's cut.
function subscriptionTotals(subs, excluded, monthStart) {
  const real = subs.filter((x) => !excluded.has(x.business_id));
  const paying = real.filter((x) => ['active', 'grace_period'].includes(x.status) && !x.in_trial);
  const paidThisMonth = real.filter((x) => !x.in_trial && x.current_period_started_at && Date.parse(x.current_period_started_at) >= monthStart);
  return {
    paying: paying.length,
    paidThisMonth: paidThisMonth.length,
    monthCents: paidThisMonth.reduce((a, x) => a + (x.price_cents || 0), 0),
    inTrial: real.filter((x) => x.in_trial && x.status === 'active').length,
    billingIssues: real.filter((x) => x.status === 'billing_retry').length,
  };
}

export async function loadPayit() {
  const now = Date.now();
  const today = startOfDay(now);
  const weekStart = startOfDay(now, -6);
  const yesterday = startOfDay(now, -1);
  const local = new Date(now + tzOffset(TZ, now));
  const monthStart = zonedToUtc(TZ, local.getUTCFullYear(), local.getUTCMonth() + 1, 1);

  const [payments, newBusinesses, checks, ignored, excluded, subs] = await Promise.all([
    db.payments(weekStart),
    db.newBusinessCount(today),
    db.checks(now - 3 * 3600e3),
    db.ignored().catch(() => []),
    excludedBusinesses(),
    // Extra, like profit: without read access to store_subscriptions the rest still shows.
    db.subscriptions().catch((err) => ({ error: err.message })),
  ]);
  // Profit is extra: if Stripe can't be reached, sales still show.
  let fees = null, profitError = null;
  if (STRIPE_KEY) { try { fees = await loadFees(weekStart); } catch (err) { profitError = err.message; } }

  const ignoredTx = new Set(ignored);
  const rows = payments.filter((p) => !excluded.has(p.business_id) && !ignoredTx.has(p.transaction_id) && !EXCLUDED_PROVIDERS.has(String(p.provider || '').toLowerCase()));
  const at = (p) => Date.parse(p.created_at);

  // 7 daily buckets of completed gross, oldest first.
  const days = Array.from({ length: 7 }, (_, i) => ({ start: startOfDay(now, i - 6), cents: 0, count: 0 }));
  const hours = Array(24).fill(0);
  const t = { cents: 0, count: 0, declined: 0, refunded: 0, merchants: new Set(), byProvider: {} };
  let ySameTimeCents = 0;

  for (const p of rows) {
    const ts = at(p);
    if (p.status === 'completed') {
      const day = days.findLast((d) => ts >= d.start);
      if (day) { day.cents += p.amount_cents; day.count++; }
      if (ts >= yesterday && ts < today && ts - yesterday <= now - today) ySameTimeCents += p.amount_cents;
    }
    if (ts < today) continue;
    if (p.status === 'completed') {
      t.cents += p.amount_cents; t.count++;
      t.merchants.add(p.business_id);
      t.byProvider[p.provider] = (t.byProvider[p.provider] || 0) + p.amount_cents;
      hours[new Date(ts - today).getUTCHours()] += p.amount_cents;
    } else if (p.status === 'declined') t.declined++;
    else if (p.status === 'refunded') t.refunded++;
  }

  // The latest payments through the platform, newest first.
  const recent = rows.slice(-12).reverse().map((p) => ({ cents: p.amount_cents, provider: p.provider, status: p.status, at: p.created_at }));

  // Latest check per system — the hourly-system-check edge function writes these.
  const latest = {};
  for (const c of checks) latest[c.system] ??= c;

  return {
    today: {
      grossCents: t.cents, count: t.count, declined: t.declined, refunded: t.refunded,
      activeMerchants: t.merchants.size, byProvider: t.byProvider,
      newBusinesses,
      avgTicketCents: t.count ? Math.round(t.cents / t.count) : 0,
    },
    yesterdaySameTimeCents: ySameTimeCents,
    hourly: hours,
    week: days.map((d, i) => ({
      date: new Date(d.start).toISOString(), cents: d.cents, count: d.count,
      profitCents: fees ? fees.filter((f) => f.at >= d.start && (i === days.length - 1 || f.at < days[i + 1].start)).reduce((a, f) => a + f.kept, 0) : null,
    })),
    profit: fees ? {
      todayCents: fees.filter((f) => f.at >= today).reduce((a, f) => a + f.kept, 0),
      weekCents: fees.reduce((a, f) => a + f.kept, 0),
      // Take rate on card volume only: cash and ATH Movil never pay a platform fee.
      cardVolumeCents: t.byProvider.stripe || 0,
    } : null,
    profitError,
    excludedBusinesses: excluded.size,
    excludedProviders: [...EXCLUDED_PROVIDERS],
    access: payitMode,
    systems: Object.values(latest).sort((a, b) => a.system.localeCompare(b.system)),
    recent,
    subscriptions: Array.isArray(subs) ? subscriptionTotals(subs, excluded, monthStart) : null,
    subscriptionsError: Array.isArray(subs) ? null : /permission denied/i.test(subs.error)
      ? 'The read-only role needs access to store_subscriptions (sql/deskhub_reader_subscriptions.sql).' : subs.error,
  };
}
