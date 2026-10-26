import { openKeyboard } from './keyboard.js';
import { mountClocks } from './stars.js';
import { createWorkstation } from './workstation.js';

// ---------------------------------------------------------------------------
// Basics
// ---------------------------------------------------------------------------

// The desk screen loads the hub from localhost; anything else (a phone, a
// laptop, a tunnel URL) is a remote: it uses the device's own keyboard, never
// blacks out for sleep mode, and treats sleep/wake as a remote control.
// (?remote=1 forces remote mode on localhost, for testing.)
const KIOSK = ['localhost', '127.0.0.1'].includes(location.hostname) && !new URLSearchParams(location.search).has('remote');
window.HUB_REMOTE = !KIOSK;
document.documentElement.classList.toggle('remote', !KIOSK);
document.documentElement.classList.toggle('kiosk', KIOSK);

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  focus: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
  pin: '<path d="M12 21s7-6.1 7-11a7 7 0 0 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  tasks: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="m8 12 3 3 5-6"/>',
  payit: '<path d="M4 20V11M10 20V5M16 20v-6M2 20h20"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>',
  journal: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  schedule: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  bell: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>',
  skip: '<path d="M5 4v16l11-8zM19 4v16"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  up: '<path d="m5 12 5 5 9-10"/>',
  warnI: '<path d="M12 3 2 20h20zM12 10v4M12 17h0"/>',
  downI: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  cloud: '<path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z"/>',
  rain: '<path d="M7 15a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 7a4 4 0 0 1-1 8zM8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
  snow: '<path d="M7 15a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 7a4 4 0 0 1-1 8zM8 19h0M12 21h0M16 19h0"/>',
  storm: '<path d="M7 15a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 7a4 4 0 0 1-1 8zM12 14l-2 4h4l-2 4"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  claude: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>',
  hand: '<path d="M8 12.5V6a1.5 1.5 0 0 1 3 0v5M11 10.5V4.5a1.5 1.5 0 0 1 3 0v6M14 10.5V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7 6 6 0 0 1-5.3-3.2L3.3 15a1.5 1.5 0 0 1 2.6-1.5L8 16"/>',
  dots: '<path d="M6 12h.01M12 12h.01M18 12h.01"/>',
};
const icon = (name, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24">${ICONS[name]}</svg>`;

const money = (cents, exact = false) => {
  const v = cents / 100;
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: exact || v < 100 ? 2 : 0, minimumFractionDigits: exact || v < 100 ? 2 : 0 });
};
const hm = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const dayStart = (offset = 0) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + offset); return d.getTime(); };
const ago = (iso) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60e3);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
};
const dayLabel = (ms) => {
  if (ms < dayStart(1)) return 'Today';
  if (ms < dayStart(2)) return 'Tomorrow';
  return new Date(ms).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
};
const pad = (n) => String(n).padStart(2, '0');

// WMO weather codes -> label + glyph
function wx(code) {
  if (code === 0) return ['Clear', 'sun'];
  if (code <= 2) return ['Partly cloudy', 'cloud'];
  if (code === 3) return ['Overcast', 'cloud'];
  if (code <= 48) return ['Fog', 'cloud'];
  if (code <= 67 || (code >= 80 && code <= 82)) return ['Rain', 'rain'];
  if (code <= 77 || code === 85 || code === 86) return ['Snow', 'snow'];
  return ['Storms', 'storm'];
}

// ---------------------------------------------------------------------------
// The sky. The backdrop is Aurora (cool blue) in the morning and fades to Dusk
// (warm plum and amber) as the sun goes down; it eases back before dawn. The
// glass is brighter and more solid while the sun is up, darker after sunset.
// Both follow the real sunrise and sunset for the hub's location.
// ---------------------------------------------------------------------------

const SKY = {
  aurora: { base: [14, 20, 36], b1: [42, 79, 168], b2: [90, 71, 166], b3: [31, 127, 134] },
  dusk: { base: [26, 18, 32], b1: [168, 85, 63], b2: [122, 63, 143], b3: [156, 106, 42] },
  // PayIt's own screen: a deep take on its brand teal-green, whatever the hour.
  payit: { base: [6, 26, 23], b1: [13, 128, 116], b2: [9, 82, 74], b3: [20, 112, 82] },
};
const lerp = (a, b, t) => a + (b - a) * t;
const ramp = (x, from, to) => { const t = Math.min(1, Math.max(0, (x - from) / (to - from))); return t * t * (3 - 2 * t); };

/** @returns {{ warm: number, day: number }}  warm: 0 = Aurora, 1 = Dusk.  day: 0 = night, 1 = full daylight. */
function skyAt(now, sunrise, sunset) {
  const M = 60e3, noon = (sunrise + sunset) / 2;
  const day = Math.min(ramp(now, sunrise - 25 * M, sunrise + 25 * M), 1 - ramp(now, sunset - 25 * M, sunset + 25 * M));
  let warm;
  if (now < sunrise - 90 * M) warm = 1;                                // deep night: still Dusk
  else if (now < sunrise) warm = 1 - ramp(now, sunrise - 90 * M, sunrise); // pre-dawn: easing to Aurora
  else if (now < noon) warm = 0;                                       // morning: Aurora
  else warm = ramp(now, noon, sunset);                                 // afternoon: fading to Dusk, complete at sunset
  return { warm, day };
}

function applySky() {
  const w = D?.weather?.data;
  const now = Date.now();
  // Real sun times when the forecast has them; otherwise a plain 7am-7pm day.
  let rise = w?.sunrise ? new Date(w.sunrise).getTime() : dayStart() + 7 * 3600e3;
  let set = w?.sunset ? new Date(w.sunset).getTime() : dayStart() + 19 * 3600e3;
  if (!(rise < set)) { rise = dayStart() + 7 * 3600e3; set = dayStart() + 19 * 3600e3; }
  const sky = window.__sky || skyAt(now, rise, set); // window.__sky = { warm, day } pins it, for trying looks out
  // Graphite has no backdrop: only Home's hero card shifts, to its dusk gradient late in the day.
  document.documentElement.classList.toggle('dusk', sky.warm > 0.5 || sky.day < 0.3);
}
setInterval(applySky, 60e3);

async function api(method, url, body) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401 && url !== '/api/login') {
    const info = await res.json().catch(() => ({}));
    showLogin(info.canSignIn);
    throw new Error('Sign in required');
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let D = null; // last dashboard snapshot
let view = 'home';
const ui = { taskFilter: 'open', chartSel: {}, schedDay: 0, drawer: 'alerts', reading: null, taskOpen: null, jTab: 'today', jQuery: '', jDays: null, jOpen: null, entering: true, sysOpen: false,
  call: null, callLater: {}, claudeOpening: null };

async function load() {
  try {
    D = await api('GET', '/api/dashboard');
    applySky();
    syncMode();
    handleAlerts();
    watchClaude();
    watchJournal();
    listenForEvents();
    render();
  } catch (err) {
    console.error(err);
  }
}

// ---------------------------------------------------------------------------
// Chime (Web Audio; the kiosk launches Chromium with autoplay allowed)
// ---------------------------------------------------------------------------

let audio;
function chime(kind = 'soft') {
  if (D && !D.settings.chime) return;
  try {
    audio ??= new AudioContext();
    const notes = kind === 'done' ? [660, 880, 1320] : kind === 'alert' ? [880, 660] : [880];
    notes.forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const t = audio.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g).connect(audio.destination);
      o.start(t); o.stop(t + 1);
    });
  } catch {}
}

// ---------------------------------------------------------------------------
// Focus timer (lives in the browser so it ticks smoothly; finished sessions
// are logged to the server)
// ---------------------------------------------------------------------------

const PHASES = { focus: 'Focus', short: 'Short break', long: 'Long break' };
const T = Object.assign(
  { phase: 'focus', running: false, endsAt: 0, remaining: null, total: null, label: '', cycle: 0, lock: false, done: null },
  JSON.parse(localStorage.getItem('timer') || '{}'),
);
const saveT = () => localStorage.setItem('timer', JSON.stringify(T));
if (T.lock && !T.running && T.remaining == null && !T.done) T.lock = false;
const phaseMinutes = (p) => T.custom?.[p] || (p === 'focus' ? D?.settings.focusMinutes : p === 'short' ? D?.settings.shortBreak : D?.settings.longBreak) || 25;
function tLeft() {
  if (T.running) return Math.max(0, T.endsAt - Date.now());
  return T.remaining ?? phaseMinutes(T.phase) * 60e3;
}
const tTotal = () => T.total ?? phaseMinutes(T.phase) * 60e3;
const fmtLeft = (ms) => { const s = Math.ceil(ms / 1000); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };

function timerStart() { T.total = tTotal(); T.endsAt = Date.now() + tLeft(); T.running = true; saveT(); render(); }
function timerPause() { T.remaining = tLeft(); T.running = false; saveT(); render(); }
function timerReset(phase = T.phase) { Object.assign(T, { phase, running: false, remaining: null, total: null }); saveT(); render(); }
function timerAdjust(min) {
  const left = Math.max(60e3, tLeft() + min * 60e3);
  T.total = Math.max(left, tTotal() + min * 60e3);
  if (T.running) T.endsAt = Date.now() + left; else T.remaining = left;
  saveT(); render();
}
async function timerFinish(skipped = false) {
  const wasFocus = T.phase === 'focus';
  const doneTotal = tTotal() - (skipped ? tLeft() : 0);
  T.running = false;
  if (wasFocus) {
    const minutes = Math.round((tTotal() - (skipped ? tLeft() : 0)) / 60e3);
    if (minutes >= 1) api('POST', '/api/focus', { minutes, label: T.label, where: KIOSK ? 'desk' : 'here' }).then(load).catch(() => {});
    T.cycle = (T.cycle + 1) % 4;
    timerReset(T.cycle === 0 ? 'long' : 'short');
  } else {
    timerReset('focus');
  }
  if (T.lock) {
    // Stay in the locked screen and show what just happened.
    T.done = { wasFocus, minutes: Math.round(doneTotal / 60e3), skipped };
    saveT();
    if (!skipped) chime('done');
    renderLock();
  } else if (!skipped) { chime('done'); toast({ level: 'info', title: wasFocus ? 'Focus session done — take a break' : 'Break over — ready to focus?' }); }
}

// ---------------------------------------------------------------------------
// Focus lock: starting a focus session takes over the whole screen. Nothing
// else is reachable, ordinary notifications wait, and leaving takes a
// deliberate press-and-hold.
// ---------------------------------------------------------------------------

let lockCount = 0, lockCountTimer = null;
const lockOn = () => D?.settings.focusLock !== false;

function startFocus() {
  if (!lockOn() || wsMode()) return timerStart(); // the lock is for the desk screen; a laptop just runs the timer
  T.lock = true; T.done = null; saveT();
  // A fresh session gets a short "settle in" count; resuming a paused one doesn't.
  if (!T.running && T.remaining == null) {
    lockCount = 3; renderLock();
    clearInterval(lockCountTimer);
    lockCountTimer = setInterval(() => {
      lockCount--;
      if (lockCount <= 0) { clearInterval(lockCountTimer); if (T.lock) timerStart(); }
      renderLock();
    }, 1000);
  } else timerStart();
}

function exitLock() {
  clearInterval(lockCountTimer); lockCount = 0;
  T.lock = false; T.done = null; saveT();
  render();
}

function renderLock() {
  const el = $('#focuslock');
  if (!T.lock) { el.hidden = true; el.dataset.html = ''; return; }
  const isFocus = T.phase === 'focus';
  const hold = (label) => `<button class="fl-hold" data-hold="lock-exit"><i></i><span>${label}</span></button>`;
  const dots = (n) => `<div class="cycle">${[0, 1, 2, 3].map((i) => `<i class="${i < n ? 'done' : i === n ? 'now' : ''}"></i>`).join('')}</div>`;
  let html;
  if (lockCount > 0) {
    html = `<div class="fl-kicker">Settle in</div>
      <div class="fl-num" data-n="${lockCount}">${lockCount}</div>
      <div class="fl-label">${esc(T.label || `${phaseMinutes('focus')} minutes of focus`)}</div>${hold('Hold to cancel')}`;
  } else if (T.done) {
    const d = T.done;
    html = `<div class="fl-check">${icon('check')}</div>
      <div class="fl-nice">${d.wasFocus ? (d.skipped ? 'Session ended' : 'Nice work') : 'Break over'}</div>
      <div class="fl-label">${d.wasFocus ? `${d.minutes} minute${d.minutes === 1 ? '' : 's'} of focus · ${D.focus.todayMinutes} today` : 'Ready for the next one?'}</div>
      ${dots(T.cycle || (d.wasFocus ? 4 : 0))}
      <div class="pills end">
        ${d.wasFocus ? `<button class="pill-btn solid" data-act="lock-break">Start ${phaseMinutes(T.phase)} min ${T.phase === 'long' ? 'long ' : ''}break</button>`
                     : `<button class="pill-btn solid" data-act="lock-next">Focus · ${phaseMinutes('focus')} min</button>`}
        <button class="pill-btn" data-act="lock-leave">Done for now</button>
      </div>`;
  } else {
    const active = T.running || T.remaining != null;
    // The task being worked on, in full, with its steps to tick off along the way.
    const task = isFocus && T.label ? D.todos.find((t) => !t.done && t.text === T.label) : null;
    const subs = task?.subtasks || [], due = task && dueLabel(task);
    const panel = task ? `<section class="fl-task ${task.finishing ? 'finishing' : ''}">
        <b>${esc(task.text)}</b>
        <div class="fl-meta">${task.tag ? `<span><i style="background:${tagColor(task.tag)}"></i>${esc(task.tag)}</span>` : ''}${due ? `<span class="due">Due ${due[0].toLowerCase()}</span>` : ''}</div>
        <div class="fl-steps">${subs.map((x) => `<button class="${x.done ? 'done' : ''}" data-act="sub-toggle" data-id="${task.id}" data-sid="${x.id}"><i class="check ${x.done ? 'done' : ''}">${x.done ? icon('check') : ''}</i><span>${esc(x.text)}</span></button>`).join('')}</div>
        <button class="fl-add" data-act="sub-add" data-id="${task.id}">${icon('plus')} Add a step</button>
      </section>` : '';
    html = `<div class="fl-kicker">${isFocus ? `Focus · session ${T.cycle + 1} of 4` : PHASES[T.phase]}</div>
      <div class="fl-ring ${task && subs.length > 4 ? 'compact' : ''}">
        ${ring(380, 14, active ? tLeft() / tTotal() : 1, isFocus ? 'url(#g-focus)' : 'url(#g-cal)').replace('class="ring-fg"', 'class="ring-fg" data-left="1"')}
        <div class="fl-center"><span class="fl-time" data-timer>${fmtLeft(tLeft())}</span>
          <span class="fl-sub ${T.running ? '' : 'paused'}">${T.running ? `Ends ${hm(T.endsAt)}` : 'Paused'}</span></div>
      </div>${panel}
      <div class="pills">
        ${T.running ? `<button class="pill-btn strong" data-act="t-pause">Pause</button>` : `<button class="pill-btn solid" data-act="lock-resume">Resume</button>`}
        <button class="pill-btn" data-act="t-adj" data-min="5">+5 min</button>
        <button class="pill-btn" data-act="t-skip">${isFocus ? 'End' : 'Skip'}</button>
      </div>${hold('Hold to leave early')}`;
  }
  // The time text and ring are updated by the per-second tick; only redraw when the shape changes.
  const key = html.replace(/data-timer>[^<]*</, 'data-timer><').replace(/stroke-dashoffset="[^"]*"/, '');
  if (el.dataset.html !== key) { el.innerHTML = html; el.dataset.html = key; }
  el.hidden = false;
}

// Press and hold to leave the lock (a stray tap shouldn't break a session).
let holdTimer = null;
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest?.('[data-hold]');
  if (!b) return;
  b.classList.add('holding');
  holdTimer = setTimeout(() => { b.classList.remove('holding'); if (b.dataset.hold === 'lock-exit') exitLock(); }, 1000);
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
  document.addEventListener(ev, () => { clearTimeout(holdTimer); document.querySelectorAll('.holding').forEach((b) => b.classList.remove('holding')); }, true);
}


// Per-second tick: only touches the timer text/ring, never re-renders the page.
setInterval(() => {
  if (T.running && tLeft() <= 0) timerFinish();
  const left = tLeft(), frac = 1 - left / tTotal();
  document.querySelectorAll('[data-timer]').forEach((el) => (el.textContent = fmtLeft(left)));
  const on = T.running || T.remaining != null;
  document.querySelectorAll('.ring-fg').forEach((el) => el.setAttribute('stroke-dashoffset', el.dataset.c * (1 - Math.max(0.002, el.dataset.left ? (on ? left / tTotal() : 1) : on ? frac : 0))));
  if (on) document.querySelectorAll('[data-dial] [data-tick]').forEach((el) => el.classList.toggle('lit', el.dataset.tick / 60 < frac));
  if (D?.mode && D.mode !== 'day') renderSleep();
  renderBanner();
  if (wsMode()) WS.tick();
  reportDesk();
}, 1000);

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function notConfigured(what, hint) {
  return `<div class="empty">${esc(what)} isn't set up yet.<br><span style="font-size:14px">${esc(hint)}</span></div>`;
}

const realTodos = () => D.todos.filter((t) => !t.suggested);
const suggestedTodos = () => D.todos.filter((t) => t.suggested);

function todoSort(a, b) {
  return (a.done - b.done) || (b.star - a.star) || ((a.due ?? Infinity) - (b.due ?? Infinity)) || (a.createdAt - b.createdAt);
}




// The focus dial: one turn is 90 minutes for focus, 30 for a break.

const dialMax = (phase) => (phase === 'focus' ? 90 : 30);
const dialPresets = (phase) => (phase === 'focus' ? [15, 25, 45, 60, 90] : [3, 5, 10, 15, 20]);
function dialSet(m) {
  T.custom = { ...(T.custom || {}), [T.phase]: m };
  T.remaining = null; T.total = null;
  saveT();
}

// "22:00" -> "10:00 PM", for showing a stored time setting.
const clock12 = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`; };

/** A task's due date as [label, class]: Overdue, Today, Tomorrow or a weekday. */
function dueLabel(t) {
  if (!t.due) return null;
  if (t.due < dayStart()) return ['Overdue', 'overdue'];
  if (t.due < dayStart(1)) return ['Today', 'today'];
  if (t.due < dayStart(2)) return ['Tomorrow', ''];
  if (t.due < dayStart(7)) return [new Date(t.due).toLocaleDateString('en-US', { weekday: 'short' }), ''];
  return [new Date(t.due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), ''];
}
const TAG_COLORS = ['#8AB4FF', '#5EE6B0', '#C59CFF', '#FFB547', '#FF9DB0'];
const tagColor = (tag) => TAG_COLORS[Math.max(0, (D?.settings.tags || []).indexOf(tag)) % TAG_COLORS.length];

/** A compact task row (Home, wind-down): check, one line of text, the due date underneath. */
function taskLine(t) {
  const subs = t.subtasks || [], done = subs.filter((x) => x.done).length, due = dueLabel(t);
  const on = t.done || t.finishing;
  return `<div class="tk ${t.finishing ? 'finishing' : ''}">
    <button class="check ${on ? 'done' : ''}" data-act="todo-toggle" data-id="${t.id}" aria-label="Done">${on ? icon('check') : ''}</button>
    <div class="tk-t"><b>${esc(t.text)}</b>${due || subs.length ? `<span>${due ? `<i class="${due[1]}">${due[0]}</i>` : ''}${subs.length ? `<i>${done}/${subs.length} steps</i>` : ''}</span>` : ''}</div>
  </div>`;
}

// Claude chats on the Mac (from the Claude Status menu bar app). Each project keeps its own colour,
// so chats are easy to tell apart at a glance. Tapping a chat anywhere on the desk opens it on the Mac.
const CLAUDE_GLYPH = { needs: 'hand', running: 'dots', done: 'check' };
const PROJECT_COLORS = ['#8AB4FF', '#6EF0B4', '#C59CFF', '#FFB547', '#FF9DB0', '#5EE6E6', '#FF9354', '#B9E66E'];
const projectColor = (name) => { let h = 7; for (const ch of name || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PROJECT_COLORS[h % PROJECT_COLORS.length]; };
const claudeChats = () => (D?.claude?.online ? D.claude.chats : []);
/** needs | new (finished, not opened yet) | running | read */
const chatKind = (c) => (c.state === 'done' ? (c.unread ? 'new' : 'read') : c.state);
const KIND_RANK = { needs: 0, new: 1, running: 2, read: 3 };
/** What deserves a look: waiting on you, then finished and unread, then working. Newest first within each. */
const claudeLive = (chats = claudeChats()) => chats.filter((c) => chatKind(c) !== 'read')
  .sort((a, b) => KIND_RANK[chatKind(a)] - KIND_RANK[chatKind(b)] || b.since - a.since);
const agoMs = (ms) => ago(new Date(ms).toISOString());
const forHow = (c) => { const a = agoMs(c.since); return c.state === 'running' ? (a === 'now' ? 'just started' : `for ${a}`) : a === 'now' ? 'just now' : `${a} ago`; };

/** One chat as a row: status glyph, title, project and what it's doing (or said last), and how long. */
function chatLine(c, withPreview = false) {
  const k = chatKind(c);
  const info = k === 'needs' ? c.detail || 'Needs you' : k === 'running' ? c.detail || 'Working' : withPreview || k === 'new' ? c.preview || 'Finished' : 'Finished';
  return `<div class="cc ${k}" style="--pc:${projectColor(c.project)}" data-act="claude-open" data-id="${esc(c.id)}">
    <span class="cc-glyph">${icon(CLAUDE_GLYPH[c.state])}</span>
    <div class="cc-t"><b>${esc(c.title)}</b><span>${c.project ? `<i>${esc(c.project)}</i>` : ''}<em>${esc(info)}</em></span></div>
    <span class="cc-age">${k === 'new' ? '<s>New</s>' : agoMs(c.since)}</span></div>`;
}

/** One chat as a tile on the Claude board. */
function chatTile(c) {
  const k = chatKind(c);
  const opening = ui.claudeOpening?.id === c.id;
  const line = k === 'needs' ? c.detail || 'Waiting on you' : k === 'running' ? c.detail || 'Working' : c.preview || 'Finished';
  return `<button class="cb-tile ${k} ${opening ? 'opening' : ''}" style="--pc:${projectColor(c.project)}" data-act="claude-open" data-id="${esc(c.id)}">
    <div class="cb-top"><span class="cb-proj">${esc(c.project || 'Claude')}</span><span class="cb-badge">${{ needs: 'Needs you', new: 'New', running: 'Working' }[k]}</span></div>
    <b class="cb-title">${esc(c.title)}</b>
    <div class="cb-line">${icon(CLAUDE_GLYPH[c.state])}<span>${esc(line)}</span></div>
    ${k === 'running' ? '<div class="cb-run"><i></i></div>' : ''}
    <div class="cb-foot"><span>${esc(forHow(c))}</span><em>${opening ? 'Opening on your Mac…' : 'Tap to open on your Mac'}</em></div>
  </button>`;
}

/** A calendar event as one line: when, what, where. Tap for the details sheet. */
function eventLine(e) {
  const live = !e.allDay && e.start <= Date.now() && e.end > Date.now();
  const when = e.allDay ? 'All day' : live ? 'Now' : e.start < dayStart(1) ? hm(e.start) : `${new Date(e.start).toLocaleDateString('en-US', { weekday: 'short' })} ${hm(e.start)}`;
  return `<div class="ev tap" data-act="event" data-id="${esc(e.id || '')}">
    <span class="ev-when ${live ? 'now' : ''}">${esc(when)}</span><span class="ev-title">${esc(e.title)}</span><span class="ev-where">${esc((e.location || e.calendar || '').split(',')[0])}</span></div>`;
}

/**
 * A progress ring. `color` may be a CSS colour or a gradient reference such as url(#g-focus)
 * (the gradients are defined once in index.html). `still` rings don't follow the running timer.
 */
function ring(size, stroke, frac, color, still = false, ticks = false) {
  const m = size / 2, r = m - stroke / 2 - (ticks ? 14 : 0), c = 2 * Math.PI * r;
  let marks = '';
  if (ticks) for (let i = 0; i < 60; i++) {
    const a = (i / 60) * 2 * Math.PI, r1 = m - 3, r2 = m - (i % 5 ? 8 : 12);
    marks += `<line x1="${(m + r1 * Math.sin(a)).toFixed(1)}" y1="${(m - r1 * Math.cos(a)).toFixed(1)}" x2="${(m + r2 * Math.sin(a)).toFixed(1)}" y2="${(m - r2 * Math.cos(a)).toFixed(1)}" class="${i / 60 < frac ? 'lit' : ''} ${i % 5 ? '' : 'major'}" data-tick="${i}"/>`;
  }
  return `<svg class="ring-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${m}" cy="${m}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${stroke}"/>
    <circle class="${still ? 'ring-still' : 'ring-fg'}" cx="${m}" cy="${m}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.max(0.002, Math.min(1, frac)))}" data-c="${c}" transform="rotate(-90 ${m} ${m})"/>${marks}</svg>`;
}

/** A full task row for the To do list: tap the text to open its steps. */
function taskRow(t) {
  const subs = t.subtasks || [], done = subs.filter((x) => x.done).length, due = dueLabel(t);
  const on = t.done || t.finishing, open = ui.taskOpen === t.id && !t.finishing;
  const upd = t.updates || [];
  return `<div class="task ${t.done ? 'done' : ''} ${t.finishing ? 'finishing' : ''}">
    <div class="task-main">
      <button class="check big ${on ? 'done' : ''}" data-act="todo-toggle" data-id="${t.id}" aria-label="Done">${on ? icon('check') : ''}</button>
      <button class="task-body" data-act="task-open" data-id="${t.id}">
        <b>${esc(t.text)}</b>
        <span>${t.tag ? `<i><u style="background:${tagColor(t.tag)}"></u>${esc(t.tag)}</i>` : ''}${due && !t.done ? `<i class="${due[1]}">${due[0]}</i>` : ''}${subs.length ? `<i>${done}/${subs.length} steps</i>` : ''}${upd.length ? '<i class="violet">Updated</i>' : ''}</span>
      </button>
      <button class="star ${t.star ? 'on' : ''}" data-act="todo-star" data-id="${t.id}" aria-label="Star">${icon('star')}</button>
    </div>
    ${open ? `<div class="task-detail">
      ${upd.map((u) => `<div class="upd"><span>${esc(u.note)}${u.from ? ` · ${esc(u.from.replace(/\s*<.*>/, ''))}` : ''}</span><button data-act="update-clear" data-id="${t.id}">Got it</button></div>`).join('')}
      ${t.source?.why ? `<div class="task-why">${esc(t.source.why)}</div>` : ''}
      ${subs.map((x) => `<div class="step ${x.done ? 'done' : ''}"><button class="step-main" data-act="sub-toggle" data-id="${t.id}" data-sid="${x.id}"><i class="check small ${x.done ? 'done' : ''}">${x.done ? icon('check') : ''}</i><span>${esc(x.text)}</span></button>
        <button class="step-x" data-act="sub-del" data-id="${t.id}" data-sid="${x.id}" aria-label="Remove step">${icon('x')}</button></div>`).join('')}
      <div class="task-foot">${t.done ? '<span></span>' : `<button data-act="sub-add" data-id="${t.id}">${icon('plus')} Add a step</button>`}<button class="del" data-act="todo-del" data-id="${t.id}">Delete</button></div>
    </div>` : ''}
  </div>`;
}

/**
 * A small bar chart: tap a bar to read it (there is no hover on a touchscreen).
 * `label(i)` names the bar in the caption above the bars.
 */
function barChart(id, values, label, gap = 5) {
  const max = Math.max(1, ...values);
  const sel = ui.chartSel[id] ?? Math.max(0, values.findLastIndex((v) => v > 0));
  return `<div class="bar-cap">${values.length ? `${esc(label(sel))} · ${money(values[sel] || 0)}` : 'No data yet'}</div>
    <div class="bars" style="gap:${gap}px">${values.map((v, i) => `<button data-act="chart" data-id="${id}" data-i="${i}" aria-label="${esc(label(i))}"><i class="${i === sel ? 'on' : ''}" style="height:${Math.max(2, (v / max) * 100).toFixed(1)}%"></i></button>`).join('')}</div>`;
}

// The iPhone app's day from Apple Health, told in a few sentences (the phone writes them);
// the numbers stay on the phone's Health page.
function bodyCard() {
  const h = D.health;
  if (!h) return `<section class="card body-card"><div class="ch">${icon('heart')}<span class="title">How you're doing</span></div>
    <div class="empty">Connect Apple Health in the Desk Hub iPhone app and a summary of how your day is going shows up here.</div></section>`;
  const st = h.stress, tone = !st ? '' : st.score >= 75 ? 'bad' : st.score >= 60 ? 'warn' : st.score < 35 ? 'calm' : '';
  const headline = h.headline || (st ? st.label.replace(/^./, (x) => x.toUpperCase()) : 'You checked in');
  const note = h.checkins?.at(-1)?.note;
  return `<section class="card body-card">
    <div class="ch">${icon('heart')}<span class="title">How you're doing</span><span class="meta">${h.updatedAt ? `from your phone · ${hm(h.updatedAt)}` : ''}</span></div>
    <div class="body-label ${tone}">${esc(headline)}</div>
    ${h.summary ? `<p class="body-story">${esc(h.summary)}</p>` : ''}
    ${note ? `<p class="body-note">“${esc(note)}”</p>` : ''}
  </section>`;
}

// PayIt Plus: merchants paying for the plan, and what they paid this month (store prices, before Apple's cut).
function subsCard(p) {
  const x = p.subscriptions;
  if (!x) return p.subscriptionsError ? `<section class="card subs"><div class="ch plain"><span class="title">PayIt Plus</span></div><div class="empty pad warn">${esc(p.subscriptionsError)}</div></section>` : '';
  const extra = [x.inTrial ? `${x.inTrial} in trial` : '', x.billingIssues ? `${x.billingIssues} billing issue${x.billingIssues > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
  return `<section class="card subs">
    <div class="ch plain"><span class="title">PayIt Plus</span><span class="meta">${extra}</span></div>
    <div class="subs-row">
      <div><b>${x.paying}</b><span>paying subscribers</span></div>
      <div><b class="mint">${money(x.monthCents)}</b><span>from ${x.paidThisMonth} payment${x.paidThisMonth === 1 ? '' : 's'} this month</span></div>
    </div>
    <p class="subs-note">Store prices, before Apple's cut.</p>
  </section>`;
}

function digestCard() {
  const d = D.digest;
  let body;
  if (D.digestRunning) body = '<div class="ai-wait"><span>Claude is reading the last 24 hours of mail…</span><div class="loadbar"><i></i></div></div>';
  else if (d?.headline) {
    body = `<div class="ai-head big">${esc(d.headline)}</div>
      ${d.highlights.length ? `<div class="ai-points">${d.highlights.map((h) => `<div><i></i>${esc(h)}</div>`).join('')}</div>` : ''}
      <div class="ai-foot">${hm(d.at)} · ${d.emailCount} emails${d.taskCount ? ` · ${d.taskCount} task${d.taskCount > 1 ? 's' : ''} suggested` : ''}${d.errors?.length ? ` · ${esc(d.errors.join('; '))}` : ''}</div>`;
  } else if (!D.aiEnabled) body = '<div class="empty">Add ANTHROPIC_API_KEY to the Pi\'s .env to get a daily summary from Claude.</div>';
  else if (d?.error) body = `<div class="empty warn">${esc(d.error)}</div>`;
  else body = `<div class="empty">Today's digest arrives at ${esc(clock12(D.settings.digestAt))}.</div>`;
  const canRun = D.aiEnabled && !D.digestRunning;
  return `<section class="card ai ai-card">
    <div class="ch">${icon('mail')}<span class="title">Today's digest</span>${canRun ? `<button class="mini-btn text" data-act="digest-run">${icon('reset')}${d?.headline ? 'Redo' : d?.error ? 'Try again' : 'Make it now'}</button>` : ''}</div>
    ${body}</section>`;
}

// Journal → Past days: every recorded day, newest first, searchable. Loaded on demand.
async function loadJournalDays() {
  const q = ui.jQuery || '';
  try { ui.jDays = { q, ...(await api('GET', `/api/journal/days?q=${encodeURIComponent(q)}`)) }; }
  catch (err) { ui.jDays = { q, days: [], error: err.message }; }
  if (view === 'journal' && ui.jTab === 'past') render();
}

/** Text with the search term marked. */
function marked(text, q) {
  if (!q) return esc(text);
  const lower = text.toLowerCase(), needle = q.toLowerCase();
  let out = '', i = 0;
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, i)) {
    out += `${esc(text.slice(i, at))}<mark>${esc(text.slice(at, at + needle.length))}</mark>`;
    i = at + needle.length;
  }
  return out + esc(text.slice(i));
}

function journalPast() {
  const q = ui.jQuery || '';
  const data = ui.jDays;
  if (!data || data.q !== q) loadJournalDays();
  const days = data?.q === q ? data.days : null;
  const KIND = { reflection: ['Reflection', 'violet'], note: ['Voice note', 'pink'], daynote: ['Day note', 'blue'] };
  const chips = D.settings.tags;
  const matches = days ? days.reduce((n, d) => n + d.matches, 0) : 0;
  return `<div class="jp">
    <div class="jp-search">
      ${KIOSK ? `<button class="jp-field" data-act="j-search">${icon('search')}<span class="${q ? '' : 'ph-text'}">${esc(q || 'Search every day you\'ve recorded')}</span></button>`
              : `<label class="jp-field">${icon('search')}<input type="search" value="${esc(q)}" placeholder="Search every day you've recorded" data-jsearch></label>`}
      ${q ? `<button class="sq-btn big" data-act="j-clear" aria-label="Clear search">${icon('x')}</button>` : ''}
    </div>
    <div class="chips wrap">${chips.map((c) => `<button class="chip small ${q.toLowerCase() === c.toLowerCase() ? 'on' : ''}" data-act="j-chip" data-q="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <div class="jp-line">${!days ? 'Loading…' : data.error ? esc(data.error) : q ? `${matches} match${matches === 1 ? '' : 'es'} across ${days.length} day${days.length === 1 ? '' : 's'}` : `${days.length} day${days.length === 1 ? '' : 's'} recorded · newest first`}</div>
    <div class="scroll">
      ${(days || []).map((d) => { const open = q ? true : ui.jOpen === d.date; return `<section class="card jp-day ${open ? 'open' : ''}">
        <button class="jp-head" data-act="j-day" data-date="${esc(d.date)}">
          <div class="jp-top"><b>${esc(d.label)}</b><span>${esc([`${d.entries.length} entr${d.entries.length === 1 ? 'y' : 'ies'}`, d.focusMinutes ? `${d.focusMinutes} min` : '', d.tasksDone ? `${d.tasksDone} done` : ''].filter(Boolean).join(' · '))}</span>${icon('chev')}</div>
          ${d.summary ? `<p>${marked(d.summary, q)}</p>` : ''}
        </button>
        ${open ? `<div class="jp-entries">${d.entries.map((e) => `<div class="jp-entry">
            <div><span>${hm(e.at)}</span><em class="${(KIND[e.kind] || KIND.note)[1]}">${(KIND[e.kind] || KIND.note)[0]}</em></div>
            <div><p>${marked(e.text, q)}</p>${e.action ? `<div class="jp-act">${icon('arrow')}${marked(e.action, q)}</div>` : ''}</div>
          </div>`).join('') || '<div class="empty pad">No notes that day.</div>'}</div>` : ''}
      </section>`; }).join('')}
      ${days && !days.length ? `<div class="empty center pad">${q ? `Nothing matches “${esc(q)}”.` : 'Nothing recorded yet.'}</div>` : ''}
    </div>
  </div>`;
}

const VIEWS = {
  home() {
    const w = D.weather?.data;
    const [wxLabel, wxIcon] = w ? wx(w.code) : ['', 'sun'];
    const now = Date.now();
    const allEvents = D.calendar?.data?.events || [];
    const events = allEvents.filter((e) => (e.allDay ? e.start >= dayStart() : e.end >= now || e.start >= now)).slice(0, 3);
    const eventsToday = allEvents.filter((e) => e.start >= dayStart() && e.start < dayStart(1)).length;
    const todos = realTodos().filter((t) => !t.done).sort(todoSort).slice(0, 4);
    const toReview = suggestedTodos().length;
    const p = D.payit?.data;
    const delta = p && p.yesterdaySameTimeCents ? Math.round(((p.today.grossCents - p.yesterdaySameTimeCents) / p.yesterdaySameTimeCents) * 100) : null;
    const sysBad = (p?.systems || []).filter((s) => s.status !== 'up');
    const accounts = D.mail?.data?.accounts || [];
    const digest = D.digest?.headline ? D.digest : null;
    const hasTimer = T.running || T.remaining != null;
    const dollars = (c) => `$${Math.round(c / 100).toLocaleString('en-US')}`;
    const today = new Date();
    // While Claude chats are working, waiting or unread, they share Up next's row (so nothing else on Home shrinks).
    const chats = claudeLive();
    const waiting = chats.filter((c) => c.state === 'needs').length, fresh = chats.filter((c) => chatKind(c) === 'new').length;

    return `<div class="page vh ${chats.length ? 'has-claude' : ''}">
      <section class="hero tap" data-act="weather">
        <i class="hero-ring"></i><i class="hero-ring two"></i>
        <div class="hero-top">
          <div class="hero-clock">
            <div class="dotclock" data-dotclock="day" role="img" aria-label="${today.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}"></div>
            <div class="hero-date"><span class="ampm">${today.getHours() < 12 ? 'AM' : 'PM'}</span><span>${today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span></div>
          </div>
          ${w ? `<div class="hero-wx">
            <div class="hero-temp">${icon(wxIcon)}<b>${w.temp}°</b></div>
            <div class="hero-cond">${esc(wxLabel)}</div>
            <div class="hero-hl">H ${w.hi}° · L ${w.lo}° · ${w.rainChance ?? 0}% rain</div>
          </div>` : ''}
        </div>
        ${w?.hours?.length ? `<div class="hero-hours">${w.hours.slice(1, 7).map((h) => { const hr = new Date(h.time).getHours(); return `<div><span>${hr % 12 || 12}${hr < 12 ? 'a' : 'p'}</span><b>${h.temp}°</b></div>`; }).join('')}</div>` : ''}
      </section>

      <section class="card h-focus tap" data-act="go" data-view="focus">
        <div class="ch">${icon('focus')}<span class="title">Focus</span><span class="meta">${D.focus.todayMinutes} min today</span></div>
        <div class="hf">
          <div class="hf-ring">${ring(90, 9, hasTimer ? 1 - tLeft() / tTotal() : phaseMinutes(T.phase) / dialMax(T.phase), T.phase === 'focus' ? 'url(#g-focus)' : 'url(#g-cal)', !hasTimer)}</div>
          <div><div class="hf-time" data-timer>${fmtLeft(tLeft())}</div>
            <div class="hf-ends">${T.running ? `Ends ${hm(T.endsAt)}` : hasTimer ? 'Paused' : `Ends ${hm(now + tLeft())}`}</div></div>
        </div>
        ${T.running
          ? `<button class="btn secondary wide" data-act="t-pause">${icon('pause')} Pause</button>`
          : `<button class="btn focus wide" data-act="t-start">${icon('play')} ${hasTimer ? 'Resume' : T.phase === 'focus' ? 'Start focus' : `Start ${PHASES[T.phase].toLowerCase()}`}</button>`}
      </section>

      <section class="card h-payit tap" data-act="go" data-view="payit">
        <div class="ch">${icon('payit')}<span class="title">PayIt today</span>
          ${p ? `<span class="meta dotted ${sysBad.length ? (sysBad.some((s) => s.status === 'down') ? 'bad' : 'warn') : 'good'}"><i></i>${sysBad.length ? `${sysBad.length} issue${sysBad.length > 1 ? 's' : ''}` : 'all up'}</span>` : ''}</div>
        ${p ? `<div class="hp-top"><span class="hp-num">${money(p.today.grossCents)}</span>${delta !== null ? `<span class="delta-pill ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}%</span>` : ''}</div>
          <div class="hp-vs">${p.yesterdaySameTimeCents ? `vs. ${money(p.yesterdaySameTimeCents)} yesterday by now` : 'No sales yesterday by now'}</div>
          <div class="hp-stats">
            <div><b>${p.today.count}</b><span>sales</span></div>
            <div><b>${dollars(p.today.avgTicketCents)}</b><span>avg</span></div>
            <div class="${p.today.declined ? 'warn' : ''}"><b>${p.today.declined}</b><span>declined</span></div>
            <div class="good"><b>${p.profit ? dollars(p.profit.todayCents) : '–'}</b><span>profit</span></div>
          </div>`
          : D.payit?.configured === false ? notConfigured('PayIt', 'Add SUPABASE_URL + key to .env') : `<div class="empty">${esc(D.payit?.error || 'Loading…')}</div>`}
      </section>

      <section class="card h-next tap" data-act="go" data-view="schedule">
        <div class="ch">${icon('schedule')}<span class="title">Up next</span><span class="meta">${eventsToday ? `${eventsToday} today` : ''}</span></div>
        ${events.length ? events.map(eventLine).join('') : D.calendar?.configured === false ? notConfigured('Calendar', 'Add CALENDAR_FEEDS (Canvas / Google ICS links) to .env') : '<div class="empty">Nothing in the next few days.</div>'}
      </section>

      ${chats.length ? `<section class="card h-claude tap ${waiting ? 'needs' : fresh ? 'fresh' : ''}" data-act="go" data-view="claude">
        <div class="ch">${icon('claude')}<span class="title">Claude</span><span class="meta ${waiting ? 'warn' : fresh ? 'good' : ''}">${waiting ? `${waiting} need${waiting === 1 ? 's' : ''} you` : fresh ? `${fresh} new` : `${chats.length} working`}</span></div>
        ${chats.slice(0, 3).map((c) => chatLine(c)).join('')}
        ${chats.length > 3 ? `<div class="cc-more">+${chats.length - 3} more</div>` : ''}
      </section>` : ''}

      <section class="card h-tasks tap" data-act="go" data-view="tasks">
        <div class="ch">${icon('tasks')}<span class="title">To do</span>${toReview ? `<span class="meta violet">${toReview} to review</span>` : '<span class="meta"></span>'}<button class="mini-btn" data-act="todo-add" aria-label="Add task">${icon('plus')}</button></div>
        ${todos.length ? todos.map(taskLine).join('') : '<div class="empty center">Nothing left open. Nice.</div>'}
      </section>

      <section class="card ai h-mail tap" data-act="go" data-view="mail">
        <div class="ch">${icon('mail')}<span class="title">Mail digest</span><span class="meta">${digest ? hm(digest.at) : ''}</span></div>
        ${accounts.length ? `${digest
            ? `<div class="hm-head">${esc(digest.headline)}</div><div class="hm-points">${digest.highlights.slice(0, 3).map((h) => `<div><i></i>${esc(h)}</div>`).join('')}</div>`
            : `<div class="empty grow">${D.digestRunning ? 'Claude is reading the last 24 hours of mail…' : D.aiEnabled ? `Today's digest arrives at ${esc(clock12(D.settings.digestAt))}.` : 'Add ANTHROPIC_API_KEY for a daily digest.'}</div>`}
          <div class="hm-foot">${accounts.map((a) => `<span>${esc(a.name)}<b>${a.unread}</b></span>`).join('')}</div>`
          : D.mail?.configured === false ? notConfigured('Mail', 'Add MAIL_1_USER / MAIL_1_PASS to .env') : `<div class="empty">${esc(D.mail?.error || 'Loading…')}</div>`}
      </section>
    </div>`;
  },

  // The Claude board: what's going on in your chats right now, big enough to read from your chair.
  claude() {
    const c = D.claude || { chats: [], online: false, syncedAt: null };
    const live = claudeLive(c.online ? c.chats : []);
    const earlier = (c.chats || []).filter((x) => chatKind(x) === 'read').sort((a, b) => b.since - a.since);
    const n = (k) => live.filter((x) => chatKind(x) === k).length;
    const sum = [n('needs') && `${n('needs')} need${n('needs') === 1 ? 's' : ''} you`, n('new') && `${n('new')} new`, n('running') && `${n('running')} working`].filter(Boolean).join(' · ');
    const [liveCls, liveText] = !c.syncedAt ? ['off', 'Waiting for your Mac'] : !c.online ? ['away', `Mac away since ${hm(c.syncedAt)}`]
      : c.listening ? ['on', 'Live from your Mac'] : ['on', "Live · taps can't reach your Mac"];
    const quiet = `<section class="card cb-quiet">${icon('claude')}<b>${c.syncedAt ? 'All quiet' : 'Nothing from your Mac yet'}</b>
      <p>${c.syncedAt ? 'Nothing is running. Chats you start on your Mac show up here, and anything that finishes or needs you takes over the screen.' : 'Claude Status, the menu bar app on your Mac, sends your chats here whenever it can reach the hub.'}</p></section>`;
    return `<div class="page vcb">
      <div class="ph"><h1>Claude</h1><span class="cb-live ${liveCls}"><i></i>${esc(liveText)}</span>
        ${n('new') ? '<button class="btn secondary small" data-act="claude-readall">Mark all read</button>' : ''}</div>
      ${sum ? `<div class="cb-sum">${esc(sum)}</div>` : ''}
      <div class="scroll">
        ${live.length ? `<div class="cb-grid">${live.map(chatTile).join('')}</div>` : quiet}
        ${earlier.length && c.online ? `<section class="card cb-earlier"><div class="ch plain"><span class="title">Earlier</span><span class="meta">${earlier.length}</span></div>
          ${earlier.slice(0, 12).map((x) => chatLine(x, true)).join('')}</section>` : ''}
      </div>
    </div>`;
  },

  focus() {
    const active = T.running || T.remaining != null;
    const isFocus = T.phase === 'focus';
    const mins = phaseMinutes(T.phase), max = dialMax(T.phase);
    const task = T.label ? D.todos.find((t) => !t.done && t.text === T.label) : null;
    const subs = task?.subtasks || [];
    const meta = task ? (subs.length ? `${subs.filter((x) => x.done).length} of ${subs.length} steps` : dueLabel(task)?.[0] || task.tag || '') : '';
    const sessions = D.focus.today || [];
    const from = dayStart() + 7 * 3600e3, span = 16 * 3600e3;
    const pos = (ms) => Math.min(100, Math.max(0, ((ms - from) / span) * 100));
    const kicker = isFocus ? `Session ${T.cycle + 1} of 4` : PHASES[T.phase];
    const grad = isFocus ? 'url(#g-focus)' : 'url(#g-cal)';

    return `<div class="vf ${isFocus ? '' : 'break'}">
      <div class="vf-head">
        <div class="seg">${Object.entries(PHASES).map(([k, v]) => `<button class="${T.phase === k ? 'on' : ''}" data-act="t-phase" data-phase="${k}">${v}</button>`).join('')}</div>
        <div class="cycle" aria-label="Session ${T.cycle + 1} of 4">${[0, 1, 2, 3].map((i) => `<i class="${i < T.cycle ? 'done' : i === T.cycle ? 'now' : ''}"></i>`).join('')}</div>
      </div>

      <section class="vf-stage">
        <div class="vf-dialrow">
          <button class="round-btn" data-act="t-nudge" data-d="-1" aria-label="Less time" ${active ? 'disabled' : ''}>−</button>
          <div class="vf-dial" data-dial>
            ${ring(400, 16, active ? 1 - tLeft() / tTotal() : mins / max, grad, !active, true)}
            <div class="vf-center">
              <span class="kicker">${esc(kicker)}</span>
              <span class="vf-time" ${active ? 'data-timer' : ''}>${fmtLeft(active ? tLeft() : mins * 60e3)}</span>
              <span class="vf-ends ${active && !T.running ? 'paused' : ''}">${T.running ? `Ends ${hm(T.endsAt)}` : active ? 'Paused' : `Ends ${hm(Date.now() + mins * 60e3)}`}</span>
            </div>
          </div>
          <button class="round-btn" data-act="t-nudge" data-d="1" aria-label="More time" ${active ? 'disabled' : ''}>+</button>
        </div>
        ${active
          ? `<div class="pills">
              ${T.running ? `<button class="pill-btn" data-act="t-pause">Pause</button>` : `<button class="pill-btn solid" data-act="t-start">Resume</button>`}
              <button class="pill-btn" data-act="t-adj" data-min="5">+5 min</button>
              <button class="pill-btn" data-act="t-reset">Reset</button>
            </div>`
          : `<div class="presets">${dialPresets(T.phase).map((m) => `<button class="${m === mins ? 'on' : ''}" data-act="t-set" data-min="${m}">${m}</button>`).join('')}</div>
            <button class="btn focus begin" data-act="t-start">${icon('play')} ${isFocus ? 'Begin' : 'Start break'}</button>`}
      </section>

      <button class="card vf-work tap" data-act="pick-task">
        <div class="grow"><div class="kicker">Working on</div><b>${esc(T.label || 'Nothing in particular')}</b>${meta ? `<span>${esc(meta)}</span>` : ''}</div>
        ${icon('chev')}
      </button>

      <section class="card vf-stats">
        <div class="vf-line"><span><b>${D.focus.todayMinutes}</b>min today</span><span><b>${D.focus.todaySessions}</b>session${D.focus.todaySessions === 1 ? '' : 's'}</span><span><b>${D.focus.week.reduce((a, d) => a + d.minutes, 0)}</b>min this week</span></div>
        <div class="vf-strip">${sessions.map((f) => `<i style="left:${pos(f.at - f.minutes * 60e3).toFixed(2)}%;width:${Math.max(1.2, (f.minutes * 60e3 / span) * 100).toFixed(2)}%"></i>`).join('')}<b style="left:${pos(Date.now()).toFixed(2)}%"></b></div>
        <div class="vf-axis"><span>7 AM</span><span>11 AM</span><span>3 PM</span><span>7 PM</span><span>11 PM</span></div>
      </section>
    </div>`;
  },

  tasks() {
    const f = ui.taskFilter;
    const tags = D.settings.tags;
    let list = realTodos().sort(todoSort);
    const review = suggestedTodos().sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity));
    if (f === 'open') list = list.filter((t) => !t.done);
    else if (f === 'today') list = list.filter((t) => !t.done && t.due && t.due < dayStart(1));
    else if (f === 'done') list = list.filter((t) => t.done);
    else list = list.filter((t) => !t.done && t.tag === f);
    const filters = [['open', 'All open'], ['today', 'Due today'], ...tags.map((t) => [t, t]), ['done', 'Done']];
    const empty = f === 'open' ? 'All clear. Nice.' : f === 'today' ? 'Nothing due today.' : f === 'done' ? 'Nothing finished yet.' : `No open ${f} tasks.`;
    return `<div class="page vt">
      <div class="ph"><h1>To do</h1>
        ${f === 'done' && list.length ? `<button class="btn secondary" data-act="todo-clear">Clear done</button>` : ''}
        <button class="btn primary" data-act="todo-add">${icon('plus')} Add</button></div>
      ${review.length ? `<section class="card ai sugg">
        <div class="ch">${icon('mail')}<span class="title">Suggested from email</span><span class="meta">Keep the ones that are real</span></div>
        ${review.map((t) => { const due = dueLabel(t); return `<div class="sugg-row">
          <div class="grow"><b>${esc(t.text)}</b><span>${esc(t.source?.why || [t.source?.from, t.source?.subject].filter(Boolean).join(' · '))}${t.subtasks?.length ? ` · ${t.subtasks.length} steps` : ''}</span></div>
          ${due ? `<em>${due[0]}</em>` : ''}
          <button class="btn primary small" data-act="sugg-keep" data-id="${t.id}">Keep</button>
          <button class="sq-btn" data-act="sugg-dismiss" data-id="${t.id}" aria-label="Dismiss">${icon('x')}</button>
        </div>`; }).join('')}
      </section>` : ''}
      <div class="chips">${filters.map(([k, v]) => `<button class="chip ${f === k ? 'on' : ''}" data-act="task-filter" data-f="${esc(k)}">${esc(v)}</button>`).join('')}</div>
      <section class="card list-card">${list.length ? list.map(taskRow).join('') : `<div class="empty center pad">${esc(empty)}</div>`}</section>
    </div>`;
  },

  payit() {
    const s = D.payit;
    if (!s?.data) return `<div class="page"><div class="ph"><h1>PayIt</h1></div><section class="card">${s?.configured === false ? notConfigured('PayIt', 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env on the Pi.') : `<div class="empty">${esc(s?.error || 'Loading…')}</div>`}</section></div>`;
    const p = s.data, t = p.today;
    const delta = p.yesterdaySameTimeCents ? Math.round(((t.grossCents - p.yesterdaySameTimeCents) / p.yesterdaySameTimeCents) * 100) : null;
    const nowH = new Date().getHours();
    const hours = p.hourly.slice(0, nowH + 1);
    const hourLabel = (h) => `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;
    const weekTotal = p.week.reduce((a, d) => a + d.cents, 0);
    const providers = Object.entries(t.byProvider).sort((a, b) => b[1] - a[1]);
    const provMax = Math.max(1, ...providers.map(([, v]) => v));
    const provName = { stripe: 'Card (Stripe)', cash: 'Cash', ath_movil: 'ATH Móvil' };
    const bad = p.systems.filter((x) => x.status !== 'up'), down = bad.filter((x) => x.status === 'down').length;
    const weekDay = (i) => (i === p.week.length - 1 ? 'Today' : new Date(p.week[i].date).toLocaleDateString('en-US', { weekday: 'long' }));
    // Four evenly spread labels under the hourly bars.
    const hourTicks = [...new Set([0, Math.round((hours.length - 1) / 3), Math.round(((hours.length - 1) * 2) / 3), hours.length - 1])];
    return `<div class="page vp">
      <div class="ph"><h1>PayIt</h1><span class="ph-meta">Updated ${s.updatedAt ? hm(s.updatedAt) : '—'}</span></div>
      <div class="scroll">
        <section class="pay-hero">
          <div class="kicker">Gross volume today</div>
          <div class="pay-top"><span class="pay-num">${money(t.grossCents)}</span>${delta !== null ? `<span class="delta-pill big ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}%</span>` : ''}</div>
          <div class="pay-line">${p.yesterdaySameTimeCents ? `vs. ${money(p.yesterdaySameTimeCents)} yesterday by now` : 'No sales yesterday by now'}${
            p.profit ? ` · platform kept <b>${money(p.profit.todayCents, true)}</b> today, <b>${money(p.profit.weekCents, true)}</b> this week`
            : p.profitError ? ` · <span class="warn">platform profit unavailable: ${esc(p.profitError)}</span>` : ''}</div>
          <div class="pay-tiles">
            <div><b>${t.count}</b><span>sales</span></div>
            <div><b>${money(t.avgTicketCents, true)}</b><span>avg ticket</span></div>
            <div><b>${t.activeMerchants}</b><span>merchants</span></div>
            <div class="${t.declined ? 'warn' : ''}"><b>${t.declined}</b><span>declined · ${t.refunded} ref.</span></div>
          </div>
        </section>
        ${subsCard(p)}
        <section class="card rows-card">
          <div class="ch plain"><span class="title">Latest transactions</span><span class="meta">${t.newBusinesses ? `${t.newBusinesses} new business${t.newBusinesses > 1 ? 'es' : ''} today` : ''}</span></div>
          ${(p.recent || []).length ? p.recent.slice(0, 8).map((x) => `<div class="txn ${esc(x.status)}"><div class="grow"><b>${esc(provName[x.provider] || x.provider)}</b><span>${ago(x.at) === 'now' ? 'just now' : `${ago(x.at)} ago`} · ${hm(Date.parse(x.at))}</span></div>${x.status === 'completed' ? '' : `<em>${esc(x.status)}</em>`}<strong>${money(x.cents, true)}</strong></div>`).join('')
            : '<div class="empty pad">No payments this week yet.</div>'}
        </section>
        <div class="two">
          <section class="card chart-card">
            <div class="ch plain"><span class="title">By hour</span></div>
            ${barChart('hourly', hours, (h) => `${hourLabel(h)}–${hourLabel((h + 1) % 24)}`, 5)}
            <div class="bar-axis">${hourTicks.map((h) => `<span>${hourLabel(h)}</span>`).join('')}</div>
          </section>
          <section class="card chart-card">
            <div class="ch plain"><span class="title">Last 7 days</span><span class="meta">${money(weekTotal)}</span></div>
            ${barChart('week', p.week.map((d) => d.cents), weekDay, 7)}
            <div class="bar-axis even">${p.week.map((d) => `<span>${new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' })}</span>`).join('')}</div>
          </section>
        </div>
        <section class="card methods">
          <div class="ch plain"><span class="title">By payment method</span></div>
          ${providers.length ? providers.map(([k, v]) => `<div class="method"><span>${esc(provName[k] || k)}</span><i><u style="width:${((v / provMax) * 100).toFixed(1)}%"></u></i><b>${money(v)}</b></div>`).join('') : '<div class="empty">No sales yet today.</div>'}
          ${p.excludedProviders?.length ? `<div class="method-note">${esc(p.excludedProviders.map((k) => provName[k] || k).join(' and '))} sales aren't counted in these numbers.</div>` : ''}
        </section>
        <section class="card rows-card fold ${ui.sysOpen ? 'open' : ''}">
          <button class="ch plain fold-h" data-act="sys-fold"><span class="title">Systems</span><span class="meta dotted ${down ? 'bad' : bad.length ? 'warn' : 'good'}"><i></i>${down ? `${down} down` : bad.length ? `${bad.length} degraded` : 'all up'}</span>${icon('chev')}</button>
          ${ui.sysOpen ? (p.systems.length ? p.systems.map((x) => `<div class="sys"><div class="grow"><b>${esc(x.system.replace(/_/g, ' '))}</b><span>${x.detail ? esc(x.detail) : ago(x.checked_at) === 'now' ? 'checked just now' : `checked ${ago(x.checked_at)} ago`}</span></div>
            <em class="${esc(x.status)}"><i></i>${esc(x.status)}</em></div>`).join('')
            : '<div class="empty pad">No checks in the last 3 hours. Is the hourly-system-check cron running?</div>') : ''}
        </section>
      </div>
    </div>`;
  },

  mail() {
    const s = D.mail;
    if (!s?.data) return `<div class="page"><div class="ph"><h1>Mail</h1></div><section class="card">${s?.configured === false ? notConfigured('Mail', 'Add one MAIL_n_* block per account to .env (see README).') : `<div class="empty">${esc(s?.error || 'Loading…')}</div>`}</section></div>`;
    return `<div class="page vm">
      <div class="ph"><h1>Mail</h1><span class="ph-meta">${s.data.aiEnabled ? 'Summaries by Claude · ' : 'Updated '}${s.updatedAt ? hm(s.updatedAt) : '—'}</span></div>
      ${digestCard()}
      <div class="scroll">${s.data.accounts.map((a) => `<section class="card rows-card">
        <div class="ch plain"><span class="title">${esc(a.name)}</span>${a.needsSignIn ? '' : `<span class="tagc">${a.unread} unread</span>${a.syncedAt ? `<span class="tagc quiet">synced ${ago(new Date(a.syncedAt).toISOString())}</span>` : ''}`}</div>
        ${a.needsSignIn ? `<div class="mail-off"><span>${esc(a.name)} mail isn't connected yet.</span><button class="btn primary small" data-act="go" data-view="settings">Connect</button></div>`
          : a.error ? `<div class="empty pad warn">${esc(a.error)}</div>` : ''}
        ${a.messages.filter((m) => !m.hidden).map((m) => `<button class="mail-row ${m.priority === 'low' ? 'low' : ''}" data-act="mail-open" data-id="${esc(m.id)}">
          <div class="mail-top"><b>${esc(m.from)}</b>${m.priority === 'urgent' ? '<em>Urgent</em>' : ''}${m.kind === 'customer' ? '<em class="cust">Customer</em>' : ''}<span>${ago(m.date)}</span></div>
          <p>${esc(m.summary)}</p>
          ${m.action ? `<div class="mail-act">${icon('arrow')}${esc(m.action)}</div>` : ''}
        </button>`).join('') || (a.needsSignIn || a.error ? '' : '<div class="empty pad">No unread mail from the last few days.</div>')}
        ${a.hiddenAutomated ? `<div class="mail-more">+${a.hiddenAutomated} newsletters and notifications not shown</div>` : ''}
      </section>`).join('')}</div>
    </div>`;
  },

  journal() {
    const past = ui.jTab === 'past';
    const head = `<div class="ph"><h1>Journal</h1><button class="btn primary" data-act="note-add">${icon('plus')} Note</button></div>
      <div class="seg full"><button class="${past ? '' : 'on'}" data-act="j-tab" data-tab="today">Today</button><button class="${past ? 'on' : ''}" data-act="j-tab" data-tab="past">Past days</button></div>`;
    if (past) return `<div class="page vj">${head}${journalPast()}</div>`;

    const r = D.recap;
    const today = D.journal.filter((j) => j.at >= dayStart());
    const dayNotes = today.filter((j) => j.kind === 'daynote').reverse();
    const voice = today.filter((j) => j.kind !== 'daynote');
    let recap;
    if (D.recapRunning) recap = '<div class="ai-wait journal"><span>Claude is writing up your day…</span><div class="loadbar"><i></i></div></div>';
    else if (r?.headline) {
      recap = `<div class="ai-head">${esc(r.headline)}</div>
        ${r.bullets.length ? `<div class="ai-points journal">${r.bullets.map((b) => `<div><i></i>${esc(b)}</div>`).join('')}</div>` : ''}
        ${r.tomorrow?.length ? `<div class="ai-box"><div class="kicker">Tomorrow</div>${r.tomorrow.map((b) => `<div>${esc(b)}</div>`).join('')}</div>` : ''}`;
    } else if (!D.aiEnabled) recap = '<div class="empty">Add ANTHROPIC_API_KEY to the Pi\'s .env to get a recap of your day.</div>';
    else if (r?.error) recap = `<div class="empty warn">${esc(r.error)}</div>`;
    else recap = `<div class="empty">Your recap arrives at ${esc(clock12(D.settings.recapAt))}, from your notes, tasks and focus time.</div>`;
    const canRun = D.aiEnabled && !D.recapRunning;

    return `<div class="page vj">${head}
      <div class="scroll">
        <section class="card ai journal ai-card">
          <div class="ch">${icon('journal')}<span class="title">Today's recap</span>${r?.headline ? `<span class="meta">${hm(r.at)}</span>` : ''}
            ${canRun ? `<button class="mini-btn text" data-act="recap-run">${icon('reset')}${r?.headline ? 'Redo' : r?.error ? 'Try again' : 'Make it now'}</button>` : ''}</div>
          ${recap}
        </section>
        ${bodyCard()}
        <section class="card rows-card">
          <div class="ch plain"><span class="title">Notes for today</span><button class="mini-btn text" data-act="daynote-add">${icon('plus')}Add</button></div>
          ${dayNotes.length ? dayNotes.map((n) => `<div class="daynote"><span>${hm(n.at)}</span><p>${esc(n.text)}</p></div>`).join('')
            : '<div class="empty pad">Jot anything you want to find later. It stays with today under Past days.</div>'}
        </section>
        <section class="card rows-card">
          <div class="ch plain"><span class="title">Voice notes</span><span class="meta dotted ${D.voiceReady ? 'good' : 'off'}"><i></i>${D.voiceReady ? 'Ring connected' : 'Ring not set up'}</span></div>
          ${voice.length ? voice.map((j) => `<div class="vnote">
              <div class="vnote-top"><b>${esc(j.note || j.text)}</b><span>${j.kind === 'reflection' ? 'Reflection' : j.trigger === 'typed' ? 'Typed' : j.trigger === 'phone' ? 'Phone' : 'Note'} · ${hm(j.at)}</span></div>
              ${j.note && j.note !== j.text ? `<div class="vnote-said">“${esc(j.text)}”</div>` : ''}
              ${j.pending ? '<div class="vnote-wait">Working out what you meant…</div>'
                : `${(j.completed || []).map((t) => `<div class="vnote-done">${icon('check')}Done: ${esc(t)}</div>`).join('')}${(j.tasks || []).map((t) => `<div class="vnote-task">${icon('plus')}${esc(t)}</div>`).join('')}`}
            </div>`).join('')
            : '<div class="empty pad">Nothing yet today. Speak into the ring, or tap Note to type one. Say what you need to do and it lands in To do.</div>'}
        </section>
      </div>
    </div>`;
  },

  schedule() {
    const cal = D.calendar;
    if (cal?.configured === false) return `<div class="page"><div class="ph"><h1>Schedule</h1></div><section class="card">${notConfigured('Calendar', 'Add CALENDAR_FEEDS to .env (your Google Calendar secret iCal address).')}</section></div>`;
    const all = cal?.data?.events || [];
    const sel = Math.min(6, Math.max(0, ui.schedDay));
    const from = dayStart(sel), to = dayStart(sel + 1);
    const onDay = (o) => all.filter((e) => e.start < dayStart(o + 1) && e.end >= dayStart(o) && (e.allDay ? e.start >= dayStart(o) : true));
    const events = onDay(sel);
    const timed = events.filter((e) => !e.allDay).sort((x, y) => x.start - y.start);
    const allDay = events.filter((e) => e.allDay);
    const tasks = realTodos().filter((t) => !t.done && t.due && (sel === 0 ? t.due < to : t.due >= from && t.due < to)).sort(todoSort);
    const date = new Date(from);

    // One-line summary of the day.
    const bits = [];
    // An event carried over from the night before doesn't count as the day's first.
    const firstToday = timed.find((e) => e.start >= from);
    if (timed.length) bits.push(`${timed.length} event${timed.length > 1 ? 's' : ''}${firstToday ? `, first at ${hm(firstToday.start)}` : ''}`);
    else bits.push('No timed events');
    if (tasks.length) bits.push(`${tasks.length} task${tasks.length > 1 ? 's' : ''} due`);
    const w = sel === 0 ? D.weather?.data : null;
    if (w) bits.push(`${w.temp}° now, high ${w.hi}°`);

    // Timeline: hours down the side, events placed by time, overlaps side by side.
    const hourOf = (ms) => (ms - from) / 3600e3;
    const startH = Math.max(0, Math.min(8, Math.floor(Math.min(...timed.map((e) => hourOf(e.start)), 8))));
    const endH = 24;
    const span = endH - startH;
    const pct = (h) => ((Math.min(endH, Math.max(startH, h)) - startH) / span) * 100;
    const cols = [];
    const placed = timed.map((e) => {
      let c = cols.findIndex((end) => end <= e.start);
      if (c === -1) { c = cols.length; cols.push(0); }
      cols[c] = Math.max(e.end, e.start + 45 * 60e3);
      return { e, c };
    });
    const hours = []; for (let h = startH; h <= endH; h += 2) hours.push(h);
    const hourLabel = (h) => `${h % 12 || 12} ${h < 12 || h === 24 ? 'AM' : 'PM'}`;
    const short = (ms) => hm(ms).replace(/ (AM|PM)$/, '');
    const nowH = hourOf(Date.now());
    const timeline = `<div class="tl">
      ${hours.map((h) => `<div class="tl-hour" style="top:${pct(h).toFixed(2)}%"><span>${hourLabel(h)}</span></div>`).join('')}
      <div class="tl-events">${placed.map(({ e, c }) => {
        const top = pct(hourOf(e.start)), h = Math.max(pct(hourOf(e.end)) - top, 0);
        const where = (e.location || e.calendar || '').split(',')[0];
        return `<button class="tl-ev ${e.end < Date.now() ? 'past' : ''}" data-act="event" data-id="${esc(e.id || '')}" style="top:min(${top.toFixed(2)}%, calc(100% - 48px));height:${h.toFixed(2)}%;left:${((c / cols.length) * 100).toFixed(2)}%;width:calc(${(100 / cols.length).toFixed(2)}% - 4px)">
          <b>${esc(e.title)}</b><span>${e.end > e.start ? `${short(e.start)}–${hm(e.end)}` : hm(e.start)}${where ? ` · ${esc(where)}` : ''}</span></button>`;
      }).join('')}</div>
      ${sel === 0 && nowH >= startH && nowH <= endH ? `<div class="tl-now" style="top:${pct(nowH).toFixed(2)}%"><i></i></div>` : ''}
      ${timed.length ? '' : '<div class="tl-empty">Nothing on the calendar</div>'}
    </div>`;

    const strip = Array.from({ length: 7 }, (_, o) => {
      const d = new Date(dayStart(o)), n = onDay(o).length;
      return `<button class="${o === sel ? 'on' : ''}" data-act="sched-day" data-o="${o}">
        <span>${o === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })}</span><b>${d.getDate()}</b><i>${n ? `${n} ev` : '–'}</i></button>`;
    }).join('');

    return `<div class="page vs">
      <div class="ph"><h1>Schedule</h1>${cal?.error ? `<span class="ph-meta warn">${esc(cal.error)}</span>` : ''}</div>
      <section class="card daysum">
        <div class="daysum-top"><b>${sel === 0 ? 'Today' : sel === 1 ? 'Tomorrow' : date.toLocaleDateString('en-US', { weekday: 'long' })}</b><span>${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</span></div>
        <div class="daysum-line">${esc(bits.join(' · '))}</div>
        ${allDay.length ? `<div class="chips wrap" style="margin-top:10px">${allDay.map((e) => `<button class="chip small allday" data-act="event" data-id="${esc(e.id || '')}">${esc(e.title)}</button>`).join('')}</div>` : ''}
        ${tasks.slice(0, 3).map((t) => { const due = dueLabel(t); return `<div class="due-row"><i class="${due[1]}"></i><span>${esc(t.text)}</span><em class="${due[1]}">${due[0]}</em></div>`; }).join('')}
        ${tasks.length > 3 ? `<div class="due-more">+${tasks.length - 3} more in To do</div>` : ''}
      </section>
      <section class="card tl-card">${timeline}</section>
      <div class="week">${strip}</div>
    </div>`;
  },

  settings() {
    const st = D.settings;
    const sys = D.system;
    const row = (label, hint, control) => `<div class="set-row"><div class="grow"><b>${label}</b>${hint ? `<span>${hint}</span>` : ''}</div>${control}</div>`;
    const step = (key, shown) => `<div class="stepper"><button data-act="set-step" data-k="${key}" data-d="-1" aria-label="Less">−</button><b>${esc(shown)}</b><button data-act="set-step" data-k="${key}" data-d="1" aria-label="More">+</button></div>`;
    const time = (key) => step(key, clock12(st[key]));
    const mins = (key) => step(key, `${st[key]} min`);
    const toggle = (k) => `<button class="toggle ${st[k] ? 'on' : ''}" data-act="set-toggle" data-k="${k}" aria-pressed="${Boolean(st[k])}"></button>`;
    const range = (k, min, max, stepBy = 1) => `<input type="range" min="${min}" max="${max}" step="${stepBy}" value="${st[k]}" style="--pct:${(((st[k] - min) / (max - min)) * 100).toFixed(1)}%" data-act="set-range" data-k="${k}">`;
    const btn = (act, label, cls = '') => `<button class="set-btn ${cls}" data-act="${act}">${label}</button>`;
    const group = (title, rows) => `<section class="card set-card"><div class="kicker">${title}</div>${rows.filter(Boolean).join('')}</section>`;
    const sc = D.school;
    const school = !sc?.configured ? ''
      : sc.pending ? `<div class="code-box"><div>On your phone or laptop, open <b>${esc(sc.pending.uri.replace(/^https?:\/\//, ''))}</b> and enter</div><div class="code">${esc(sc.pending.code)}</div><div>then sign in with your school account. This screen updates by itself.</div></div>`
      : sc.connected ? row('School mail', 'Connected with Microsoft (read-only)', btn('school-disconnect', 'Disconnect'))
      : row('School mail', sc.error ? `<i class="warn">${esc(sc.error)}</i>` : 'Sign in with Microsoft using a short code', btn('school-connect', 'Connect', 'solid'));
    return `<div class="page vset">
      <div class="ph"><h1>Settings</h1><button class="btn secondary" data-act="mode" data-mode="sleep">${icon('moon')} Sleep now</button></div>
      <div class="scroll">
        ${group('Display', [
          row('Text size', `Bigger text for reading from your chair · ${st.textSize || 115}%`, range('textSize', 100, 140, 5)),
          row('Brightness', D.hasBacklight ? `Desk screen backlight · ${st.dayBrightness}%` : `No backlight here; this sets the desk screen · ${st.dayBrightness}%`, range('dayBrightness', 10, 100)),
          row('Sleep brightness', `How dim the bedside clock gets · ${st.sleepBrightness}%`, range('sleepBrightness', 0, 30)),
          row('Return to Home', st.homeAfter ? 'When the desk screen has been left on another page' : 'The desk screen stays on whatever page you leave it', step('homeAfter', st.homeAfter ? `after ${st.homeAfter} min` : 'Never')),
          row('Sounds', '', toggle('chime')),
        ])}
        ${group('Claude', [
          row('Rest on Claude while you work', 'While chats are running, the desk returns to the Claude board instead of Home', toggle('claudeBoard')),
          row('Full-screen alerts', 'A chat that finishes or needs you takes over the desk screen', toggle('claudeTakeover')),
        ])}
        ${group('Evening and morning', [
          row('Wind down', 'Desk screen dims and puts mail and PayIt away', toggle('windDown')),
          row('Wind down starts', '', time('windDownAt')),
          row('Automatic sleep', 'Goes to the sleep screen on its own', toggle('autoSleep')),
          row('Sleep at', '', time('sleepAt')),
          row('Wake at', '', time('wakeAt')),
          row('Morning brief', 'Sunrise screen with your day, until you tap it', toggle('morningBrief')),
        ])}
        ${group('Mail and Claude', [
          row('Email digest at', "Claude's summary of the last 24 hours", time('digestAt')),
          row('Day recap at', 'From your notes, tasks and focus time', time('recapAt')),
          row('Tasks from email', 'Checked hourly; you approve new ones', toggle('emailTasks')),
          school,
        ])}
        ${group('Focus timer', [
          row('Focus length', '', mins('focusMinutes')),
          row('Short break', '', mins('shortBreak')),
          row('Long break', '', mins('longBreak')),
          row('Focus lock', 'A focus session takes over the screen until you hold to leave', toggle('focusLock')),
        ])}
        ${group('This hub', [
          row(esc(sys.host), `${sys.tempC != null ? `${sys.tempC.toFixed(0)}°C · ` : ''}load ${sys.load.toFixed(2)} · memory ${sys.memUsedPct}% · up ${sys.uptimeH}h`, ''),
          row('Data', 'Reload mail, PayIt, calendar and weather now', btn('refresh', 'Refresh')),
          row('This screen', 'Reload the page', btn('reload', 'Reload')),
          row('Restart the Pi', D.canRestart ? 'Reboots the whole device; back in about a minute' : 'Not allowed yet: run scripts/allow-restart.sh on the Pi once', D.canRestart ? btn('restart-pi', 'Restart', 'danger') : ''),
          KIOSK ? '' : row('Voice-note pop-ups here', 'Show what the ring heard, and what the hub did with it, on this device', `<button class="toggle ${ringOff() ? '' : 'on'}" data-act="ring-toggle" aria-pressed="${!ringOff()}"></button>`),
          D.signedIn ? row('Signed in on this device', '', btn('logout', 'Sign out')) : '',
        ])}
      </div>
    </div>`;
  },
};

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------


function windHome() {
  const all = D.calendar?.data?.events || [];
  const tomorrowEvents = all.filter((e) => e.start >= dayStart(1) && e.start < dayStart(2)).slice(0, 3);
  const open = realTodos().filter((t) => !t.done).sort(todoSort);
  const tonightTasks = open.filter((t) => t.due && t.due < dayStart(1)).slice(0, 3);
  const tomorrowTasks = open.filter((t) => t.due && t.due >= dayStart(1) && t.due < dayStart(2)).slice(0, Math.max(0, 3 - tomorrowEvents.length));
  const r = D.recap?.headline ? D.recap : null;
  const w = D.weather?.data;
  const tw = w?.tomorrow;
  // How far through wind-down we are, from its start to sleep time.
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const span = (toMin(D.settings.sleepAt) - toMin(D.settings.windDownAt) + 1440) % 1440 || 1;
  const into = (nowMin - toMin(D.settings.windDownAt) + 1440) % 1440;
  const windDone = Math.min(1, into / span), minsLeft = Math.max(0, span - into);
  // What was said tonight, newest first (D.journal already is).
  const tonight = (D.journal || []).filter((j) => j.evening && j.kind !== 'daynote' && j.at > Date.now() - 12 * 3600e3).slice(0, 4);
  const today = new Date();
  return `<div class="page vw">
    <section class="wind-hero">
      <div class="wind-top"><span>Wind down</span><span>Lights out ${esc(clock12(D.settings.sleepAt))}</span></div>
      <div class="dotclock" data-dotclock="wind" role="img" aria-label="${today.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}"></div>
      <div class="wind-date">${today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${w ? ` · ${w.temp}° and ${esc(wx(w.code)[0].toLowerCase())} tonight` : ''}</div>
      <div class="wind-prog"><div><i style="width:${(windDone * 100).toFixed(1)}%"></i></div><span>${minsLeft > 0 ? `${minsLeft >= 60 ? `${Math.floor(minsLeft / 60)} h ` : ''}${minsLeft % 60} min left` : 'Time for bed'}</span></div>
    </section>
    <section class="card wc tap" data-act="go" data-view="tasks">
      <div class="wc-h">Before you sleep</div>
      ${tonightTasks.length ? tonightTasks.map((t) => { const due = dueLabel(t), on = t.done || t.finishing; return `<div class="wc-task ${t.finishing ? 'finishing' : ''}">
          <button class="check ${on ? 'done' : ''}" data-act="todo-toggle" data-id="${t.id}" aria-label="Done">${on ? icon('check') : ''}</button><span>${esc(t.text)}</span><em>${due[0]}</em></div>`; }).join('')
        : '<div class="wc-empty">All clear. Nice.</div>'}
    </section>
    <section class="card wc">
      <div class="wc-h">Tomorrow${tw ? `<span>${tw.hi}° / ${tw.lo}°${w.tomorrowRain >= 30 ? ` · ${w.tomorrowRain}% rain` : ''}</span>` : ''}</div>
      ${tomorrowEvents.map((e) => `<div class="wc-ev tap" data-act="event" data-id="${esc(e.id || '')}"><span>${e.allDay ? 'All day' : hm(e.start)}</span><b>${esc(e.title)}</b><em>${esc((e.location || e.calendar || '').split(',')[0])}</em></div>`).join('')}
      ${tomorrowTasks.map((t) => `<div class="wc-ev"><span>Due</span><b>${esc(t.text)}</b><em>${esc(t.tag || '')}</em></div>`).join('')}
      ${tomorrowEvents.length || tomorrowTasks.length ? '' : '<div class="wc-empty">Nothing scheduled for tomorrow yet.</div>'}
    </section>
    <section class="card wc grow tap" data-act="go" data-view="journal">
      <div class="wc-h">${tonight.length ? 'Tonight' : "Today's recap"}</div>
      ${tonight.length ? `<div class="wc-notes">${tonight.map((j) => j.pending
            ? '<div class="pending"><i>Listening</i><p>Claude is reading what you said…</p></div>'
            : `<div><i>${j.kind === 'reflection' ? 'Reflection' : j.note ? 'For tomorrow' : 'Sorted'} · ${hm(j.at)}</i><p>${esc(j.note || [j.tasks?.length && `Added ${j.tasks.length} task${j.tasks.length > 1 ? 's' : ''}`, j.completed?.length && `marked ${j.completed.length} done`].filter(Boolean).join(', ') || j.text)}</p></div>`).join('')}</div>`
        : r ? `<p class="wc-recap">${esc(r.headline)}</p>`
        : '<p class="wc-recap dim">Press the ring and say what\'s on your mind. Claude keeps it as a reflection on today or a note for tomorrow.</p>'}
    </section>
    <div class="wind-foot">
      <button data-act="note-add">${icon('journal')} Add a note</button>
      <button data-act="wind-override">Show everything</button>
      <button class="to-sleep" data-act="mode" data-mode="sleep">${icon('moon')} Sleep</button>
    </div>
  </div>`;
}

// The morning brief: a sunrise over the day ahead, on the desk screen from wake
// time until it's tapped away.
function renderMorning() {
  const el = $('#morning');
  const show = KIOSK && D.morningDue && D.mode === 'day';
  if (!show) { el.hidden = true; el.dataset.html = ''; return; }
  const now = new Date(), h = now.getHours();
  const w = D.weather?.data;
  const rainH = w?.nextRain ? new Date(w.nextRain.time).getHours() : 0;
  const open = realTodos().filter((t) => !t.done);
  const dueToday = open.filter((t) => t.due && t.due < dayStart(1));
  const carried = dueToday.filter((t) => t.due < dayStart()).length;
  const events = (D.calendar?.data?.events || []).filter((e) => e.start < dayStart(1) && (e.allDay || e.end >= Date.now())).slice(0, 3);
  const p = D.payit?.data;
  const yesterday = p?.week?.length > 1 ? p.week[p.week.length - 2].cents : null;
  const missed = (D.mail?.data?.accounts || []).flatMap((a) => a.messages).filter((m) => !m.hidden && (m.priority === 'urgent' || m.action)).length;
  const line = D.digest?.headline || (missed ? `${missed} email${missed > 1 ? 's' : ''} still need${missed > 1 ? '' : 's'} you.` : '');
  const html = `<div class="mb-sun"></div>
    <div class="mb-top">
      <div class="mb-kicker">${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · ${hm(now.getTime())}</div>
      <h1>${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}</h1>
      ${w ? `<p>${w.temp}° and ${esc(wx(w.code)[0].toLowerCase())}, high ${w.hi}°. ${w.nextRain ? `Rain likely after ${rainH % 12 || 12} ${rainH < 12 ? 'AM' : 'PM'}.` : w.rainChance >= 30 ? `${w.rainChance}% chance of rain.` : 'No rain expected.'}</p>` : ''}
    </div>
    <div class="mb-sheet">
      <div class="kicker">Your day</div>
      ${events.length ? events.map((e) => `<div class="mb-ev"><span>${e.allDay ? 'All day' : hm(e.start)}</span><b>${esc(e.title)}</b><em>${esc((e.location || e.calendar || '').split(',')[0])}</em></div>`).join('')
        : '<div class="mb-ev empty"><b>Nothing on the calendar today.</b></div>'}
      <div class="mb-tiles">
        <div><b class="amber">${dueToday.length}</b><span>task${dueToday.length === 1 ? '' : 's'} due today${carried ? ` · ${carried} from before` : ''}</span></div>
        ${yesterday != null ? `<div><b class="mint">${money(yesterday)}</b><span>PayIt yesterday</span></div>` : `<div><b>${open.length}</b><span>open in To do</span></div>`}
      </div>
      ${line ? `<div class="mb-digest">${esc(line)}</div>` : ''}
      <button class="mb-go" data-act="morning-done">Start the day</button>
    </div>`;
  if (el.dataset.html !== html.replace(/· \d+:\d+ [AP]M/, '')) { el.innerHTML = html; el.dataset.html = html.replace(/· \d+:\d+ [AP]M/, ''); }
  el.hidden = false;
}

// Wind-down (desk screen only): work is put away for the night.
const WIND_VIEWS = ['home', 'tasks', 'journal', 'settings'];
const winding = () => KIOSK && D?.phase === 'winddown' && ui.windOverride !== new Date().toDateString();

const NAV = [['home', 'Home'], ['focus', 'Focus'], ['tasks', 'To do'], ['payit', 'PayIt'], ['mail', 'Mail'], ['claude', 'Claude'], ['journal', 'Journal'], ['schedule', 'Schedule'], ['settings', 'Settings']];

function renderRail() {
  const urgentMail = (D?.mail?.data?.accounts || []).flatMap((a) => a.messages).filter((m) => m.priority === 'urgent' && !m.hidden).length;
  const openToday = (D?.todos || []).filter((t) => !t.done && !t.suggested && t.due && t.due < dayStart(1)).length;
  const badge = { mail: urgentMail, tasks: openToday + (D ? suggestedTodos().length : 0), claude: claudeLive().filter((c) => chatKind(c) !== 'running').length };
  const nav = winding() ? NAV.filter(([k]) => WIND_VIEWS.includes(k)) : NAV;
  $('#rail').innerHTML = nav.map(([k, label]) => `<button class="${view === k ? 'on' : ''}" data-act="go" data-view="${k}" data-sec="${k}">
      <span class="pill">${icon(k)}${badge[k] ? `<span class="badge">${badge[k]}</span>` : ''}</span><em>${label}</em></button>`).join('');
}

// The strip along the top: which hub this is and how it's doing, plus alerts and sleep.
function renderStatus() {
  const alerts = D?.alerts || [];
  const serious = alerts.some((a) => a.level !== 'info');
  const temp = D?.system?.tempC;
  const label = (NAV.find(([k]) => k === view) || [])[1] || view;
  $('#status').innerHTML = `<span class="st-dot ${D?.payit?.error || D?.mail?.error ? 'warn' : ''}"></span>
    <span class="st-text">${esc(D?.system?.host || 'deskhub')}${temp ? ` · ${Math.round(temp)}°C` : ''} · ${esc(winding() && view === 'home' ? 'wind down' : label.toLowerCase())}</span>
    <button class="st-btn ${alerts.length ? (serious ? 'hot' : 'has') : ''}" data-act="alerts" aria-label="Alerts">${icon('bell')}${alerts.length ? `<b>${alerts.length}</b>` : ''}</button>
    <button class="st-btn" data-act="mode" data-mode="sleep" aria-label="Sleep">${icon('moon')}</button>`;
}

// A laptop-sized window gets the workstation; the desk screen and phones get the touch screens.
const wsMode = () => !KIOSK && innerWidth >= 1024;

function render() {
  if (!D) return;
  const ws = wsMode();
  document.documentElement.classList.toggle('wsmode', ws);
  $('#ws').hidden = !ws;
  if (ws) {
    document.documentElement.classList.remove('winddown');
    document.documentElement.style.setProperty('--ts', 1);
    if (T.lock) { T.lock = false; T.done = null; saveT(); }
    $('#focuslock').hidden = true; $('#drawer').hidden = true;
    WS.render();
    return;
  }
  document.documentElement.classList.toggle('winddown', winding());
  document.documentElement.dataset.view = view;
  // Text size is tuned for reading the desk screen from a chair; a phone in the hand stays at 100%.
  document.documentElement.style.setProperty('--ts', !KIOSK && innerWidth <= 600 ? 1 : (D.settings.textSize || 115) / 100);
  if (winding() && !WIND_VIEWS.includes(view)) view = 'home';
  renderRail();
  renderStatus();
  // The screen fades in when you arrive on it, not every time fresh data redraws it.
  $('#view').classList.toggle('enter', Boolean(ui.entering)); ui.entering = false;
  $('#view').innerHTML = winding() && view === 'home' ? windHome() : VIEWS[view]();
  mountClocks();
  if (ui.jFocus) { const q = $('[data-jsearch]'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
  reportDesk();
  renderMorning();
  renderLock();
  renderCall();
  if (!$('#drawer').hidden) renderDrawer();
}




// The email's own HTML, shown in a sandboxed frame: scripts can't run, forms
// can't submit, and it can't reach the hub. Images load as the sender intended.
// On the desk screen links do nothing; on a phone or laptop they open a new tab.
function emailDoc(html) {
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src http: https: data:; style-src 'unsafe-inline' http: https:; font-src http: https: data:; media-src 'none'">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>html{background:#fff;color:#111;font:16px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif}body{margin:14px;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}</style>
    </head><body>${html}</body></html>`;
}


// ---------------------------------------------------------------------------
// Sheets: panels that slide up from the bottom over a scrim (#drawer).
// ---------------------------------------------------------------------------

const SRC_ICON = { payit: 'payit', mail: 'mail', calendar: 'schedule', tasks: 'tasks', journal: 'journal', voice: 'journal', system: 'settings', focus: 'focus', claude: 'claude' };
const sheet = (inner, cls = '') => { $('#drawer').innerHTML = `<div class="sheet ${cls}" data-stop><i class="grab"></i>${inner}</div>`; };
const sheetHead = (title, extra = '') => `<div class="sh-head"><b>${title}</b>${extra}<button class="sq-btn big" data-act="close-drawer" aria-label="Close">${icon('x')}</button></div>`;
function showDrawer() {
  const el = $('#drawer');
  el.hidden = false; el.classList.add('opening');
  clearTimeout(showDrawer.t); showDrawer.t = setTimeout(() => el.classList.remove('opening'), 400);
}
function openSheet(kind) { ui.drawer = kind; showDrawer(); renderDrawer(); }

function renderDrawer() {
  if (ui.drawer === 'mail') return renderReader();
  if (ui.drawer === 'weather') return renderWeather();
  if (ui.drawer === 'event') return renderEvent();
  if (ui.drawer === 'pick') return renderPick();
  const alerts = D.alerts;
  sheet(`${sheetHead('Alerts', `<span class="sh-meta">${alerts.length ? `${alerts.length} open` : ''}</span>`)}
    <div class="sh-scroll">${alerts.length ? alerts.map((a) => `<div class="alert-row">
        <span class="tile ${esc(a.level)}">${icon(SRC_ICON[a.source] || 'bell')}</span>
        <div class="grow"><b>${esc(a.title.charAt(0).toUpperCase() + a.title.slice(1))}</b>${a.body ? `<p>${esc(a.body)}</p>` : ''}</div>
        <span class="alert-src">${esc(a.source)}${a.at ? `<br>${hm(a.at)}` : ''}</span>
        <button class="sq-btn" data-act="dismiss" data-id="${esc(a.id)}" aria-label="Dismiss">${icon('x')}</button>
      </div>`).join('') : '<div class="empty center pad">Nothing needs your attention.</div>'}</div>`);
}

// Focus → "Working on": pick the task this session is for.
function renderPick() {
  const open = realTodos().filter((t) => !t.done).sort(todoSort).slice(0, 7);
  const opt = (label, text, meta) => `<button class="pick-row ${T.label === label ? 'on' : ''}" data-act="t-label" data-label="${esc(label)}"><i></i><span>${esc(text)}</span><em>${esc(meta)}</em></button>`;
  sheet(`${sheetHead('What are you working on?')}
    <div class="sh-scroll">${opt('', 'Nothing in particular', '')}${open.map((t) => { const subs = t.subtasks || [];
      return opt(t.text, t.text, subs.length ? `${subs.filter((x) => x.done).length} of ${subs.length}` : dueLabel(t)?.[0] || t.tag || ''); }).join('')}</div>`);
}

function renderWeather() {
  const w = D.weather?.data;
  if (!w) { $('#drawer').hidden = true; return; }
  const [label, ic] = wx(w.code);
  const t = (s) => new Date(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const hr = (s) => { const h = new Date(s).getHours(); return `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`; };
  const [tLabel, tIcon] = wx(w.tomorrow.code);
  const facts = [['Feels like', `${w.feels}°`], ['Wind', `${w.wind ?? '–'} ${w.windUnit || ''}`], ['Humidity', `${w.humidity ?? '–'}%`], ['Rain today', `${w.rainChance ?? 0}%`], ['Sunrise', w.sunrise ? t(w.sunrise) : '–'], ['Sunset', w.sunset ? t(w.sunset) : '–']];
  sheet(`${sheetHead('Weather')}
    <div class="wx-now">${icon(ic)}<b>${w.temp}°</b><div><div>${esc(label)}</div><span>High ${w.hi}° · Low ${w.lo}°</span></div></div>
    <div class="wx-hours">${(w.hours || []).slice(0, 12).map((h, i) => `<div><span>${i === 0 ? 'Now' : hr(h.time)}</span><b>${h.temp}°</b><i><u style="height:${Math.max(0, Math.min(100, h.rain))}%"></u></i><em>${h.rain}%</em></div>`).join('')}</div>
    <div class="wx-facts">${facts.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>
    <div class="wx-tomorrow">${icon(tIcon)}<span>Tomorrow · ${esc(tLabel)}</span><em>${w.tomorrow.hi}° / ${w.tomorrow.lo}° · ${w.tomorrowRain ?? 0}%</em></div>`, 'weather');
}

// One calendar event in full: when, where, what it says, who's going, and my reply.
function renderEvent() {
  const e = (D.calendar?.data?.events || []).find((x) => x.id === ui.eventId);
  if (!e) { $('#drawer').hidden = true; return; }
  const day = new Date(e.start).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const mins = Math.round((e.end - e.start) / 60e3);
  const long = mins >= 60 ? `${Math.floor(mins / 60)} hr${mins % 60 ? ` ${mins % 60} min` : ''}` : `${mins} min`;
  const time = e.allDay ? 'All day' : e.end > e.start ? `${hm(e.start)} – ${hm(e.end)} · ${long}` : hm(e.start);
  const until = e.start - Date.now();
  const rel = e.allDay ? '' : until <= 0 && e.end > Date.now() ? 'Happening now' : until > 0 && until < 3600e3 ? `Starts in ${Math.max(1, Math.round(until / 60e3))} min` : '';
  const REPLY = { yes: 'Going', no: 'Not going', maybe: 'Maybe', none: 'Not answered' };
  const fact = (ic, main, sub) => `<div class="ev-fact"><span class="tile cal">${icon(ic)}</span><div><b>${esc(main)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div></div>`;
  sheet(`${sheetHead(esc(e.title))}
    <div class="sh-scroll gap">
      ${fact('schedule', day, [time, rel, e.repeats ? 'Repeats' : ''].filter(Boolean).join(' · '))}
      ${e.location ? fact('pin', e.location) : ''}
      ${e.link ? fact('link', /zoom|meet\.google|teams\.|webex/i.test(e.link) ? 'Video call' : 'Link', e.link.replace(/^https?:\/\//, '')) : ''}
      ${fact('tasks', e.calendar, e.organizer ? (e.organizedByMe ? 'You organized this' : `Organized by ${e.organizer}`) : '')}
      ${e.myReply ? `<div class="ev-reply ${e.myReply}"><span>Your reply</span><b>${REPLY[e.myReply]}</b></div>` : ''}
      ${e.description ? `<div class="ev-desc">${esc(e.description)}</div>` : ''}
      ${e.guests?.length ? `<div class="kicker">Guests · ${e.guestCount}</div><div class="ev-guests">${e.guests.map((g) => `<div class="${g.reply}"><i></i><b>${esc(g.name)}</b><span>${REPLY[g.reply]}</span></div>`).join('')}</div>` : ''}
    </div>`, 'event');
}

// Reading one email in full. The text is fetched from the mailbox on demand.
function renderReader() {
  const r = ui.reading;
  const m = r?.message;
  const listed = D.mail?.data?.accounts.flatMap((a) => a.messages).find((x) => x.id === r?.id);
  const title = m?.subject || listed?.subject || listed?.summary || 'Email';
  const from = m?.from || listed?.from || '';
  sheet(`<div class="sh-head top"><b>${esc(title)}</b><button class="sq-btn big" data-act="close-drawer" aria-label="Close">${icon('x')}</button></div>
    <div class="rd-from"><b>${esc(from)}</b>${m?.date || listed?.date ? ` · ${ago(m?.date || listed.date) === 'now' ? 'just now' : `${ago(m?.date || listed.date)} ago`}` : ''}${m?.account ? ` · ${esc(m.account)}` : ''}</div>
    ${r?.summary ? `<div class="rd-sum">${esc(r.summary)}${r.action ? `<span>${icon('arrow')}${esc(r.action)}</span>` : ''}</div>` : ''}
    ${r?.id ? `<button class="btn primary small rd-task" data-act="mail-todo" data-id="${esc(r.id)}">${icon('plus')} Make it a task</button>` : ''}
    ${r?.error ? `<div class="empty warn">${esc(r.error)}</div>`
      : !m ? '<div class="rd-wait"><span>Fetching the email as it was sent…</span><div class="loadbar white"><i></i></div></div>'
      : m.html ? `<iframe class="rd-frame" title="Email" sandbox="${KIOSK ? 'allow-same-origin' : 'allow-popups allow-popups-to-escape-sandbox'}" referrerpolicy="no-referrer" srcdoc="${esc(emailDoc(m.html))}"></iframe>`
      : `<div class="rd-body">${esc(m.text)}${m.truncated ? '\n\n[This email is very long; the rest is cut off here.]' : ''}</div>`}
    ${m?.attachments?.length ? `<div class="rd-attach">Attachments: ${m.attachments.map(esc).join(', ')}</div>` : ''}`, 'reader');
  // Scripts stay off in the frame; same-origin only lets the hub attach drag-scrolling to it.
  const frame = $('#drawer .rd-frame');
  // Touches inside the email also count as the screen being in use.
  if (frame && KIOSK) frame.addEventListener('load', () => { try { enableDragScroll(frame.contentDocument, () => frame.contentDocument.scrollingElement); frame.contentDocument.addEventListener('pointerdown', () => (lastTouch = Date.now()), true); } catch {} });
}

// ---------------------------------------------------------------------------
// The voice-note pop-up: what the ring heard, then what the hub did with it.
// The server announces each note twice over /api/events ("heard", then "done"
// with the actions it took); the regular refresh catches anything that missed.
// ---------------------------------------------------------------------------

const NOTE_ACT = {
  task: ['Added task', 'var(--g-tasks)', 'plus', '#FFD27A'],
  done: ['Marked done', 'var(--g-money)', 'check', '#6EF0B4'],
  cal: ['Calendar', 'var(--g-cal)', 'schedule', '#8AB4FF'],
  note: ['Saved note', 'var(--g-journal)', 'journal', '#FF9DB0'],
  reflection: ['Reflection', 'var(--g-mail)', 'journal', '#C59CFF'],
};
const HEARD_MS = 1100, DONE_MS = 5400;
let ringNote = null; // { id, source, said, stage: 'heard' | 'think' | 'done', actions, at, timers }
const ringSeen = new Set(); // "<id>:<stage>" already handled, so an event and the refresh don't both show it
const ringOff = () => !KIOSK && localStorage.getItem('ringNotes') === 'off';

function closeRing() {
  ringNote?.timers.forEach(clearTimeout);
  ringNote = null;
  renderRing();
}

function finishRing() {
  ringNote.stage = 'done';
  renderRing();
  ringNote.timers.push(setTimeout(closeRing, DONE_MS));
}

function showRing(ev) {
  closeRing();
  ringNote = { id: ev.id, source: ev.source, said: ev.said || '', stage: 'heard', actions: null, at: Date.now(), timers: [] };
  renderRing(true);
  // Hold "Got your voice note" for a beat, then either show the result or that Claude is still on it.
  ringNote.timers.push(setTimeout(() => {
    if (!ringNote) return;
    if (ringNote.actions) finishRing(); else { ringNote.stage = 'think'; renderRing(); }
  }, HEARD_MS));
}

function noteEvent(ev) {
  if (ringOff() || !ev?.id || ringSeen.has(`${ev.id}:${ev.stage}`)) return;
  ringSeen.add(`${ev.id}:${ev.stage}`);
  if (ev.stage === 'heard') { if (!ringSeen.has(`${ev.id}:done`)) showRing(ev); return; }
  if (ringNote?.id !== ev.id) showRing(ev); // the "heard" half never arrived
  ringNote.actions = ev.actions?.length ? ev.actions : [{ kind: 'note', text: "Saved to today's journal" }];
  if (ev.said) ringNote.said = ev.said;
  if (Date.now() - ringNote.at >= HEARD_MS) { ringNote.timers.forEach(clearTimeout); finishRing(); }
}

function renderRing(first = false) {
  const el = $('#ringnote');
  if (!ringNote) { el.hidden = true; el.innerHTML = ''; return; }
  const n = ringNote, acts = n.actions || [];
  const title = n.stage === 'heard' ? (n.source === 'typed' ? 'Got your note' : 'Got your voice note') : n.stage === 'think' ? 'Working on it' : `Done · ${acts.length} thing${acts.length === 1 ? '' : 's'}`;
  el.innerHTML = `<div class="rn-head"><span class="rn-tile"><i></i><b>${icon('journal')}</b></span>
      <div class="grow"><b>${title}</b><span>${{ typed: 'Typed note', phone: 'From your phone', computer: 'From your computer' }[n.source] || 'From your ring'} · just now</span></div>
      <button class="sq-btn" data-act="ring-close" aria-label="Close">${icon('x')}</button></div>
    ${n.said ? `<p class="rn-said ${first ? 'in' : ''}">“${esc(n.said)}”</p>` : ''}
    ${n.stage === 'think' ? '<div class="rn-think"><span>Working out what you meant…</span><div class="loadbar journal"><i></i></div></div>' : ''}
    ${n.stage === 'done' ? `<div class="rn-acts">${acts.slice(0, 5).map((a, i) => { const [label, bg, ic, c] = NOTE_ACT[a.kind] || NOTE_ACT.note;
        return `<div style="animation-delay:${(i * 0.18).toFixed(2)}s"><span class="tile" style="background:${bg}">${icon(ic)}</span><div class="grow"><em style="color:${c}">${label}</em><p>${esc(a.text)}</p></div></div>`; }).join('')}</div>
      <div class="rn-foot"><div><i></i></div><span>Tap to open journal</span></div>` : ''}`;
  el.hidden = false;
}

// Anything in the journal that this page hasn't shown yet (the event stream was down, or missed one).
let journalSeen = null;
function watchJournal() {
  const list = D.journal || [];
  if (journalSeen) for (const j of list) {
    const isNew = !journalSeen.has(j.id);
    const base = { id: j.id, source: ['typed', 'phone', 'computer'].includes(j.trigger) ? j.trigger : 'ring', said: j.text };
    if (isNew) noteEvent({ ...base, stage: 'heard' });
    if (!j.pending && (isNew || ringNote?.id === j.id)) noteEvent({ ...base, stage: 'done', actions: j.actions });
  }
  journalSeen = new Set(list.map((j) => j.id));
}

let events = null;
function listenForEvents() {
  if (events || !window.EventSource) return;
  events = new EventSource('/api/events');
  events.onmessage = (e) => {
    let ev; try { ev = JSON.parse(e.data); } catch { return; }
    if (ev.type.startsWith('desk.')) return deskEvent(ev);
    if (ev.type === 'claude') return load(); // a chat started, finished or is waiting on you
    if (ev.type !== 'journal.entry') return;
    noteEvent(ev);
    WS.onEvent(ev);
    if (ev.stage === 'done') load(); // new tasks and ticked ones show at once
  };
}

// The desk screen tells the hub what it's showing and how its timer stands, so a laptop can mirror it.
let deskReported = '';
function reportDesk(force = false) {
  if (!KIOSK || !D) return;
  const body = { view, timer: T.running || T.remaining != null ? { phase: T.phase, running: T.running, endsAt: T.endsAt, remaining: T.remaining, total: tTotal(), label: T.label } : null };
  const sig = JSON.stringify(body);
  if (!force && sig === deskReported) return;
  deskReported = sig;
  api('POST', '/api/desk/report', body).catch(() => { deskReported = ''; });
}
setInterval(() => reportDesk(true), 30e3);

function deskEvent(ev) {
  if (!KIOSK) {
    // Another screen: keep the mirror of the desk current.
    if (ev.type === 'desk.state' && D) { D.desk = ev.desk; if (wsMode()) render(); }
    return;
  }
  if (ev.type === 'desk.state') return; // its own report coming back; nothing to do
  lastTouch = Date.now(); // a view sent from the laptop counts as use, so it isn't sent straight back to Home
  if (ev.type === 'desk.view' && VIEWS[ev.view]) go(ev.view);
  else if (ev.type === 'desk.focus') {
    if (T.running || T.remaining != null) timerReset('focus');
    Object.assign(T, { phase: 'focus', label: ev.label || '' });
    dialSet(ev.minutes);
    go('focus'); startFocus();
  } else if (ev.type === 'desk.timer') {
    if (ev.action === 'pause' && T.running) timerPause();
    else if (ev.action === 'resume' && !T.running && T.remaining != null) timerStart();
    else if (ev.action === 'end' && (T.running || T.remaining != null)) timerFinish(true);
  }
}

// Wind-down banner: 30 minutes before sleep mode kicks in.
function renderBanner() {
  const el = $('#banner');
  if (!KIOSK && D && D.mode !== 'day') {
    el.innerHTML = `<div class="b">${icon('moon')} Desk display is asleep <button class="btn small" data-act="mode" data-mode="day">Wake it</button></div>`;
    return;
  }
  if (!D?.settings.autoSleep || D.mode !== 'day') { el.innerHTML = ''; return; }
  const [h, m] = D.settings.sleepAt.split(':').map(Number);
  const now = new Date(), mins = now.getHours() * 60 + now.getMinutes();
  const until = (h * 60 + m - mins + 1440) % 1440;
  el.innerHTML = until > 0 && until <= 30
    ? `<div class="b">${icon('moon')} Wind down — sleep mode in ${until} min <button class="btn small" data-act="mode" data-mode="sleep">Sleep now</button></div>` : '';
}

// ---------------------------------------------------------------------------
// Sleep mode
// ---------------------------------------------------------------------------

function nextMorningLine() {
  const evs = (D.calendar?.data?.events || []).filter((e) => e.start >= dayStart(1) && e.start < dayStart(2) && !e.allDay);
  const wake = D.settings.wakeAt;
  return `Wakes ${esc(clock12(wake))}${evs.length ? ` · ${esc(evs[0].title)} at ${hm(evs[0].start).replace(/ (AM|PM)$/, '')}` : ''}`;
}

function renderSleep() {
  const el = $('#sleep');
  el.hidden = !KIOSK || D.mode === 'day'; // a phone shouldn't go dark because the desk did
  if (el.hidden) return;
  el.classList.toggle('sim', !D.hasBacklight);
  const d = new Date();
  const html = `<div class="time">${d.getHours() % 12 || 12}:${pad(d.getMinutes())}</div>
    <div class="next">${nextMorningLine()}</div>
    <button class="wake" data-act="mode" data-mode="day">Wake</button>`;
  if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
}

let lastMode = null;
function syncMode() {
  if (D.mode !== lastMode) {
    lastMode = D.mode;
    if (D.mode === 'day') $('#sleep').hidden = true;
    renderSleep();
  }
}

let revealTimer;
$('#sleep').addEventListener('pointerdown', (e) => {
  if (e.target.closest('[data-act]')) return;
  const el = $('#sleep');
  // In "off" mode the first tap brings the dim clock back briefly.
  el.classList.add('reveal');
  // Light the panel up for a few seconds so the buttons can be seen in daylight.
  if (KIOSK) api('POST', '/api/peek').catch(() => {});
  clearTimeout(revealTimer);
  revealTimer = setTimeout(() => el.classList.remove('reveal'), 6000);
});

// ---------------------------------------------------------------------------
// Sign-in (remote devices only; the desk screen is always trusted)
// ---------------------------------------------------------------------------

function showLogin(canSignIn) {
  const el = $('#login');
  if (!el.hidden) return;
  el.hidden = false;
  el.innerHTML = canSignIn
    ? `<form class="login-card"><h1>Desk Hub</h1><p class="muted">Enter the hub password to continue.</p>
        <input type="password" name="password" placeholder="Password" autocomplete="current-password" autofocus>
        <div class="err" role="alert"></div><button class="btn primary" type="submit">Sign in</button></form>`
    : `<div class="login-card"><h1>Desk Hub</h1><p class="muted">Remote access isn't turned on. Set HUB_PASSWORD in the Pi's .env, then reload.</p></div>`;
  el.querySelector('form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = el.querySelector('.err');
    err.textContent = '';
    try {
      await api('POST', '/api/login', { password: new FormData(e.target).get('password') });
      el.hidden = true; el.innerHTML = '';
      load();
    } catch (ex) { err.textContent = ex.message; }
  });
}

// ---------------------------------------------------------------------------
// Claude on the desk: a chat that finishes or starts waiting on you takes over
// the screen for a moment. Waiting outranks finished; a finished one steps
// aside on its own after 12 seconds. Animations are transform and opacity only,
// so the Pi keeps them smooth.
// ---------------------------------------------------------------------------

const takeoverOn = () => KIOSK && D?.settings.claudeTakeover !== false;
const CALL_DONE_MS = 12e3, CALL_REMIND_MS = 5 * 60e3;
let claudeSeen = null; // id -> "state|since" in the last snapshot
let callTimer = null, closeTimer = null;
const callChat = () => (ui.call ? claudeChats().find((x) => x.id === ui.call.id) : null);

function watchClaude() {
  const chats = claudeChats();
  const now = new Map(chats.map((c) => [c.id, `${c.state}|${c.since}`]));
  if (takeoverOn()) {
    for (const c of chats) {
      const was = claudeSeen?.get(c.id);
      if (was === now.get(c.id)) continue;
      // After a reload a chat already waiting on you still gets its moment; a finished one only right as it finishes.
      if (c.state === 'needs' && !ui.callLater[c.id]) showCall(c);
      else if (c.state === 'done' && c.unread && was && !was.startsWith('done')) showCall(c);
    }
    // "Later" on a chat that's still waiting brings it back after 5 minutes, like the Mac's reminders.
    for (const c of chats) {
      const later = ui.callLater[c.id];
      if (later && c.state !== 'needs') delete ui.callLater[c.id];
      else if (later && Date.now() - later > CALL_REMIND_MS) { delete ui.callLater[c.id]; showCall(c); }
    }
  }
  claudeSeen = now;
  renderCall();
}

function showCall(c) {
  const kind = c.state === 'needs' ? 'needs' : 'done';
  if (D.mode !== 'day' || (kind === 'done' && T.lock && T.running)) return;
  if (ui.call?.kind === 'needs' && kind === 'done' && callChat()?.state === 'needs') return;
  ui.call = { id: c.id, kind, at: Date.now() };
  chime(kind === 'needs' ? 'alert' : 'done');
  clearTimeout(callTimer);
  if (kind === 'done') callTimer = setTimeout(() => { if (ui.call?.id === c.id && ui.call.kind === 'done') closeCall(); }, CALL_DONE_MS);
}

function renderCall() {
  const el = $('#claudecall');
  const call = ui.call, c = callChat();
  // The chat moved on (you answered it on the Mac, or it closed): ease the screen away.
  if (!call || !c || (call.kind === 'needs' ? c.state !== 'needs' : c.state !== 'done')) { if (call || !el.hidden) closeCall(); return; }
  if (!takeoverOn() || D.mode !== 'day') { closeCall(true); return; }
  const key = `${call.id}|${call.kind}|${call.at}`;
  if (el.dataset.key === key && !el.hidden && !el.classList.contains('leaving')) return; // rebuilding would restart its animations

  clearTimeout(closeTimer);
  // The dimmed backdrop stays put when one alert replaces another; only the content swaps.
  if (el.hidden || el.classList.contains('leaving') || !$('.ca-stage', el)) el.innerHTML = '<div class="ca-scrim"></div><div class="ca-stage"></div>';
  el.className = `claudecall ${call.kind}`;
  el.style.setProperty('--pc', projectColor(c.project));
  const others = claudeLive().filter((x) => x.id !== c.id && chatKind(x) !== 'running').length;
  const left = Math.max(0, CALL_DONE_MS - (Date.now() - call.at));
  const R = 92, LEN = (2 * Math.PI * R).toFixed(1);
  $('.ca-stage', el).innerHTML = `<div class="ca-bloom"></div>
    ${others ? `<div class="ca-more">+${others} more on the board</div>` : ''}
    <div class="ca-orb">
      <i class="ca-ripple"></i><i class="ca-ripple two"></i>
      ${call.kind === 'done' ? `<svg class="ca-count" viewBox="0 0 200 200"><circle cx="100" cy="100" r="${R}" style="--len:${LEN};animation-duration:${left}ms"/></svg>` : ''}
      <span class="ca-core">${call.kind === 'done' ? '<svg class="ca-check" viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>' : icon('hand', 'i ca-hand')}</span>
    </div>
    <div class="ca-kicker">${call.kind === 'needs' ? 'Claude needs you' : 'Claude is done'}</div>
    <div class="ca-proj">${esc(c.project || 'Claude')}</div>
    <h1 class="ca-title">${esc(c.title)}</h1>
    <p class="ca-text">${esc(call.kind === 'needs' ? c.detail || 'Waiting on you' : c.preview || 'Finished')}</p>
    <div class="ca-acts">
      <button class="ca-open" data-act="claude-open" data-id="${esc(c.id)}">Open on Mac ${icon('arrow')}</button>
      <button class="ca-later" data-act="call-later" data-id="${esc(c.id)}">${call.kind === 'needs' ? 'Later' : 'Close'}</button>
    </div>`;
  el.dataset.key = key;
  el.hidden = false;
}

function closeCall(immediate = false) {
  ui.call = null;
  clearTimeout(callTimer);
  const el = $('#claudecall');
  if (el.hidden) return;
  el.dataset.key = '';
  if (immediate) { el.hidden = true; el.innerHTML = ''; return; }
  el.classList.add('leaving');
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => { el.hidden = true; el.classList.remove('leaving'); el.innerHTML = ''; }, 420);
}

/** Opens a chat on the Mac (through Claude Status's connection to the hub). */
async function openOnMac(id) {
  if (!id) return;
  ui.claudeOpening = { id, at: Date.now() };
  if (ui.call?.id === id) closeCall();
  render();
  try {
    const r = await api('POST', '/api/claude/open', { id });
    if (!r.delivered) toast({ level: 'warn', source: 'claude', title: "Your Mac didn't pick that up", body: 'Make sure Claude Status is running and the Mac is awake, then tap again.' });
  } catch (err) {
    toast({ level: 'warn', source: 'claude', title: "Couldn't open that chat", body: err.message });
  }
  setTimeout(() => { if (ui.claudeOpening?.id === id) { ui.claudeOpening = null; render(); } }, 3500);
  load();
}

// ---------------------------------------------------------------------------
// Alerts -> toasts
// ---------------------------------------------------------------------------

let seenAlerts = null;
function handleAlerts() {
  const ids = new Set(D.alerts.map((a) => a.id));
  if (seenAlerts) {
    const fresh = D.alerts.filter((a) => !seenAlerts.has(a.id) && (a.source !== 'voice' || ringOff()) && !(takeoverOn() && /^claude(done)?:/.test(a.id)));
    // During wind-down only real problems interrupt; everything else waits for morning.
    if (winding() || (T.lock && T.running && T.phase === 'focus')) fresh.splice(0, fresh.length, ...fresh.filter((a) => a.level !== 'info'));
    if (fresh.length && D.mode === 'day') {
      fresh.slice(0, 3).forEach(toast);
      chime(fresh.some((a) => a.level !== 'info') ? 'alert' : 'soft');
    }
  }
  seenAlerts = ids;
}

function toast(a) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="tile ${esc(a.level || 'info')}">${icon(SRC_ICON[a.source] || 'bell')}</span>
    <div class="grow"><b>${esc(a.title)}</b>${a.body || a.source ? `<p>${esc([a.source, a.body].filter(Boolean).join(' · '))}</p>` : ''}</div>
    <button aria-label="Dismiss">${icon('x')}</button>`;
  el.addEventListener('pointerdown', () => el.remove());
  $('#toasts').prepend(el);
  setTimeout(() => el.remove(), 4500);
}

// ---------------------------------------------------------------------------
// Interactions (one delegated handler)
// ---------------------------------------------------------------------------

function go(v) { if (v !== view) ui.entering = true; view = v; ui.chartSel = {}; if (v === 'schedule') ui.schedDay = 0; applySky(); render(); }

async function addTask(preset = {}) {
  const tags = D.settings.tags;
  openKeyboard({
    title: 'New task',
    value: preset.text || '',
    options: [
      { key: 'tag', choices: [[null, 'No tag'], ...tags.map((t) => [t, t])], value: preset.tag ?? (tags.includes(ui.taskFilter) ? ui.taskFilter : null) },
      { key: 'due', choices: [[null, 'No date'], [dayStart(), 'Today'], [dayStart(1), 'Tomorrow'], [dayStart(7), 'Next week']], value: preset.due ?? (ui.taskFilter === 'today' ? dayStart() : null) },
    ],
    onDone: async (text, opts) => {
      if (!text.trim()) return;
      await api('POST', '/api/todos', { text, ...opts });
      load();
    },
  });
}

const SET_STEPS = { homeAfter: 1, windDownAt: 15, recapAt: 15, digestAt: 15, sleepAt: 15, wakeAt: 15, focusMinutes: 5, shortBreak: 1, longBreak: 5 };

async function patchSettings(patch) {
  Object.assign(D.settings, patch);
  render();
  await api('PATCH', '/api/settings', patch);
  load();
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) {
    if (e.target.closest('#drawer') && !e.target.closest('[data-stop]')) $('#drawer').hidden = true;
    return;
  }
  const { act } = el.dataset;
  try {
    switch (act) {
      case 'go': go(el.dataset.view); break;
      case 'claude-open': openOnMac(el.dataset.id); break;
      case 'claude-readall': await api('POST', '/api/claude/read', { all: true }); load(); break;
      case 'call-later': ui.callLater[el.dataset.id] = Date.now(); closeCall(); break;
      case 'chart': ui.chartSel[el.dataset.id] = Number(el.dataset.i); render(); break;
      case 'sys-fold': ui.sysOpen = !ui.sysOpen; render(); break;
      case 't-start': if (T.phase === 'focus') startFocus(); else timerStart(); break;
      case 'lock-resume': timerStart(); break;
      case 'lock-break': T.done = null; timerStart(); break;
      case 'lock-next': T.done = null; lockCount = 0; timerStart(); break;
      case 'lock-leave': exitLock(); break;
      case 't-pause': timerPause(); break;
      case 't-reset': timerReset(); break;
      case 't-skip': timerFinish(true); break;
      case 't-adj': timerAdjust(Number(el.dataset.min)); break;
      case 't-phase': timerReset(el.dataset.phase); break;
      case 't-set': dialSet(Number(el.dataset.min)); render(); break;
      case 't-nudge': {
        const stepBy = T.phase === 'focus' ? 5 : 1, max = dialMax(T.phase);
        dialSet(Math.min(max, Math.max(stepBy, phaseMinutes(T.phase) + Number(el.dataset.d) * stepBy))); render();
        break;
      }
      case 'pick-task': openSheet('pick'); break;
      case 't-label': T.label = el.dataset.label; saveT(); $('#drawer').hidden = true; render(); break;
      case 'todo-add': addTask(); break;
      case 'todo-toggle': {
        const t = D.todos.find((x) => x.id === el.dataset.id);
        if (t.finishing) break;
        if (t.done) { t.done = false; t.doneAt = null; render(); await api('PATCH', `/api/todos/${t.id}`, { done: false }); break; }
        // Ticked: the check fills at once, then the row slides away and the task is done.
        t.finishing = true; chime('soft'); render();
        setTimeout(() => { delete t.finishing; t.done = true; t.doneAt = Date.now(); if (ui.taskOpen === t.id) ui.taskOpen = null; render(); }, 950);
        await api('PATCH', `/api/todos/${t.id}`, { done: true });
        break;
      }
      case 'task-open': ui.taskOpen = ui.taskOpen === el.dataset.id ? null : el.dataset.id; render(); break;
      case 'todo-star': {
        const t = D.todos.find((x) => x.id === el.dataset.id);
        t.star = !t.star; render();
        await api('PATCH', `/api/todos/${t.id}`, { star: t.star });
        break;
      }
      case 'todo-del':
        D.todos = D.todos.filter((x) => x.id !== el.dataset.id); render();
        await api('DELETE', `/api/todos/${el.dataset.id}`);
        break;
      case 'sugg-keep': {
        const t = D.todos.find((x) => x.id === el.dataset.id);
        t.suggested = false; chime('soft'); render();
        await api('PATCH', `/api/todos/${t.id}`, { suggested: false });
        break;
      }
      case 'sugg-dismiss':
        D.todos = D.todos.filter((x) => x.id !== el.dataset.id); render();
        await api('DELETE', `/api/todos/${el.dataset.id}`);
        break;
      case 'digest-run':
        await api('POST', '/api/digest');
        D.digestRunning = true; render();
        for (let i = 0; i < 30 && D.digestRunning; i++) { await new Promise((r) => setTimeout(r, 3000)); await load(); }
        break;
      case 'recap-run':
        await api('POST', '/api/recap');
        D.recapRunning = true; render();
        for (let i = 0; i < 30 && D.recapRunning; i++) { await new Promise((r) => setTimeout(r, 3000)); await load(); }
        break;
      case 'note-add':
        openKeyboard({ title: 'New note', value: '', options: [], onDone: async (text) => {
          if (!text.trim()) return;
          await fetch('/api/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
          await load(); setTimeout(load, 2500); setTimeout(load, 7000);
        } });
        break;
      case 'daynote-add':
        openKeyboard({ title: 'Note for today', value: '', options: [], onDone: async (text) => {
          if (!text.trim()) return;
          await api('POST', '/api/journal/daynote', { text });
          ui.jDays = null; await load();
        } });
        break;
      case 'j-tab': ui.jTab = el.dataset.tab; if (ui.jTab === 'past') ui.jDays = null; render(); break;
      case 'j-day': ui.jOpen = ui.jOpen === el.dataset.date ? null : el.dataset.date; render(); break;
      case 'j-chip': ui.jQuery = ui.jQuery.toLowerCase() === el.dataset.q.toLowerCase() ? '' : el.dataset.q; render(); break;
      case 'j-clear': ui.jQuery = ''; render(); break;
      case 'j-search':
        openKeyboard({ title: 'Search your journal', value: ui.jQuery, options: [], onDone: (text) => { ui.jQuery = text.trim(); render(); } });
        break;
      case 'ring-close': closeRing(); break;
      case 'ring-open': closeRing(); ui.jTab = 'today'; go('journal'); break;
      case 'ring-toggle': localStorage.setItem('ringNotes', ringOff() ? 'on' : 'off'); render(); break;
      case 'todo-clear': await api('POST', '/api/todos/clear-done'); load(); break;
      case 'task-filter': ui.taskFilter = el.dataset.f; render(); break;
      case 'mail-open': {
        const listed = D.mail.data.accounts.flatMap((a) => a.messages).find((x) => x.id === el.dataset.id);
        ui.drawer = 'mail';
        ui.reading = { id: el.dataset.id, summary: listed?.ai ? listed.summary : '', action: listed?.action || '' };
        showDrawer(); renderReader();
        try { ui.reading.message = await api('POST', '/api/mail/read', { id: el.dataset.id }); }
        catch (err) { ui.reading.error = err.message; }
        if (ui.drawer === 'mail' && !$('#drawer').hidden) renderReader();
        break;
      }
      case 'sched-day': ui.schedDay = Number(el.dataset.o); render(); break;
      case 'mail-todo': {
        el.disabled = true; el.innerHTML = 'Claude is reading it…';
        const t = await api('POST', '/api/mail/task', { id: el.dataset.id });
        $('#drawer').hidden = true;
        toast({ level: 'info', title: 'Added to To do', body: `${t.text}${t.subtasks?.length ? ` (${t.subtasks.length} steps)` : ''}` });
        await load();
        break;
      }
      case 'sub-toggle': case 'sub-del': case 'sub-add': case 'update-clear': {
        const t = D.todos.find((x) => x.id === el.dataset.id);
        if (act === 'update-clear') { delete t.updates; render(); await api('PATCH', `/api/todos/${t.id}`, { clearUpdates: true }); break; }
        if (act === 'sub-add') {
          openKeyboard({ title: `Add a step to “${t.text.slice(0, 40)}”`, value: '', options: [], onDone: async (text) => {
            if (!text.trim()) return;
            await api('PATCH', `/api/todos/${t.id}`, { subtasks: [...(t.subtasks || []), { text, done: false }] });
            load();
          } });
          break;
        }
        t.subtasks = act === 'sub-del' ? t.subtasks.filter((x) => x.id !== el.dataset.sid)
          : t.subtasks.map((x) => (x.id === el.dataset.sid ? { ...x, done: !x.done } : x));
        // Ticking the last step finishes the task: it plays out, then moves to Done.
        const allDone = act === 'sub-toggle' && !t.done && t.subtasks.length && t.subtasks.every((x) => x.done);
        if (allDone) { t.finishing = true; chime('done'); setTimeout(() => { delete t.finishing; t.done = true; t.doneAt = Date.now(); render(); }, 1100); }
        else if (act === 'sub-toggle' && t.subtasks.find((x) => x.id === el.dataset.sid)?.done) chime('soft');
        render();
        await api('PATCH', `/api/todos/${t.id}`, allDone ? { subtasks: t.subtasks, done: true } : { subtasks: t.subtasks });
        break;
      }
      case 'mode':
        D.mode = el.dataset.mode; syncMode(); renderBanner(); if (wsMode()) render();
        await api('POST', '/api/mode', { mode: el.dataset.mode });
        if (!KIOSK) toast({ level: 'info', title: el.dataset.mode === 'day' ? 'Desk display is awake' : 'Desk display is asleep' });
        if (el.dataset.mode === 'day') load();
        break;
      case 'event': if (!el.dataset.id) break; ui.eventId = el.dataset.id; openSheet('event'); break;
      case 'weather': openSheet('weather'); break;
      case 'alerts': openSheet('alerts'); break;
      case 'close-drawer': $('#drawer').hidden = true; break;
      case 'dismiss':
        D.alerts = D.alerts.filter((a) => a.id !== el.dataset.id); if (wsMode()) render(); else { renderDrawer(); renderRail(); }
        await api('POST', `/api/alerts/${encodeURIComponent(el.dataset.id)}/dismiss`);
        break;
      case 'set-toggle': patchSettings({ [el.dataset.k]: !D.settings[el.dataset.k] }); break;
      case 'set-step': {
        const k = el.dataset.k, d = Number(el.dataset.d) * SET_STEPS[k];
        let v = D.settings[k];
        if (typeof v === 'string') { // HH:MM
          const [h, m] = v.split(':').map(Number);
          const t = (h * 60 + m + d + 1440) % 1440;
          v = `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
        } else if (k === 'homeAfter') v = Math.max(0, Math.min(30, v + d)); // 0 = never
        else v = Math.max(1, Math.min(120, v + d));
        patchSettings({ [k]: v });
        break;
      }
      case 'refresh': await api('POST', '/api/refresh'); setTimeout(load, 3000); toast({ level: 'info', title: 'Refreshing…' }); break;
      case 'reload': location.reload(); break;
      case 'school-connect': {
        D.school = { ...D.school, pending: await api('POST', '/api/school/connect'), error: null };
        render();
        // Check back often while the code is waiting to be entered.
        const t = setInterval(async () => { await load(); if (!D.school?.pending) clearInterval(t); }, 4000);
        break;
      }
      case 'school-disconnect': await api('POST', '/api/school/disconnect'); await load(); break;
      case 'restart-pi':
        // Two taps, so a stray touch can't reboot the Pi.
        if (el.dataset.armed !== '1') {
          el.dataset.armed = '1'; el.textContent = 'Tap again to restart';
          setTimeout(() => { if (el.isConnected) { el.dataset.armed = ''; el.textContent = 'Restart'; } }, 4000);
          break;
        }
        await api('POST', '/api/restart');
        $('#login').hidden = false;
        $('#login').innerHTML = '<div class="login-card"><h1>Restarting the Pi…</h1><p class="muted">The hub will be back in about a minute.</p><div class="loadbar"><i></i></div></div>';
        // On a phone or laptop, come back on our own once the hub answers again.
        if (!KIOSK) { const t = setInterval(async () => { try { if ((await fetch('/api/dashboard')).status < 500) { clearInterval(t); location.reload(); } } catch {} }, 5000); }
        break;
      case 'wind-override': ui.windOverride = new Date().toDateString(); render(); break;
      case 'morning-done':
        D.morningDue = false; renderMorning();
        await api('POST', '/api/morning/seen');
        break;
      case 'logout': await api('POST', '/api/logout'); location.reload(); break;
    }
  } catch (err) {
    toast({ level: 'error', title: 'Something went wrong', body: err.message });
    load();
  }
});

// Long-press on a touchscreen opens the browser's context menu; never useful in a kiosk.
if (KIOSK) document.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-act="set-range"]');
  if (el) patchSettings({ [el.dataset.k]: Number(el.value) });
});
let jSearchTimer;
document.addEventListener('input', (e) => {
  const r = e.target.closest?.('[data-act="set-range"]');
  if (r) r.style.setProperty('--pct', `${((r.value - r.min) / (r.max - r.min)) * 100}%`);
  const q = e.target.closest?.('[data-jsearch]');
  if (q) { clearTimeout(jSearchTimer); jSearchTimer = setTimeout(() => { ui.jQuery = q.value.trim(); ui.jFocus = true; render(); }, 350); }
});
document.addEventListener('pointerdown', (e) => { if (!e.target.closest?.('[data-jsearch]')) ui.jFocus = false; }, true);

// ---------------------------------------------------------------------------
// Drag to scroll (desk screen). If the Pi hands touches to the browser as mouse
// input, a finger drag would do nothing; this makes any scrollable area follow
// the drag, with a little momentum, and swallows the tap that would otherwise
// fire when the finger lifts. Real touch input scrolls natively and is ignored
// here.
// ---------------------------------------------------------------------------

function enableDragScroll(doc, findScroller) {
  let drag = null, coast = 0;
  doc.addEventListener('pointerdown', (e) => {
    cancelAnimationFrame(coast);
    if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest?.('input, .kb, [data-noscroll]')) return;
    const sc = findScroller(e.target);
    if (sc) drag = { sc, y: e.clientY, top: sc.scrollTop, moved: false, lastY: e.clientY, lastT: performance.now(), v: 0 };
  }, true);
  doc.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dy) < 10) return;
    drag.moved = true;
    drag.sc.scrollTop = drag.top - dy;
    const now = performance.now();
    drag.v = (e.clientY - drag.lastY) / Math.max(1, now - drag.lastT);
    drag.lastY = e.clientY; drag.lastT = now;
    e.preventDefault();
  }, true);
  const end = () => {
    if (!drag) return;
    const { sc, moved } = drag;
    let v = performance.now() - drag.lastT < 80 ? drag.v : 0; // px per ms
    drag = null;
    if (!moved) return;
    // The drag was a scroll, not a tap.
    // Swallow the click that follows the release, but only that one: if none
    // comes, stop listening so the next real tap isn't eaten.
    const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    doc.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => doc.removeEventListener('click', swallow, { capture: true }), 350);
    const step = () => { sc.scrollTop -= v * 16; v *= 0.94; if (Math.abs(v) > 0.02) coast = requestAnimationFrame(step); };
    if (Math.abs(v) > 0.05) coast = requestAnimationFrame(step);
  };
  doc.addEventListener('pointerup', end, true);
  doc.addEventListener('pointercancel', end, true);
  // Dragging over an image or link would otherwise start a native drag and cut the scroll short.
  doc.addEventListener('dragstart', (e) => e.preventDefault(), true);
}

function scrollerOf(el) {
  for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 2) return n;
  }
  return null;
}
if (KIOSK) enableDragScroll(document, scrollerOf);

// The desk screen goes back to Home by itself once it's been left alone for a while
// (Settings → Display → Return to Home; 0 = never). Whatever was open is closed on
// the way. A running focus session and the keyboard are never interrupted.
let lastTouch = Date.now();
document.addEventListener('pointerdown', () => (lastTouch = Date.now()), true);
function idleHome() {
  const minutes = D?.settings.homeAfter ?? 3;
  if (!KIOSK || !D || !minutes || Date.now() - lastTouch < minutes * 60e3) return;
  if (!$('#keyboard').hidden || T.lock || (view === 'focus' && T.running)) return;
  const sheetOpen = !$('#drawer').hidden;
  // While Claude chats are working or waiting on you, the board is where the desk rests.
  const rest = D.settings.claudeBoard !== false && !winding() && claudeLive().length ? 'claude' : 'home';
  if (view === rest && !sheetOpen) return;
  $('#drawer').hidden = true;
  Object.assign(ui, { taskOpen: null, taskFilter: 'open', jTab: 'today', jQuery: '', jOpen: null });
  go(rest);
}
setInterval(idleHome, 10e3);


// Deep link: /#read=<email id> opens that email (handy from a notification or for testing).
// The address can carry a starting point: #view=payit, #read=<email id>,
// #open=weather, and #sky=<warm>,<day> (each 0..1) to pin the backdrop while
// trying looks out. Combine with &.
const WS = createWorkstation({
  get D() { return D; }, T, PHASES, SRC_ICON,
  api, load, render, toast, icon, esc, money, hm, ago, wx, dayStart, clock12, dueLabel, tagColor, emailDoc, barChart, ring, mountClocks, patchSettings, ringOff,
  realTodos, suggestedTodos, todoSort, fmtLeft, tLeft, tTotal, phaseMinutes, dialMax, dialPresets, dialSet, saveT, timerStart, timerReset,
});
document.addEventListener('keydown', (e) => { if (D && wsMode() && $('#login').hidden && $('#keyboard').hidden) WS.key(e); });
let wasWs = wsMode();
window.addEventListener('resize', () => { if (wsMode() !== wasWs) { wasWs = wsMode(); render(); } });

const hashArgs = new URLSearchParams(location.hash.slice(1));
if (hashArgs.has('sky')) { const [warm, day] = hashArgs.get('sky').split(',').map(Number); window.__sky = { warm: warm || 0, day: day || 0 }; }
load().then(() => {
  if (!D) return;
  if (VIEWS[hashArgs.get('view')]) go(hashArgs.get('view'));
  if (hashArgs.get('ws')) WS.go(hashArgs.get('ws'));
  if (['weather', 'alerts', 'pick'].includes(hashArgs.get('open'))) openSheet(hashArgs.get('open'));
  if (hashArgs.get('tab') === 'past') { ui.jTab = 'past'; render(); }
  if (hashArgs.has('read')) { go('mail'); document.querySelector(`.mail-row[data-id="${CSS.escape(hashArgs.get('read'))}"]`)?.click(); }
});
setInterval(load, 20e3);
// Midnight rollover and long-running kiosk hygiene: full reload once a day at 4am.
if (KIOSK) setInterval(() => { const d = new Date(); if (d.getHours() === 4 && d.getMinutes() === 0) location.reload(); }, 60e3);
