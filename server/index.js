// Desk Hub server: serves the touchscreen UI and one /api/dashboard snapshot
// that the screen polls. Every external source refreshes in the background,
// so the screen never waits on Gmail or Supabase.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, TZ, readJson, writeJson, refresher, startOfDay, hmToMin, nowMinutes, tzOffset, zonedToUtc } from './util.js';
import { payitConfigured, loadPayit } from './payit.js';
import { mailConfigured, loadMail, buildDigest, aiEnabled } from './mail.js';
import { calendarConfigured, loadCalendar } from './calendar.js';
import { setBrightness, hasBacklight, systemStats, loadWeather } from './system.js';
import * as demo from './demo.js';

const PORT = Number(process.env.PORT || 8080);
const DEMO = process.env.DEMO === '1';
const NOTIFY_TOKEN = process.env.HUB_NOTIFY_TOKEN || '';

// ---------------------------------------------------------------------------
// Persistent state (data/state.json)
// ---------------------------------------------------------------------------

const DEFAULT_STATE = {
  todos: [],
  digest: null, // { day, at, headline, highlights, emailCount, errors }
  suggestedFrom: {}, // emailId -> at, so an email is only ever suggested once
  focusLog: [], // { at, minutes, label }
  notifications: [], // pushed via POST /api/notify
  dismissed: {}, // alertId -> dismissedAt
  mode: 'day', // day | sleep | off
  settings: {
    dayBrightness: 85,
    sleepBrightness: 4,
    autoSleep: true,
    sleepAt: '23:30',
    wakeAt: '07:00',
    focusMinutes: 25,
    shortBreak: 5,
    longBreak: 15,
    tags: ['School', 'PayIt', 'Personal'],
    chime: true,
    digestAt: '07:30',
    emailTasks: true,
  },
};

const STATE_FILE = DEMO ? 'demo-state.json' : 'state.json';
const state = readJson(STATE_FILE, DEFAULT_STATE);
state.settings = { ...DEFAULT_STATE.settings, ...state.settings };
for (const k of Object.keys(DEFAULT_STATE)) state[k] ??= structuredClone(DEFAULT_STATE[k]);
if (DEMO && !state.todos.length) Object.assign(state, demo.seedState());

let saveTimer = null;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => writeJson(STATE_FILE, state), 300); };

// ---------------------------------------------------------------------------
// Data sources
// ---------------------------------------------------------------------------

const sources = DEMO
  ? { payit: demo.source(demo.payit), mail: demo.source(demo.mail), calendar: demo.source(demo.calendar), weather: demo.source(demo.weather) }
  : {
      payit: payitConfigured ? refresher('payit', 60e3, loadPayit) : null,
      mail: mailConfigured ? refresher('mail', 4 * 60e3, async () => { const d = await loadMail(); suggestFromUrgent(d); return d; }) : null,
      calendar: calendarConfigured ? refresher('calendar', 15 * 60e3, loadCalendar) : null,
      weather: refresher('weather', 15 * 60e3, loadWeather),
    };

// ---------------------------------------------------------------------------
// Display mode + sleep schedule
// ---------------------------------------------------------------------------

function applyMode(mode) {
  state.mode = mode;
  const pct = mode === 'day' ? state.settings.dayBrightness : mode === 'sleep' ? state.settings.sleepBrightness : 0;
  setBrightness(pct);
  save();
}

const inSleepWindow = () => {
  const now = nowMinutes(), s = hmToMin(state.settings.sleepAt), w = hmToMin(state.settings.wakeAt);
  return s > w ? now >= s || now < w : now >= s && now < w;
};

// Only act when the schedule *crosses* a boundary, so tapping "wake" at 1am
// isn't immediately undone by the next tick.
let lastScheduled = null;
function scheduleTick() {
  if (!state.settings.autoSleep) { lastScheduled = null; return; }
  const scheduled = inSleepWindow() ? 'sleep' : 'day';
  if (scheduled !== lastScheduled) {
    if (lastScheduled !== null || state.mode !== scheduled) applyMode(scheduled === 'sleep' && state.mode === 'off' ? 'off' : scheduled);
    lastScheduled = scheduled;
  }
}
applyMode(state.mode);
scheduleTick();
setInterval(scheduleTick, 30e3).unref();

// ---------------------------------------------------------------------------
// Email -> suggested tasks, and the daily digest
// ---------------------------------------------------------------------------

const localDay = (ms = Date.now()) => new Date(ms + tzOffset(TZ, ms)).toISOString().slice(0, 10);

/** Adds a task that waits on the screen for Keep / Dismiss. Once per email, ever. */
function suggestTask({ emailId, text, due = null, tag = null, from, subject, why }) {
  if (!state.settings.emailTasks || !emailId || state.suggestedFrom[emailId]) return false;
  state.suggestedFrom[emailId] = Date.now();
  state.todos.push({
    id: crypto.randomUUID(), text: String(text).slice(0, 200), tag: state.settings.tags.includes(tag) ? tag : null,
    due, star: false, done: false, createdAt: Date.now(),
    suggested: true, source: { from, subject, why: why || null },
  });
  return true;
}

// Urgent mail with a concrete action becomes a suggestion as soon as it's seen.
function suggestFromUrgent(mail) {
  let added = 0;
  for (const acct of mail.accounts) {
    for (const m of acct.messages) {
      if (m.priority === 'urgent' && m.action && m.ai) {
        added += suggestTask({ emailId: m.id, text: m.action, due: startOfDay(), from: m.from, subject: m.subject, why: `Urgent · ${acct.name}` });
      }
    }
  }
  // Forget suggestion records after 30 days so the file stays small.
  const cutoff = Date.now() - 30 * 86400e3;
  for (const [k, v] of Object.entries(state.suggestedFrom)) if (v < cutoff) delete state.suggestedFrom[k];
  if (added) save();
}

let digestRunning = false;
async function runDigest() {
  if (digestRunning) return { running: true };
  digestRunning = true;
  try {
    const d = DEMO ? demo.digest() : await buildDigest({ tags: state.settings.tags, today: localDay() });
    for (const t of d.tasks) {
      const [y, mo, day] = t.due ? t.due.split('-').map(Number) : [];
      suggestTask({ emailId: t.email_id, text: t.text, due: t.due ? zonedToUtc(TZ, y, mo, day) : null, tag: t.tag, from: t.from, subject: t.subject, why: t.why });
    }
    state.digest = { day: localDay(), at: Date.now(), headline: d.headline, highlights: d.highlights, emailCount: d.emailCount, taskCount: d.tasks.length, errors: d.errors };
    save();
    return state.digest;
  } catch (err) {
    state.digest = { ...(state.digest || {}), error: err.message, errorAt: Date.now() };
    console.error('[digest]', err.message);
    return { error: err.message };
  } finally {
    digestRunning = false;
  }
}

// Once a day at digestAt (or on first boot after it, if the Pi was off).
// After a failure, wait 30 minutes before retrying.
setInterval(() => {
  const canRun = DEMO || (mailConfigured && aiEnabled());
  const due = state.digest?.day !== localDay() && nowMinutes() >= hmToMin(state.settings.digestAt);
  const backingOff = state.digest?.errorAt && Date.now() - state.digest.errorAt < 30 * 60e3;
  if (canRun && due && !backingOff) runDigest();
}, 60e3).unref();

// ---------------------------------------------------------------------------
// Alerts: everything that wants attention, from every source, in one list
// ---------------------------------------------------------------------------

function buildAlerts(snap) {
  const alerts = [];
  const add = (id, level, source, title, body = '') => alerts.push({ id, level, source, title, body });

  for (const [name, s] of Object.entries(sources)) {
    if (s?.get().error) add(`err:${name}:${s.get().error}`, 'warn', name, `Can't load ${name}`, s.get().error);
  }

  const p = snap.payit?.data;
  for (const sys of p?.systems || []) {
    if (sys.status !== 'up') add(`sys:${sys.system}:${sys.status}:${startOfDay()}`, sys.status === 'down' ? 'error' : 'warn', 'payit',
      `${sys.system.replace(/_/g, ' ')} is ${sys.status}`, sys.detail || '');
  }
  if (p && p.today.declined >= 3) add(`declines:${startOfDay()}:${p.today.declined >= 10 ? 10 : 3}`, 'warn', 'payit', `${p.today.declined} declined charges today`);

  for (const acct of snap.mail?.data?.accounts || []) {
    if (acct.error) add(`mailerr:${acct.id}`, 'warn', 'mail', `${acct.name} mail isn't connecting`, acct.error);
    for (const m of acct.messages) if (m.priority === 'urgent') add(`mail:${m.id}`, 'info', 'mail', `${acct.name}: ${m.from}`, m.summary);
  }

  const now = Date.now();
  for (const ev of snap.calendar?.data?.events || []) {
    if (!ev.allDay && ev.start > now && ev.start - now <= 15 * 60e3) add(`cal:${ev.title}:${ev.start}`, 'info', 'calendar', `Starting soon: ${ev.title}`, ev.location);
  }

  const overdue = state.todos.filter((t) => !t.done && t.due && t.due < startOfDay());
  if (overdue.length) add(`overdue:${startOfDay()}:${overdue.length}`, 'info', 'tasks', `${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}`, overdue.map((t) => t.text).join(' · '));

  const sys = systemStats();
  if (sys.tempC > 75) add(`temp:${Math.round(sys.tempC / 5)}`, 'warn', 'system', `Pi is running hot (${sys.tempC.toFixed(0)}°C)`);

  if (state.digest?.day === localDay() && state.digest.headline) add(`digest:${state.digest.day}`, 'info', 'mail', 'Your email digest is ready', state.digest.headline);
  const toReview = state.todos.filter((t) => t.suggested).length;
  if (toReview) add(`review:${toReview}`, 'info', 'tasks', `${toReview} suggested task${toReview > 1 ? 's' : ''} to review`, 'From your email — keep or dismiss them in To do');

  for (const n of state.notifications) add(`push:${n.id}`, n.level, n.source, n.title, n.body);

  return alerts.filter((a) => !state.dismissed[a.id]);
}

function dashboard() {
  const snap = Object.fromEntries(Object.entries(sources).map(([k, s]) => [k, s ? s.get() : { configured: false }]));
  const today = startOfDay();
  const focusToday = state.focusLog.filter((f) => f.at >= today);
  return {
    now: Date.now(),
    tz: TZ,
    demo: DEMO,
    mode: state.mode,
    hasBacklight: hasBacklight(),
    settings: state.settings,
    todos: state.todos,
    focus: {
      todayMinutes: focusToday.reduce((s, f) => s + f.minutes, 0),
      todaySessions: focusToday.length,
      week: Array.from({ length: 7 }, (_, i) => {
        const start = startOfDay(Date.now(), i - 6), end = startOfDay(Date.now(), i - 5);
        return { date: new Date(start).toISOString(), minutes: state.focusLog.filter((f) => f.at >= start && f.at < end).reduce((s, f) => s + f.minutes, 0) };
      }),
      recent: state.focusLog.slice(-8).reverse(),
    },
    ...snap,
    system: systemStats(),
    digest: state.digest?.day === localDay() ? state.digest : state.digest?.error ? { error: state.digest.error } : null,
    digestRunning,
    aiEnabled: DEMO || aiEnabled(),
    alerts: buildAlerts(snap),
  };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const PUBLIC = path.join(ROOT, 'public');

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 64e3) throw new Error('body too large'); }
  return raw ? JSON.parse(raw) : {};
}

const routes = {
  'GET /api/dashboard': () => dashboard(),

  'POST /api/todos': ({ body }) => {
    const text = String(body.text || '').trim().slice(0, 200);
    if (!text) return [400, { error: 'text required' }];
    const todo = { id: crypto.randomUUID(), text, tag: body.tag || null, due: body.due ?? null, star: Boolean(body.star), done: false, createdAt: Date.now() };
    state.todos.push(todo); save(); return todo;
  },
  'PATCH /api/todos/:id': ({ params, body }) => {
    const t = state.todos.find((x) => x.id === params.id);
    if (!t) return [404, { error: 'not found' }];
    for (const k of ['text', 'tag', 'due', 'star', 'done']) if (k in body) t[k] = body[k];
    if (body.suggested === false) { t.suggested = false; t.createdAt = Date.now(); }
    if ('done' in body) t.doneAt = body.done ? Date.now() : null;
    save(); return t;
  },
  'DELETE /api/todos/:id': ({ params }) => { state.todos = state.todos.filter((x) => x.id !== params.id); save(); return { ok: true }; },
  'POST /api/todos/clear-done': () => { state.todos = state.todos.filter((x) => !x.done); save(); return { ok: true }; },

  'POST /api/focus': ({ body }) => {
    const minutes = Math.max(1, Math.min(240, Math.round(Number(body.minutes) || 0)));
    state.focusLog.push({ at: Date.now(), minutes, label: String(body.label || '').slice(0, 60) || null });
    state.focusLog = state.focusLog.slice(-2000); save(); return { ok: true };
  },

  'POST /api/mode': ({ body }) => {
    if (!['day', 'sleep', 'off'].includes(body.mode)) return [400, { error: 'bad mode' }];
    applyMode(body.mode); return { mode: state.mode };
  },
  'PATCH /api/settings': ({ body }) => {
    for (const [k, v] of Object.entries(body)) if (k in DEFAULT_STATE.settings) state.settings[k] = v;
    applyMode(state.mode); lastScheduled = null; scheduleTick(); return state.settings;
  },

  'POST /api/alerts/:id/dismiss': ({ params }) => {
    state.dismissed[params.id] = Date.now();
    state.notifications = state.notifications.filter((n) => `push:${n.id}` !== params.id);
    const cutoff = Date.now() - 30 * 86400e3; // forget old dismissals
    for (const [k, v] of Object.entries(state.dismissed)) if (v < cutoff) delete state.dismissed[k];
    save(); return { ok: true };
  },

  // Anything on your network (a cron job, a GitHub Action via a tunnel, a
  // Supabase webhook) can push a card onto the hub with this.
  'POST /api/notify': ({ body, req }) => {
    if (NOTIFY_TOKEN && req.headers.authorization !== `Bearer ${NOTIFY_TOKEN}`) return [401, { error: 'unauthorized' }];
    const n = {
      id: crypto.randomUUID(),
      level: ['info', 'warn', 'error'].includes(body.level) ? body.level : 'info',
      source: String(body.source || 'notify').slice(0, 30),
      title: String(body.title || 'Notification').slice(0, 120),
      body: String(body.body || '').slice(0, 400),
      at: Date.now(),
    };
    state.notifications = [...state.notifications, n].slice(-50); save(); return n;
  },

  'POST /api/digest': async () => {
    if (!DEMO && !(mailConfigured && aiEnabled())) return [400, { error: 'Needs a mail account and ANTHROPIC_API_KEY in .env' }];
    runDigest();
    return { started: true };
  },

  'POST /api/refresh': () => { for (const s of Object.values(sources)) s?.refresh(); return { ok: true }; },
};

function match(method, url) {
  for (const [key, handler] of Object.entries(routes)) {
    const [m, pattern] = key.split(' ');
    if (m !== method) continue;
    const a = pattern.split('/'), b = url.split('/');
    if (a.length !== b.length) continue;
    const params = {};
    if (a.every((seg, i) => (seg.startsWith(':') ? ((params[seg.slice(1)] = decodeURIComponent(b[i])), true) : seg === b[i]))) return { handler, params };
  }
  return null;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) {
      const found = match(req.method, url.pathname);
      if (!found) return send(res, 404, { error: 'not found' });
      const body = ['POST', 'PATCH'].includes(req.method) ? await readBody(req) : {};
      const out = await found.handler({ params: found.params, body, req });
      return Array.isArray(out) ? send(res, out[0], out[1]) : send(res, 200, out);
    }
    const file = path.join(PUBLIC, path.normalize(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    send(res, 500, { error: err.message });
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Desk Hub on http://localhost:${PORT}${DEMO ? ' (demo data)' : ''} · tz ${TZ}`);
  console.log(`  payit:${payitConfigured || DEMO} mail:${mailConfigured || DEMO} calendar:${calendarConfigured || DEMO} backlight:${hasBacklight()}`);
});
