// Desk Hub server: serves the touchscreen UI and one /api/dashboard snapshot
// that the screen polls. Every external source refreshes in the background,
// so the screen never waits on Gmail or Supabase.
import http from 'node:http';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, TZ, readJson, writeJson, refresher, startOfDay, hmToMin, nowMinutes, tzOffset, zonedToUtc } from './util.js';
import { payitConfigured, loadPayit } from './payit.js';
import { mailConfigured, loadMail, buildDigest, aiEnabled, readMessage, taskFromEmail, tasksFromNewMail, draftReply } from './mail.js';
import { calendarConfigured, loadCalendar } from './calendar.js';
import { setBrightness, hasBacklight, systemStats, loadWeather } from './system.js';
import { readVoiceRequest, interpretVoice, buildRecap } from './voice.js';
import { msStatus, startSignIn, signOut as msSignOut, whenConnected } from './msgraph.js';
import { createMcp } from './mcp.js';
import * as demo from './demo.js';

const PORT = Number(process.env.PORT || 8080);
const DEMO = process.env.DEMO === '1';
const NOTIFY_TOKEN = process.env.HUB_NOTIFY_TOKEN || '';
const HUB_PASSWORD = process.env.HUB_PASSWORD || '';
const VOICE_TOKEN = process.env.HUB_VOICE_TOKEN || '';
const MCP_TOKEN = process.env.HUB_MCP_TOKEN || '';

// ---------------------------------------------------------------------------
// Persistent state (data/state.json)
// ---------------------------------------------------------------------------

const DEFAULT_STATE = {
  todos: [],
  digest: null, // { day, at, headline, highlights, emailCount, errors }
  taskChecked: {}, // emailId -> at: already considered by the hourly task pass
  suggestedFrom: {}, // emailId -> at, so an email is only ever suggested once
  focusLog: [], // { at, minutes, label }
  notifications: [], // pushed via POST /api/notify
  days: {}, // per-day record for the journal archive: 'YYYY-MM-DD' -> { summary, note }
  mailHidden: {}, // emails marked done on the workstation: id -> when (hidden from the hub only; the mailbox is untouched)
  canvas: {}, // Canvas assignments already turned into tasks: uid -> due day (so a deleted one isn't re-added)
  journal: [], // voice notes: { id, at, text, note, kind: 'reflection'|'note'|'', evening, tasks: [text], trigger }
  morningSeen: null, // local day the morning brief was last dismissed
  recap: null, // { day, at, headline, bullets, tomorrow }
  sessions: {}, // sha256(session token) -> expiry; for signed-in phones/laptops
  dismissed: {}, // alertId -> dismissedAt
  mode: 'day', // day | sleep | off
  settings: {
    dayBrightness: 85,
    textSize: 115, // percent; scales body text on every device
    homeAfter: 3, // minutes untouched before the desk screen returns to Home; 0 = never
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
    recapAt: '21:00',
    windDown: true,
    windDownAt: '22:00',
    morningBrief: true,
    focusLock: true,
    emailTasks: true,
  },
};

const STATE_FILE = DEMO ? 'demo-state.json' : 'state.json';
const state = readJson(STATE_FILE, DEFAULT_STATE);
state.settings = { ...DEFAULT_STATE.settings, ...state.settings };
for (const k of Object.keys(DEFAULT_STATE)) state[k] ??= structuredClone(DEFAULT_STATE[k]);
if (state.mode === 'off') state.mode = 'sleep';
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
      calendar: calendarConfigured ? refresher('calendar', 15 * 60e3, async () => { const d = await loadCalendar(); syncAssignments(d.assignments || []); return d; }) : null,
      weather: refresher('weather', 15 * 60e3, loadWeather),
    };

whenConnected(() => { console.log('[school] Microsoft sign-in complete'); sources.mail?.refresh(); });

// ---------------------------------------------------------------------------
// Display mode + sleep schedule
// ---------------------------------------------------------------------------

const between = (now, from, to) => (from > to ? now >= from || now < to : now >= from && now < to);
const inSleepWindow = () => between(nowMinutes(), hmToMin(state.settings.sleepAt), hmToMin(state.settings.wakeAt));
// Wind-down runs from windDownAt until wake time: a calmer, dimmer screen with
// work (mail, PayIt) put away. It stays in force if the screen is woken at night.
const WIND_DOWN_BRIGHTNESS = 35;
const inWindDown = () => state.settings.windDown && between(nowMinutes(), hmToMin(state.settings.windDownAt), hmToMin(state.settings.wakeAt));

// Brightness changes glide over ~0.7s rather than jumping.
let currentPct = null, rampTimer = null;
function glideTo(target) {
  clearInterval(rampTimer);
  if (currentPct === null) { currentPct = target; setBrightness(target); return; }
  const from = currentPct, steps = 10;
  let i = 0;
  rampTimer = setInterval(() => {
    i++;
    currentPct = Math.round(from + ((target - from) * i) / steps);
    setBrightness(currentPct);
    if (i >= steps) clearInterval(rampTimer);
  }, 70);
}

const modeBrightness = (mode) => {
  const day = inWindDown() ? Math.min(state.settings.dayBrightness, WIND_DOWN_BRIGHTNESS) : state.settings.dayBrightness;
  return mode === 'day' ? day : mode === 'sleep' ? state.settings.sleepBrightness : 0;
};

let peekTimer = null;
function applyMode(mode) {
  clearTimeout(peekTimer);
  state.mode = mode;
  glideTo(modeBrightness(mode));
  save();
}

// A tap on the sleeping screen lights it up for a few seconds, so the Wake
// button can actually be seen (in daylight a 4% backlight is invisible).
const PEEK_BRIGHTNESS = 70, PEEK_MS = 6000;
function peek() {
  if (state.mode === 'day') return;
  clearTimeout(peekTimer);
  glideTo(Math.max(PEEK_BRIGHTNESS, state.settings.sleepBrightness));
  peekTimer = setTimeout(() => { if (state.mode !== 'day') glideTo(modeBrightness(state.mode)); }, PEEK_MS);
}

// Only act when the schedule *crosses* a boundary, so tapping "wake" at 1am
// isn't immediately undone by the next tick.
let lastScheduled = null;
let lastWind = null;
function scheduleTick() {
  // Entering or leaving wind-down only changes the brightness of an awake screen.
  const wind = inWindDown();
  if (wind !== lastWind) { lastWind = wind; if (state.mode === 'day') applyMode('day'); }
  if (!state.settings.autoSleep) { lastScheduled = null; return; }
  const scheduled = inSleepWindow() ? 'sleep' : 'day';
  if (scheduled !== lastScheduled) {
    if (lastScheduled !== null || state.mode !== scheduled) applyMode(scheduled);
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
const makeSubtasks = (list) => (Array.isArray(list) ? list : []).map((t) => String(t?.text ?? t).trim().slice(0, 160)).filter(Boolean).slice(0, 12)
  .map((text) => ({ id: crypto.randomUUID().slice(0, 8), text, done: false }));

function newTodo({ text, tag = null, due = null, star = false, subtasks = [], ...extra }) {
  return {
    id: crypto.randomUUID(), text: String(text).trim().slice(0, 200), tag: state.settings.tags.includes(tag) ? tag : null,
    due, star: Boolean(star), done: false, createdAt: Date.now(), subtasks: makeSubtasks(subtasks), ...extra,
  };
}

function suggestTask({ emailId, text, due = null, tag = null, from, subject, why, subtasks = [] }) {
  if (!state.settings.emailTasks || !emailId || state.suggestedFrom[emailId]) return false;
  state.suggestedFrom[emailId] = Date.now();
  state.todos.push(newTodo({ text, tag, due, subtasks, suggested: true, source: { from, subject, why: why || null, emailId } }));
  return true;
}

// Every hour: have Claude look at mail that hasn't been considered yet, next to
// the open to-do list. New work becomes suggestions; an email that changes an
// existing task (moved deadline, new requirements) updates it, with a note on
// the task saying what changed and where it came from. Email never completes
// or deletes a task.
let mailTasksRunning = false;
async function mailTaskPass() {
  if (mailTasksRunning || !state.settings.emailTasks || DEMO || !mailConfigured || !aiEnabled()) return;
  const mail = sources.mail?.get().data;
  if (!mail) return;
  const ids = mail.accounts.flatMap((a) => a.messages).filter((m) => m.priority !== 'low' && !state.taskChecked[m.id]).map((m) => m.id);
  // Low-priority mail is marked as seen without spending a Claude call on it.
  for (const m of mail.accounts.flatMap((a) => a.messages)) if (m.priority === 'low') state.taskChecked[m.id] ??= Date.now();
  if (!ids.length) return;
  mailTasksRunning = true;
  try {
    const open = state.todos.filter((t) => !t.done && !t.suggested);
    const refs = new Map(open.map((t, i) => [`t${i + 1}`, t]));
    const out = await tasksFromNewMail({
      ids, tags: state.settings.tags, today: localDay(),
      openTasks: [...refs].map(([ref, t]) => ({ ref, text: t.text, due: t.due ? localDay(t.due) : null, subtasks: (t.subtasks || []).map((x) => x.text) })),
    });
    for (const id of ids) state.taskChecked[id] = Date.now();
    let added = 0;
    for (const t of out.newTasks) {
      added += suggestTask({ emailId: t.email_id, text: t.text, due: t.due ? dayToMs(t.due) : null, tag: t.tag, subtasks: t.subtasks, from: t.from, subject: t.subject, why: t.why });
    }
    const changed = [];
    for (const u of out.updates) {
      const t = refs.get(u.task_ref);
      if (!t) continue;
      t.subtasks = [...(t.subtasks || []), ...makeSubtasks(u.add_subtasks)];
      if (u.due) t.due = dayToMs(u.due);
      t.updates = [...(t.updates || []), { at: Date.now(), note: String(u.note).slice(0, 200), from: u.from }].slice(-3);
      changed.push(t.text);
    }
    if (changed.length) {
      state.notifications = [...state.notifications, { id: crypto.randomUUID(), level: 'info', source: 'mail', at: Date.now(),
        title: `Updated ${changed.length} task${changed.length > 1 ? 's' : ''} from new email`, body: changed.join(' · ').slice(0, 300) }].slice(-50);
    }
    const cutoff = Date.now() - 30 * 86400e3;
    for (const [k, v] of Object.entries(state.taskChecked)) if (v < cutoff) delete state.taskChecked[k];
    if (added || changed.length) console.log(`[mail-tasks] ${added} suggested, ${changed.length} updated from ${ids.length} new emails`);
  } catch (err) {
    console.error('[mail-tasks]', err.message);
  } finally {
    mailTasksRunning = false;
    save();
  }
}
setInterval(mailTaskPass, 60 * 60e3).unref();
setTimeout(mailTaskPass, 3 * 60e3).unref(); // and shortly after startup, once mail has loaded

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
      suggestTask({ emailId: t.email_id, text: t.text, due: t.due ? zonedToUtc(TZ, y, mo, day) : null, tag: t.tag, from: t.from, subject: t.subject, why: t.why, subtasks: t.subtasks });
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
// Voice notes (the ring, or typed on a phone) and the evening recap
// ---------------------------------------------------------------------------

const weekdayName = () => new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: TZ }).format(new Date());
// Canvas coursework becomes School tasks. Each assignment is added once (even if the
// task is later deleted); a moved due date updates the open task and leaves a note on it.
function syncAssignments(list) {
  state.canvas ||= {};
  let changed = false;
  const clock = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
  const day = (ms) => new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ });
  for (const a of list) {
    const why = ['Canvas', a.course, a.dueAt ? `due ${clock(a.dueAt)}` : ''].filter(Boolean).join(' · ');
    if (!(a.uid in state.canvas)) {
      // "ME-3345-A" -> "ME 3345", so "HW#5" says which class it's for.
      const course = (/^([A-Za-z]+)[- ]?(\d+[A-Za-z]?)/.exec(a.course) || []).slice(1).join(' ');
      state.todos.push(newTodo({ text: course && !a.title.includes(course) ? `${course}: ${a.title}` : a.title, tag: 'School', due: a.dueDay, source: { why, canvas: a.uid } }));
      state.canvas[a.uid] = a.dueDay; changed = true;
      continue;
    }
    const t = state.todos.find((x) => x.source?.canvas === a.uid);
    if (t && !t.done && (t.due !== a.dueDay || t.source.why !== why)) {
      if (t.due !== a.dueDay) t.updates = [...(t.updates || []), { note: `Due date moved to ${day(a.dueDay)} in Canvas`, at: Date.now() }].slice(-3);
      t.due = a.dueDay; t.source.why = why; state.canvas[a.uid] = a.dueDay; changed = true;
    }
  }
  // Forget assignments long past, so the list doesn't grow forever.
  for (const [uid, due] of Object.entries(state.canvas)) if (due < Date.now() - 60 * 86400e3) { delete state.canvas[uid]; changed = true; }
  if (changed) save();
}

const dayToMs = (ymd) => { const [y, mo, d] = ymd.split('-').map(Number); return zonedToUtc(TZ, y, mo, d); };

/** Tasks you say out loud are added straight away: you asked for them yourself. */
// What the desk screen is showing and its focus timer, as it last reported (kept in memory only).
let desk = { view: 'home', timer: null, at: 0 };

// Live events for open screens (Server-Sent Events): a voice note arriving, then what was done with it.
const streams = new Set();
function emit(event) {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of streams) { try { res.write(line); } catch { streams.delete(res); } }
}
setInterval(() => { for (const res of streams) { try { res.write(': ping\n\n'); } catch { streams.delete(res); } } }, 25e3);

async function handleVoice({ text, recordedAt, trigger, source = 'ring' }) {
  const id = `v${recordedAt}`;
  if (state.journal.some((j) => j.id === id)) return; // the app retried a delivery
  // Said while winding down (or late): it shows on the wind-down screen's "Before you sleep".
  const hour = new Date(recordedAt).getHours();
  const evening = inWindDown() || hour >= 21 || hour < 4;
  const entry = { id, at: recordedAt, text, note: '', kind: '', tasks: [], trigger: source === 'ring' ? trigger : source, evening, pending: true };
  state.journal.push(entry);
  state.journal = state.journal.slice(-400);
  save();
  emit({ type: 'journal.entry', id, source, said: text, stage: 'heard' });

  // Give Claude the open list with short refs, so "mark grocery shopping as done" can point at one.
  const openList = state.todos.filter((t) => !t.done && !t.suggested);
  const byRef = new Map();
  const open = openList.map((t, i) => {
    const ref = `t${i + 1}`;
    byRef.set(ref, { task: t });
    return { ref, text: t.text, subtasks: (t.subtasks || []).filter((x) => !x.done).map((x, j) => { const r = `${ref}.${j + 1}`; byRef.set(r, { task: t, sub: x }); return { ref: r, text: x.text }; }) };
  });
  if (DEMO) await new Promise((r) => setTimeout(r, 2500)); // stand in for Claude's thinking time
  const out = await interpretVoice({ text, tags: state.settings.tags, today: localDay(), weekday: weekdayName(), clock: new Date(recordedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), evening, open });
  for (const t of out.tasks) {
    state.todos.push(newTodo({ text: t.text, tag: t.tag, due: t.due ? dayToMs(t.due) : null, subtasks: t.subtasks, source: { why: 'Voice note' } }));
  }
  const completed = [];
  for (const ref of out.complete) {
    const hit = byRef.get(ref);
    if (!hit) continue;
    if (hit.sub) { hit.sub.done = true; completed.push(hit.sub.text); }
    else { hit.task.done = true; hit.task.doneAt = Date.now(); completed.push(hit.task.text); }
  }
  // What the pop-up lists: each thing done with the note, in the order it matters.
  const actions = [
    ...completed.map((t) => ({ kind: 'done', text: t })),
    ...out.tasks.map((t) => ({ kind: 'task', text: t.text })),
    ...(out.note ? [{ kind: out.kind === 'reflection' ? 'reflection' : 'note', text: out.note }] : []),
  ];
  if (!actions.length) actions.push({ kind: 'note', text: "Saved to today's journal" });
  Object.assign(entry, { note: out.note, kind: out.kind || '', tasks: out.tasks.map((t) => t.text), completed, actions, pending: false });
  const n = out.tasks.length, c = completed.length;
  const title = [c && `Marked ${c} done`, n && `added ${n} task${n > 1 ? 's' : ''}`].filter(Boolean).join(', ');
  state.notifications = [...state.notifications, {
    id: crypto.randomUUID(), level: 'info', source: 'voice', at: Date.now(),
    title: title ? title[0].toUpperCase() + title.slice(1) + ' from your voice note' : out.kind === 'reflection' ? 'Reflection saved' : 'Voice note saved',
    body: (out.reply || [...completed.map((t) => `✓ ${t}`), ...out.tasks.map((t) => t.text)].join(' · ') || out.note || text).slice(0, 300),
  }].slice(-50);
  save();
  emit({ type: 'journal.entry', id, source, said: text, stage: 'done', actions });
}

let recapRunning = false;
async function runRecap() {
  if (recapRunning) return;
  recapRunning = true;
  try {
    const today = startOfDay();
    const focus = state.focusLog.filter((f) => f.at >= today);
    const input = {
      today: localDay(), weekday: weekdayName(),
      notes: state.journal.filter((j) => j.at >= today).map((j) => ({ time: new Date(j.at).toISOString(), kind: j.kind || 'note', said: j.note || j.text })),
      done: state.todos.filter((t) => t.done && t.doneAt >= today).map((t) => t.text),
      open: state.todos.filter((t) => !t.done && !t.suggested).map((t) => ({ task: t.text, due: t.due ? localDay(t.due) : null })),
      focusMinutes: focus.reduce((a, f) => a + f.minutes, 0), focusSessions: focus.length,
    };
    const r = DEMO ? demo.recap() : await buildRecap(input);
    state.recap = { day: localDay(), at: Date.now(), ...r };
    // The headline doubles as that day's summary in Journal → Past days.
    state.days ||= {};
    if (r.headline) state.days[localDay()] = { summary: r.headline };
  } catch (err) {
    state.recap = { ...(state.recap || {}), error: err.message, errorAt: Date.now() };
    console.error('[recap]', err.message);
  } finally {
    recapRunning = false;
    save();
  }
}

// Evening recap at recapAt, but only on days with something to recap.
setInterval(() => {
  const today = startOfDay();
  const hasContent = state.journal.some((j) => j.at >= today) || state.todos.some((t) => t.done && t.doneAt >= today) || state.focusLog.some((f) => f.at >= today);
  const due = state.recap?.day !== localDay() && nowMinutes() >= hmToMin(state.settings.recapAt);
  const backingOff = state.recap?.errorAt && Date.now() - state.recap.errorAt < 30 * 60e3;
  if ((DEMO || aiEnabled()) && hasContent && due && !backingOff) runRecap();
}, 60e3).unref();

// ---------------------------------------------------------------------------
// Restarting the Pi. The hub runs as an ordinary user, so the system has to
// allow that user to reboot (scripts/allow-restart.sh adds a polkit rule for
// exactly that and nothing else). Ask logind whether we may, rather than guess.
// ---------------------------------------------------------------------------

let canRestart = false;
function checkCanRestart() {
  execFile('busctl', ['call', 'org.freedesktop.login1', '/org/freedesktop/login1', 'org.freedesktop.login1.Manager', 'CanReboot'], (err, out) => {
    canRestart = DEMO || (!err && /"yes"/.test(out));
  });
}
checkCanRestart();
setInterval(checkCanRestart, 60e3).unref();

// ---------------------------------------------------------------------------
// Alerts: everything that wants attention, from every source, in one list
// ---------------------------------------------------------------------------

function buildAlerts(snap) {
  const alerts = [];
  const add = (id, level, source, title, body = '') => alerts.push({ id, level, source, title, body });

  for (const [name, s] of Object.entries(sources)) {
    // Only worth an alert once it keeps failing (or has never loaded); a single
    // missed refresh retries on its own and the last good data stays on screen.
    const g = s?.get();
    if (g?.error && (g.failures >= 3 || !g.data)) add(`err:${name}:${g.error}`, 'warn', name, `Can't load ${name}`, g.error);
  }

  const p = snap.payit?.data;
  for (const sys of p?.systems || []) {
    if (sys.status !== 'up') add(`sys:${sys.system}:${sys.status}:${startOfDay()}`, sys.status === 'down' ? 'error' : 'warn', 'payit',
      `${sys.system.replace(/_/g, ' ')} is ${sys.status}`, sys.detail || '');
  }
  if (p && p.today.declined >= 3) add(`declines:${startOfDay()}:${p.today.declined >= 10 ? 10 : 3}`, 'warn', 'payit', `${p.today.declined} declined charges today`);

  for (const acct of snap.mail?.data?.accounts || []) {
    if (acct.error && !acct.needsSignIn) add(`mailerr:${acct.id}`, 'warn', 'mail', `${acct.name} mail isn't connecting`, acct.error);
    for (const m of acct.messages) if (m.priority === 'urgent' && !state.mailHidden?.[m.id]) add(`mail:${m.id}`, 'info', 'mail', `${acct.name}: ${m.from}`, m.summary);
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
  if (state.recap?.day === localDay() && state.recap.headline) add(`recap:${state.recap.day}`, 'info', 'journal', 'Your day recap is ready', state.recap.headline);
  const toReview = state.todos.filter((t) => t.suggested).length;
  if (toReview) add(`review:${toReview}`, 'info', 'tasks', `${toReview} suggested task${toReview > 1 ? 's' : ''} to review`, 'From your email — keep or dismiss them in To do');

  for (const n of state.notifications) add(`push:${n.id}`, n.level, n.source, n.title, n.body);

  return alerts.filter((a) => !state.dismissed[a.id]);
}

function dashboard() {
  const snap = Object.fromEntries(Object.entries(sources).map(([k, s]) => [k, s ? s.get() : { configured: false }]));
  // Mail marked done on the workstation is flagged, not removed, so it can be found again.
  const hiddenIds = state.mailHidden || {};
  if (snap.mail?.data?.accounts) snap.mail = { ...snap.mail, data: { ...snap.mail.data, accounts: snap.mail.data.accounts.map((a) => ({ ...a, messages: a.messages.map((m) => (hiddenIds[m.id] ? { ...m, hidden: true } : m)) })) } };
  const today = startOfDay();
  const focusToday = state.focusLog.filter((f) => f.at >= today);
  return {
    now: Date.now(),
    tz: TZ,
    demo: DEMO,
    mode: state.mode,
    phase: inWindDown() ? 'winddown' : 'day',
    // The morning brief waits on the desk screen from wake time until it's tapped away.
    morningDue: state.settings.morningBrief && state.morningSeen !== localDay() && !inWindDown()
      && between(nowMinutes(), hmToMin(state.settings.wakeAt), state.settings.windDown ? hmToMin(state.settings.windDownAt) : 23 * 60 + 59),
    hasBacklight: hasBacklight(),
    canRestart,
    school: msStatus(), // Microsoft 365 mail sign-in: { configured, connected, pending: { code, uri }, error }
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
      today: focusToday.map((f) => ({ at: f.at, minutes: f.minutes, label: f.label || null, where: f.where || null })),
    },
    ...snap,
    system: systemStats(),
    digest: state.digest?.day === localDay() ? state.digest : state.digest?.error ? { error: state.digest.error } : null,
    digestRunning,
    journal: state.journal.filter((j) => j.at >= startOfDay(Date.now(), -1)).slice(-40).reverse(),
    recap: state.recap?.day === localDay() ? state.recap : state.recap?.error ? { error: state.recap.error } : null,
    recapRunning,
    dayNote: state.days?.[localDay()]?.note || '',
    desk: { ...desk, online: Date.now() - desk.at < 75e3 },
    voiceReady: Boolean(VOICE_TOKEN),
    claudeReady: Boolean(MCP_TOKEN),
    aiEnabled: DEMO || aiEnabled(),
    alerts: buildAlerts(snap),
  };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Who's asking? The desk screen itself (loopback) is always trusted. Phones and
// laptops sign in with HUB_PASSWORD. If no password is set, devices on the
// home network are let in as before, but anything arriving through a tunnel
// or proxy (i.e. from the internet) is refused outright.
// ---------------------------------------------------------------------------

const SESSION_DAYS = 30;
const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');

function client(req) {
  const addr = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  // A tunnel daemon on the Pi connects from loopback too, so loopback only
  // counts as "the desk screen" when no proxy headers are present.
  const proxied = Boolean(req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip'] || req.headers.forwarded);
  const loopback = addr === '127.0.0.1' || addr === '::1';
  const privateNet = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|f[cd][0-9a-f]{2}:|fe80:)/i.test(addr);
  return { kiosk: loopback && !proxied, lan: (loopback || privateNet) && !proxied, proxied, ip: String(req.headers['cf-connecting-ip'] || addr) };
}

function sessionOf(req) {
  const m = /(?:^|;\s*)hub_session=([a-f0-9]{64})/.exec(req.headers.cookie || '');
  if (!m) return null;
  const key = sha(m[1]);
  return state.sessions[key] > Date.now() ? key : null;
}

function allowed(req) {
  const c = client(req);
  if (c.kiosk) return true;
  if (HUB_PASSWORD) return Boolean(sessionOf(req));
  return c.lan;
}

// Five wrong passwords from one address locks that address out for 15 minutes.
const failures = new Map();
function login(req, res, body) {
  const { ip, proxied } = client(req);
  if (!HUB_PASSWORD) return send(res, 400, { error: 'Set HUB_PASSWORD in .env on the Pi to enable sign-in.' });
  const f = failures.get(ip) || { count: 0, until: 0 };
  if (f.until > Date.now()) return send(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
  const given = sha(String(body.password || '')), want = sha(HUB_PASSWORD);
  if (!crypto.timingSafeEqual(Buffer.from(given), Buffer.from(want))) {
    f.count++;
    if (f.count >= 5) { f.until = Date.now() + 15 * 60e3; f.count = 0; }
    failures.set(ip, f);
    return send(res, 401, { error: 'Wrong password.' });
  }
  failures.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  for (const [k, exp] of Object.entries(state.sessions)) if (exp < Date.now()) delete state.sessions[k];
  state.sessions[sha(token)] = Date.now() + SESSION_DAYS * 86400e3;
  save();
  const secure = proxied || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `hub_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`);
  return send(res, 200, { ok: true });
}

// The ring's phone app authenticates with a token it sends as the Authorization
// header (set in the app: Index 01 Settings -> Webhook). Signed-in devices and
// the desk screen can post notes too.
async function voice(req, res) {
  // Accept "Bearer <token>" or the bare token, ignoring stray whitespace, since
  // it's typed into a phone app by hand.
  const given = String(req.headers.authorization || '').trim();
  const bare = given.replace(/^bearer\s+/i, '').trim();
  const tokenOk = Boolean(VOICE_TOKEN) && crypto.timingSafeEqual(Buffer.from(sha(bare)), Buffer.from(sha(VOICE_TOKEN)));
  if (!tokenOk && !allowed(req)) {
    // Describe the shape of what arrived, never the value, so a mistyped header can be found.
    console.error(`[voice] 401 from ${client(req).ip}: authorization ${given ? 'present' : 'MISSING'}`
      + (given ? `, starts with "Bearer": ${/^bearer\s/i.test(given)}, token length ${bare.length} (expected ${VOICE_TOKEN.length}), 64 hex chars: ${/^[0-9a-f]{64}$/.test(bare)}` : '')
      + `; headers sent: ${Object.keys(req.headers).filter((h) => !/^(cf-|x-forwarded|cdn-)/.test(h)).join(', ')}; trigger: ${req.headers['x-index-trigger'] || 'none'}`);
    return send(res, 401, { error: 'unauthorized' });
  }
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 30e6) return send(res, 413, { error: 'too large' }); chunks.push(chunk); }
  const note = readVoiceRequest(Buffer.concat(chunks), req.headers);
  if (note.test) {
    state.notifications = [...state.notifications, { id: crypto.randomUUID(), level: 'info', source: 'voice', at: Date.now(), title: 'Ring connected', body: 'Test recording received.' }].slice(-50);
    save();
    return send(res, 200, { ok: true, test: true });
  }
  if (!note.text) return send(res, 400, { error: 'no transcription in request' });
  // Answer right away so the phone isn't kept waiting on Claude.
  send(res, 200, { ok: true, queued: `v${note.recordedAt}` });
  // The ring's phone app signs in with the voice token; anything else is typed on a hub screen.
  handleVoice({ ...note, source: tokenOk ? 'ring' : req.headers['x-hub-source'] === 'computer' ? 'computer' : 'typed' }).catch((err) => console.error('[voice]', err.message));
}

function logout(req, res) {
  const key = sessionOf(req);
  if (key) { delete state.sessions[key]; save(); }
  res.setHeader('Set-Cookie', 'hub_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  return send(res, 200, { ok: true });
}

// Claude's way in (see server/mcp.js): tasks, notes and finished work.
const mcp = createMcp({
  state, save, newTodo, makeSubtasks, dayToMs, localDay, startOfDay,
  notify: (title, body) => { state.notifications = [...state.notifications, { id: crypto.randomUUID(), level: 'info', source: 'claude', at: Date.now(), title, body: String(body || '').slice(0, 300) }].slice(-50); save(); },
  snapshot: () => ({ calendar: sources.calendar?.get().data?.events || [], digestHeadline: state.digest?.day === localDay() ? state.digest.headline : null }),
});

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
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
  'GET /api/dashboard': ({ req }) => ({ ...dashboard(), kiosk: client(req).kiosk, signedIn: Boolean(sessionOf(req)) }),

  'POST /api/todos': ({ body }) => {
    const text = String(body.text || '').trim().slice(0, 200);
    if (!text) return [400, { error: 'text required' }];
    const todo = newTodo({ text, tag: body.tag || null, due: body.due ?? null, star: body.star, subtasks: body.subtasks });
    state.todos.push(todo); save(); return todo;
  },
  'PATCH /api/todos/:id': ({ params, body }) => {
    const t = state.todos.find((x) => x.id === params.id);
    if (!t) return [404, { error: 'not found' }];
    for (const k of ['text', 'tag', 'due', 'star', 'done']) if (k in body) t[k] = body[k];
    if ('notes' in body) t.notes = String(body.notes || '').slice(0, 4000);
    if (Array.isArray(body.subtasks)) {
      t.subtasks = body.subtasks.slice(0, 20).map((x) => ({ id: String(x.id || crypto.randomUUID().slice(0, 8)), text: String(x.text || '').trim().slice(0, 160), done: Boolean(x.done) })).filter((x) => x.text);
    }
    if (body.clearUpdates) delete t.updates;
    if (body.suggested === false) { t.suggested = false; t.createdAt = Date.now(); }
    if ('done' in body) t.doneAt = body.done ? Date.now() : null;
    save(); return t;
  },
  'DELETE /api/todos/:id': ({ params }) => { state.todos = state.todos.filter((x) => x.id !== params.id); save(); return { ok: true }; },
  'POST /api/todos/clear-done': () => { state.todos = state.todos.filter((x) => !x.done); save(); return { ok: true }; },

  'POST /api/focus': ({ body }) => {
    const minutes = Math.max(1, Math.min(240, Math.round(Number(body.minutes) || 0)));
    state.focusLog.push({ at: Date.now(), minutes, label: String(body.label || '').slice(0, 60) || null, where: body.where === 'desk' ? 'desk' : body.where === 'here' ? 'here' : null });
    state.focusLog = state.focusLog.slice(-2000); save(); return { ok: true };
  },

  // "Make it a task" on an email: Claude reads the whole message and writes a
  // real task (with subtasks if it has several parts). Added directly, since
  // the person asked for it.
  'POST /api/mail/task': async ({ body }) => {
    const id = String(body.id);
    try {
      const t = DEMO ? demo.taskFromEmail(id) : await taskFromEmail(id, { tags: state.settings.tags, today: localDay() });
      const todo = newTodo({ text: t.text, tag: t.tag, due: t.due ? dayToMs(t.due) : null, subtasks: t.subtasks, source: { from: t.from, subject: t.subject, why: t.why || t.from, emailId: id } });
      state.todos.push(todo);
      state.suggestedFrom[id] = Date.now(); state.taskChecked[id] = Date.now(); // don't suggest it again
      save();
      return todo;
    } catch (err) { return [502, { error: err.message }]; }
  },

  // School/work Microsoft mail: start the code sign-in, or disconnect.
  'POST /api/school/connect': async () => {
    try { return await startSignIn(); } catch (err) { return [400, { error: err.message }]; }
  },
  'POST /api/school/disconnect': () => { msSignOut(); sources.mail?.refresh(); return { ok: true }; },

  'POST /api/restart': () => {
    if (!canRestart) return [403, { error: "The hub isn't allowed to restart the Pi yet. Run scripts/allow-restart.sh on the Pi once." }];
    if (DEMO) return { ok: true, demo: true };
    writeJson(STATE_FILE, state); // don't lose the last few seconds of changes
    console.log('[restart] rebooting on request');
    setTimeout(() => execFile('systemctl', ['reboot'], (err) => { if (err) console.error('[restart]', err.message); }), 1200);
    return { ok: true };
  },

  'POST /api/peek': () => { peek(); return { ok: true, ms: PEEK_MS }; },

  'POST /api/mail/read': async ({ body }) => {
    try { return DEMO ? demo.message(String(body.id)) : await readMessage(String(body.id)); }
    catch (err) { return [404, { error: err.message }]; }
  },

  'POST /api/morning/seen': () => { state.morningSeen = localDay(); save(); return { ok: true }; },

  // Workstation: Claude drafts a reply to an email. Nothing is sent; the draft goes back to be edited.
  'POST /api/mail/draft': async ({ body }) => {
    const id = String(body.id || '');
    if (DEMO) { await new Promise((r) => setTimeout(r, 1400)); return { draft: demo.draft(id) }; }
    if (!aiEnabled()) return [400, { error: 'Needs ANTHROPIC_API_KEY in .env' }];
    try { return { draft: await draftReply(id, { today: localDay() }) }; }
    catch (err) { return [502, { error: err.message }]; }
  },
  // Workstation: mark an email done so it leaves the hub's inbox (the mailbox itself is not changed).
  'POST /api/mail/hide': ({ body }) => {
    const id = String(body.id || '');
    if (!id) return [400, { error: 'id required' }];
    state.mailHidden ||= {};
    if (body.hidden === false) delete state.mailHidden[id]; else state.mailHidden[id] = Date.now();
    const cutoff = Date.now() - 60 * 86400e3;
    for (const [k, at] of Object.entries(state.mailHidden)) if (at < cutoff) delete state.mailHidden[k];
    save(); return { ok: true };
  },

  // The desk screen reports what it shows and its timer; other screens can steer it.
  'POST /api/desk/report': ({ body, req }) => {
    if (!client(req).kiosk) return [403, { error: 'desk screen only' }];
    const t = body.timer && typeof body.timer === 'object' ? body.timer : null;
    desk = { view: String(body.view || 'home').slice(0, 20), at: Date.now(),
      timer: t ? { phase: String(t.phase || 'focus'), running: Boolean(t.running), endsAt: Number(t.endsAt) || 0, remaining: t.remaining == null ? null : Number(t.remaining), total: Number(t.total) || 0, label: String(t.label || '').slice(0, 200) } : null };
    emit({ type: 'desk.state', desk: { ...desk, online: true } });
    return { ok: true };
  },
  'POST /api/desk/view': ({ body }) => {
    const view = String(body.view || '');
    if (!['home', 'focus', 'tasks', 'payit', 'mail', 'journal', 'schedule', 'settings'].includes(view)) return [400, { error: 'unknown view' }];
    emit({ type: 'desk.view', view }); return { ok: true };
  },
  'POST /api/desk/focus': ({ body }) => {
    const minutes = Math.max(1, Math.min(180, Math.round(Number(body.minutes) || 25)));
    emit({ type: 'desk.focus', minutes, label: String(body.label || '').slice(0, 200) }); return { ok: true };
  },
  'POST /api/desk/timer': ({ body }) => {
    if (!['pause', 'resume', 'end'].includes(body.action)) return [400, { error: 'unknown action' }];
    emit({ type: 'desk.timer', action: body.action }); return { ok: true };
  },

  'POST /api/mode': ({ body }) => {
    if (!['day', 'sleep'].includes(body.mode)) return [400, { error: 'bad mode' }];
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

  // Journal → Past days: every recorded day, newest first; ?q= keeps only what matches.
  'GET /api/journal/days': ({ query }) => {
    const q = (query.get('q') || '').trim().toLowerCase();
    const days = new Map();
    const day = (ms) => {
      const key = localDay(ms);
      if (!days.has(key)) days.set(key, { date: key, at: startOfDay(ms), summary: state.days?.[key]?.summary || '', note: state.days?.[key]?.note || '', focusMinutes: 0, tasksDone: 0, entries: [] });
      return days.get(key);
    };
    for (const j of state.journal) {
      if (j.pending) continue;
      const done = (j.completed || []).map((t) => `Done: ${t}`), added = (j.tasks || []).map((t) => `Task: ${t}`);
      day(j.at).entries.push({ at: j.at, kind: j.kind || 'note', text: j.note || j.text, said: j.note && j.note !== j.text ? j.text : '', done: j.completed || [], tasks: j.tasks || [], action: [...done, ...added].join(' · ') });
    }
    // A day with only a written note still counts as a recorded day.
    for (const [key, rec] of Object.entries(state.days || {})) if (rec.note) day(dayToMs(key) + 12 * 3600e3);
    day(Date.now());
    for (const f of state.focusLog) if (days.has(localDay(f.at))) day(f.at).focusMinutes += f.minutes;
    for (const t of state.todos) if (t.done && t.doneAt && days.has(localDay(t.doneAt))) day(t.doneAt).tasksDone++;
    const today = localDay(), yesterday = localDay(Date.now() - 86400e3);
    let list = [...days.values()].sort((a, b) => b.at - a.at).map((d) => ({
      ...d, entries: d.entries.sort((a, b) => a.at - b.at),
      label: d.date === today ? 'Today' : d.date === yesterday ? 'Yesterday' : new Date(d.at + 12 * 3600e3).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ }),
    }));
    const hit = (text) => Boolean(text) && text.toLowerCase().includes(q);
    if (q) {
      list = list.map((d) => {
        const entries = d.entries.filter((e) => hit(e.text) || hit(e.action));
        return { ...d, entries, matches: entries.length + (hit(d.summary) ? 1 : 0) + (hit(d.note) ? 1 : 0) };
      }).filter((d) => d.matches);
    } else list = list.map((d) => ({ ...d, matches: 0 }));
    return { days: list.slice(0, 60) };
  },
  // The day's free-form note, written on the workstation. Saved as typed; nothing is sent to Claude.
  'POST /api/journal/note': ({ body }) => {
    state.days ||= {};
    const key = localDay();
    state.days[key] = { ...(state.days[key] || {}), note: String(body.text || '').slice(0, 20000), noteAt: Date.now() };
    save(); return { ok: true, at: state.days[key].noteAt };
  },
  // A typed note for today. Kept as written: nothing is sent to Claude or turned into tasks.
  'POST /api/journal/daynote': ({ body }) => {
    const text = String(body.text || '').trim().slice(0, 1000);
    if (!text) return [400, { error: 'empty note' }];
    const id = `n${Date.now()}`, actions = [{ kind: 'note', text: "Saved to today's notes" }];
    state.journal.push({ id, at: Date.now(), text, note: text, kind: 'daynote', tasks: [], actions, trigger: 'typed' });
    state.journal = state.journal.slice(-400); save();
    emit({ type: 'journal.entry', id, source: 'typed', said: text, stage: 'done', actions });
    return { ok: true };
  },
  'POST /api/recap': () => {
    if (!DEMO && !aiEnabled()) return [400, { error: 'Needs ANTHROPIC_API_KEY in .env' }];
    runRecap();
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
    if (url.pathname === '/mcp' || url.pathname.startsWith('/mcp/')) return await mcp(req, res, url, MCP_TOKEN);
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/login' && req.method === 'POST') return login(req, res, await readBody(req));
      if (url.pathname === '/api/logout' && req.method === 'POST') return logout(req, res);
      if (url.pathname === '/api/voice' && req.method === 'POST') return voice(req, res);
      // /api/notify can also be reached with its own bearer token (scripts, webhooks).
      const viaNotifyToken = url.pathname === '/api/notify' && NOTIFY_TOKEN && req.headers.authorization === `Bearer ${NOTIFY_TOKEN}`;
      if (!viaNotifyToken && !allowed(req)) return send(res, 401, { error: 'sign in required', canSignIn: Boolean(HUB_PASSWORD) });
      if (url.pathname === '/api/events' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write(': connected\n\n');
        streams.add(res);
        req.on('close', () => streams.delete(res));
        return;
      }
      const found = match(req.method, url.pathname);
      if (!found) return send(res, 404, { error: 'not found' });
      const body = ['POST', 'PATCH'].includes(req.method) ? await readBody(req) : {};
      const out = await found.handler({ params: found.params, body, req, query: url.searchParams });
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
