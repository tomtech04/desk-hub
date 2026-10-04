// Small shared helpers: timezone math, JSON persistence, cached refreshers.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const TZ = process.env.TZ_NAME || Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Offset (ms) of `tz` from UTC at instant `ms`, e.g. -4h for New York in summer. */
export function tzOffset(tz, ms) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** UTC instant for a wall-clock time in `tz`. */
export function zonedToUtc(tz, y, mo, d, h = 0, mi = 0, s = 0) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let t = guess - tzOffset(tz, guess);
  t = guess - tzOffset(tz, t); // second pass settles DST boundaries
  return t;
}

/** Start of the local day containing `ms`, as a UTC instant, plus `addDays`. */
export function startOfDay(ms = Date.now(), addDays = 0, tz = TZ) {
  const local = new Date(ms + tzOffset(tz, ms));
  return zonedToUtc(tz, local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate() + addDays);
}

/** Local "HH:MM" -> minutes since midnight, and the same for now. */
export const hmToMin = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
export function nowMinutes(tz = TZ) {
  const local = new Date(Date.now() + tzOffset(tz, Date.now()));
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

export function readJson(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8')); }
  catch { return structuredClone(fallback); }
}

export function writeJson(name, value) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, name);
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2));
  fs.renameSync(file + '.tmp', file); // atomic, so a power cut can't leave half a file
}

/**
 * A data source that refreshes itself in the background. `get()` always returns
 * the last good snapshot instantly; a failed refresh keeps the old data and
 * records the error so the dashboard can show it as an alert.
 */
export function refresher(name, intervalMs, load) {
  const state = { data: null, error: null, updatedAt: null, loading: false, failures: 0 };
  async function refresh() {
    if (state.loading) return;
    state.loading = true;
    try {
      state.data = await load();
      state.error = null;
      state.failures = 0;
      state.updatedAt = Date.now();
    } catch (err) {
      state.error = err?.message || String(err);
      state.failures++;
      console.error(`[${name}]`, state.error);
      // A one-off network blip (a failed DNS lookup, a dropped connection)
      // shouldn't wait a whole interval: try again shortly, a couple of times.
      if (state.failures <= 2) setTimeout(refresh, 10e3).unref();
    } finally {
      state.loading = false;
    }
  }
  refresh();
  setInterval(refresh, intervalMs).unref();
  return { get: () => ({ ...state }), refresh };
}

export async function fetchJson(url, opts = {}) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
  return res.json();
}
