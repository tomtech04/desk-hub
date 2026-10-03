// PayIt stats from Supabase, read-only, aggregates only. The credential never
// leaves the Pi; the screen only ever sees totals.
//
// Preferred: PAYIT_DATABASE_URL, a Postgres login as `deskhub_reader` — a role
// that can SELECT only the columns used below (POS-App migration
// 20261002000001_deskhub_reader_role.sql). Fallback: the service-role key
// over PostgREST, which works but can read and write everything.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ROOT, fetchJson, startOfDay } from './util.js';

const DATABASE_URL = process.env.PAYIT_DATABASE_URL;
const URL_BASE = process.env.SUPABASE_URL?.replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
// Mirrors the admin panel's reporting rules (apps/admin/lib/ledger.ts): any
// business owned by a team/test account is left out of revenue, as is any
// transaction marked ignored in admin_ignored_transactions. The read-only role
// can't look users up by email, so it takes the owners' user ids directly.
const TEST_OWNER_IDS = list(process.env.PAYIT_TEST_OWNER_IDS);
const TEST_EMAILS = list(process.env.PAYIT_TEST_ACCOUNT_EMAILS);
const EXTRA_EXCLUDED = list(process.env.PAYIT_EXCLUDE_BUSINESS_IDS);

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
  const iso = (rows, key) => rows.map((r) => ({ ...r, [key]: r[key].toISOString() }));
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

export async function loadPayit() {
  const now = Date.now();
  const today = startOfDay(now);
  const weekStart = startOfDay(now, -6);
  const yesterday = startOfDay(now, -1);

  const [payments, newBusinesses, checks, ignored, excluded] = await Promise.all([
    db.payments(weekStart),
    db.newBusinessCount(today),
    db.checks(now - 3 * 3600e3),
    db.ignored().catch(() => []),
    excludedBusinesses(),
  ]);

  const ignoredTx = new Set(ignored);
  const rows = payments.filter((p) => !excluded.has(p.business_id) && !ignoredTx.has(p.transaction_id));
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
    week: days.map((d) => ({ date: new Date(d.start).toISOString(), cents: d.cents, count: d.count })),
    excludedBusinesses: excluded.size,
    access: payitMode,
    systems: Object.values(latest).sort((a, b) => a.system.localeCompare(b.system)),
  };
}
