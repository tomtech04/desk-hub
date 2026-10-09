import { openKeyboard } from './keyboard.js';
import { mountClocks } from './stars.js';

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
const ui = { taskFilter: 'open', chartSel: {}, schedDay: 0, drawer: 'alerts', reading: null };

async function load() {
  try {
    D = await api('GET', '/api/dashboard');
    applySky();
    syncMode();
    handleAlerts();
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
    if (minutes >= 1) api('POST', '/api/focus', { minutes, label: T.label }).then(load).catch(() => {});
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
  if (!lockOn()) return timerStart();
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
  const color = isFocus ? 'var(--accent)' : 'var(--info)';
  const hold = (label) => `<button class="fl-exit" data-hold="lock-exit"><i></i><span>${label}</span></button>`;
  let html;
  if (lockCount > 0) {
    html = `<div class="fl-count"><div class="fl-kicker">Settle in</div><div class="fl-num" data-n="${lockCount}">${lockCount}</div>
      <div class="fl-label">${esc(T.label || `${phaseMinutes('focus')} minutes of focus`)}</div></div>${hold('Hold to cancel')}`;
  } else if (T.done) {
    const d = T.done;
    html = `<div class="fl-done ${d.wasFocus ? 'focus' : 'break'}">
        <div class="fl-burst">${icon('check')}</div>
        <h1>${d.wasFocus ? (d.skipped ? 'Session ended' : 'Session complete') : 'Break over'}</h1>
        <p>${d.wasFocus ? `${d.minutes} minute${d.minutes === 1 ? '' : 's'} of focus${T.label ? ` on ${esc(T.label)}` : ''} · ${D.focus.todayMinutes} min today` : 'Ready for the next one?'}</p>
        <div class="cycle">${[0, 1, 2, 3].map((i) => `<i class="${i < (T.cycle || (d.wasFocus ? 4 : 0)) ? 'on' : ''}"></i>`).join('')}</div>
        <div class="fl-actions">
          ${d.wasFocus ? `<button class="fpill solid wide" data-act="lock-break">${T.phase === 'long' ? 'Long break' : 'Break'} · ${phaseMinutes(T.phase)} min</button>`
                       : `<button class="fpill solid wide" data-act="lock-next">Focus · ${phaseMinutes('focus')} min</button>`}
          <button class="fpill" data-act="lock-leave">Done</button>
        </div></div>`;
  } else {
    const active = T.running || T.remaining != null;
    // The task being worked on, in full, with its steps to tick off along the way.
    const task = isFocus && T.label ? D.todos.find((t) => !t.done && t.text === T.label) : null;
    const subs = task?.subtasks || [];
    const left = subs.filter((x) => !x.done).length;
    const panel = task ? `<div class="fl-task ${task.finishing ? 'finishing' : ''}">
        <div class="fl-task-h"><b>${esc(task.text)}</b><span>${[task.tag, task.due ? `Due ${new Date(task.due).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}` : '', subs.length ? (left ? `${subs.length - left} of ${subs.length} steps done` : 'All steps done') : ''].filter(Boolean).map(esc).join(' · ')}</span></div>
        ${subs.length ? `<div class="fl-steps">${subs.map((x) => `<button class="sub ${x.done ? 'done' : ''}" data-act="sub-toggle" data-id="${task.id}" data-sid="${x.id}"><i class="check small ${x.done ? 'done' : ''}">${x.done ? icon('check') : ''}</i><span>${esc(x.text)}</span></button>`).join('')}</div>` : ''}
        <button class="fl-addstep" data-act="sub-add" data-id="${task.id}">${icon('plus')} Add a step</button>
      </div>` : '';
    html = `<div class="fl-top">${isFocus ? `Focus · session ${T.cycle + 1} of 4` : PHASES[T.phase]}</div>
      <div class="fl-ring ${T.running ? 'running' : 'paused'} ${isFocus ? 'focus' : 'break'} ${task ? 'compact' : ''}">
        ${ring(520, 3, active ? 1 - tLeft() / tTotal() : 0, '#f5f5f7')}
        <div class="fl-center"><div class="fl-time" data-timer>${fmtLeft(tLeft())}</div>
          <div class="fl-label">${T.running ? esc(task ? 'Stay with it' : T.label || (isFocus ? 'Stay with it' : 'Rest')) : 'Paused'}</div></div>
      </div>${panel}
      <div class="fl-controls">
        ${T.running ? `<button class="fpill" data-act="t-pause">Pause</button>` : `<button class="fpill solid" data-act="lock-resume">Resume</button>`}
        <button class="fpill" data-act="t-adj" data-min="5">+5 min</button>
        <button class="fpill" data-act="t-skip">${isFocus ? 'End' : 'Skip'}</button>
      </div>${hold('Hold to leave')}`;
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
  holdTimer = setTimeout(() => { b.classList.remove('holding'); if (b.dataset.hold === 'lock-exit') exitLock(); }, 1200);
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
  document.addEventListener(ev, () => { clearTimeout(holdTimer); document.querySelectorAll('.holding').forEach((b) => b.classList.remove('holding')); }, true);
}

function ring(size, stroke, frac, color) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${stroke}"/>
    <circle class="ring-fg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}" data-c="${c}"/></svg>`;
}

// Per-second tick: only touches the timer text/ring, never re-renders the page.
setInterval(() => {
  if (T.running && tLeft() <= 0) timerFinish();
  const left = tLeft(), frac = 1 - left / tTotal();
  document.querySelectorAll('[data-timer]').forEach((el) => (el.textContent = fmtLeft(left)));
  document.querySelectorAll('.ring-fg, [data-follow]').forEach((el) => el.setAttribute('stroke-dashoffset', el.dataset.c * (1 - (T.running || T.remaining != null ? frac : 0))));
  if (view === 'home') { const el = $('#clock-time'); if (el) el.innerHTML = clockHtml(); }
  if (D?.mode && D.mode !== 'day') renderSleep();
  renderBanner();
}, 1000);

// ---------------------------------------------------------------------------
// Charts: single-series bars, tap a bar to read it (no hover on a touchscreen)
// ---------------------------------------------------------------------------

const charts = {};

/** Returns a placeholder; drawCharts() fills it in at the slot's real pixel width. */
function bars(id, values, labels, fmt, { height = 150, cls = '', capLabel = (i) => labels[i] } = {}) {
  charts[id] = { values, labels, fmt, height, cls, capLabel };
  return `<div class="chart-slot" data-chart="${id}" style="height:${height + 22}px"></div>`;
}

function drawCharts() {
  document.querySelectorAll('[data-chart]').forEach((slot) => {
    const { values, labels, fmt, height, cls, capLabel } = charts[slot.dataset.chart];
    const w = slot.clientWidth, top = 8, bottom = 22, n = values.length;
    const max = Math.max(1, ...values);
    const slotW = w / n, gap = Math.min(10, slotW * 0.2), bw = Math.max(4, slotW - gap);
    const sel = ui.chartSel[slot.dataset.chart] ?? values.findLastIndex((v) => v > 0);
    const labelEvery = Math.max(1, Math.ceil(28 / slotW), n > 12 ? 6 : 1);
    let g = '';
    values.forEach((v, i) => {
      const x = i * slotW + gap / 2, h = v > 0 ? Math.max(4, ((height - top - bottom) * v) / max) : 0, y = height - bottom - h;
      const r = Math.min(4, bw / 2);
      // Rounded top, square base anchored on the baseline.
      if (h) g += `<path class="bar ${i === sel || sel < 0 ? '' : 'dim'}" d="M${x},${height - bottom} V${y + r} q0,-${r} ${r},-${r} h${bw - 2 * r} q${r},0 ${r},${r} V${height - bottom} z"/>`;
      if (i % labelEvery === 0 || i === sel) g += `<text x="${x + bw / 2}" y="${height - 6}" text-anchor="middle" class="${i === sel ? 'sel' : ''}">${esc(labels[i])}</text>`;
      g += `<rect class="hit" data-act="chart" data-id="${slot.dataset.chart}" data-i="${i}" x="${i * slotW}" y="0" width="${slotW}" height="${height}"/>`;
    });
    const cap = sel >= 0 ? `${esc(capLabel(sel))} · <b>${esc(fmt(values[sel]))}</b>` : '<span class="muted">No data yet</span>';
    slot.innerHTML = `<div class="chart-cap">${cap}</div>
      <svg class="chart ${cls}" width="${w}" height="${height}" viewBox="0 0 ${w} ${height}">
        <line class="base" x1="0" x2="${w}" y1="${height - bottom + 0.5}" y2="${height - bottom + 0.5}"/>${g}</svg>`;
  });
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function notConfigured(what, hint) {
  return `<div class="empty">${esc(what)} isn't set up yet.<br><span style="font-size:14px">${esc(hint)}</span></div>`;
}

// The widget beside the clock: conditions now, and the next 12 hours as a
// chart. Rain chance when rain is on the way, otherwise the temperature curve.
// `tap: false` draws it as a plain panel (the morning brief is one big button already).
function weatherWidget(w, { tap = true } = {}) {
  if (!w) return '<div class="wxw"><div class="wxw-cap">Weather loading…</div></div>';
  const [label, ic] = wx(w.code);
  const hours = (w.hours || []).slice(0, 12);
  const hr = (s) => { const h = new Date(s).getHours(); return `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`; };
  const W = 300, H = 84;
  const ticks = hours.length ? `<div class="wxw-x"><span>Now</span><span>${hr(hours[Math.floor(hours.length / 2)].time)}</span><span>${hr(hours.at(-1).time)}</span></div>` : '';
  let cap = '', chart = '';
  const wet = hours.filter((h) => h.rain >= 30);
  if (wet.length) {
    // Bars of rain chance per hour; the likeliest hour is named in the caption.
    const peak = hours.reduce((a, h) => (h.rain > a.rain ? h : a), hours[0]);
    const slot = W / hours.length, bw = slot - 5;
    cap = `Rain · ${peak.rain}% around ${hr(peak.time)}`;
    chart = `<svg class="wxw-chart rain" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${hours.map((h, i) => {
      const bh = Math.max(3, (h.rain / 100) * (H - 6));
      return `<rect x="${(i * slot + 2.5).toFixed(1)}" y="${(H - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" class="${h.rain >= 50 ? 'hi' : h.rain >= 30 ? 'mid' : ''}"/>`; }).join('')}</svg>`;
  } else if (hours.length > 1) {
    // Temperature as a line with the high and low of the stretch marked.
    const temps = hours.map((h) => h.temp), lo = Math.min(...temps), hi = Math.max(...temps), span = Math.max(1, hi - lo);
    const x = (i) => (i / (hours.length - 1)) * W, y = (t) => 30 + (1 - (t - lo) / span) * (H - 36);
    const pts = hours.map((h, i) => `${x(i).toFixed(1)},${y(h.temp).toFixed(1)}`);
    const iHi = temps.indexOf(hi), iLo = temps.lastIndexOf(lo);
    const mark = (i, t, cls) => `<span class="wxw-mark ${cls}" style="left:${Math.min(91, Math.max(9, (x(i) / W) * 100)).toFixed(1)}%;top:${((y(t) / H) * 100).toFixed(1)}%">${t}°</span>`;
    cap = `Temperature · ${lo}° to ${hi}° ahead`;
    chart = `<div class="wxw-plot"><svg class="wxw-chart temp" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <defs><linearGradient id="wxfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
        <polygon points="0,${H} ${pts.join(' ')} ${W},${H}" fill="url(#wxfill)"/>
        <polyline points="${pts.join(' ')}" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      </svg>${hi !== lo ? mark(iHi, hi, 'hi') + mark(iLo, lo, 'lo') : ''}</div>`;
  }
  return `<${tap ? 'button class="wxw" data-act="weather"' : 'div class="wxw"'}>
    <div class="wxw-top">${icon(ic)}<b>${w.temp}°</b><span>${esc(label)}<br>H ${w.hi}° · L ${w.lo}°</span></div>
    <div class="wxw-cap">${esc(cap)}</div>${chart.startsWith('<div') ? chart : `<div class="wxw-plot">${chart}</div>`}${ticks}
  </${tap ? 'button' : 'div'}>`;
}

function clockHtml() {
  const d = new Date();
  const h = d.getHours() % 12 || 12;
  return `${h}:${pad(d.getMinutes())}<small>${d.getHours() < 12 ? 'AM' : 'PM'}</small>`;
}

const realTodos = () => D.todos.filter((t) => !t.suggested);
const suggestedTodos = () => D.todos.filter((t) => t.suggested);

function todoSort(a, b) {
  return (a.done - b.done) || (b.star - a.star) || ((a.due ?? Infinity) - (b.due ?? Infinity)) || (a.createdAt - b.createdAt);
}

function dueHtml(t) {
  if (!t.due) return '';
  if (t.due < dayStart()) return '<span class="when overdue">Overdue</span>';
  if (t.due < dayStart(1)) return '<span class="when due-today">Today</span>';
  if (t.due < dayStart(2)) return '<span class="when">Tomorrow</span>';
  return `<span class="when">${new Date(t.due).toLocaleDateString('en-US', { weekday: 'short' })}</span>`;
}

function todoRow(t, full = false) {
  const subs = t.subtasks || [];
  const left = subs.filter((x) => !x.done).length;
  const progress = subs.length ? `<span class="steps ${left ? '' : 'all'}">${subs.length - left}/${subs.length}</span>` : '';
  const row = `<div class="item ${t.done ? 'done' : ''} ${t.finishing && !full ? 'finishing' : ''}">
    <button class="check ${t.done || t.finishing ? 'done' : ''}" data-act="todo-toggle" data-id="${t.id}">${t.done || t.finishing ? icon('check') : ''}</button>
    <div class="t"><b class="wrap">${esc(t.text)}</b>${full && t.source?.why ? `<span>${esc(t.source.why)}</span>` : ''}</div>
    ${progress}
    ${t.tag ? `<span class="tag">${esc(t.tag)}</span>` : ''}
    ${dueHtml(t)}
    ${full ? `<button class="icon-btn ${t.star ? 'on' : ''}" data-act="todo-star" data-id="${t.id}">${icon('star')}</button>
              <button class="icon-btn" data-act="todo-del" data-id="${t.id}">${icon('trash')}</button>` : ''}
  </div>`;
  if (!full) return row;
  // The full list shows the steps under each task, plus any change that came in by email.
  return `<div class="task ${t.done ? 'done' : ''} ${t.finishing ? 'finishing' : ''}">${row}
    ${(t.updates || []).map((u) => `<div class="task-update">${icon('mail')}<span>${esc(u.note)}${u.from ? ` <i>· ${esc(u.from.replace(/\s*<.*>/, ''))}</i>` : ''}</span><button class="icon-btn" data-act="update-clear" data-id="${t.id}" aria-label="Dismiss">${icon('x')}</button></div>`).join('')}
    ${subs.length || !t.done ? `<div class="subs">
      ${subs.map((x) => `<div class="sub ${x.done ? 'done' : ''}"><button class="check small ${x.done ? 'done' : ''}" data-act="sub-toggle" data-id="${t.id}" data-sid="${x.id}">${x.done ? icon('check') : ''}</button><span>${esc(x.text)}</span>
        <button class="icon-btn small" data-act="sub-del" data-id="${t.id}" data-sid="${x.id}" aria-label="Remove step">${icon('x')}</button></div>`).join('')}
      ${t.done ? '' : `<button class="add-step" data-act="sub-add" data-id="${t.id}">${icon('plus')} Add a step</button>`}
    </div>` : ''}
  </div>`;
}

function eventRow(e) {
  const soon = !e.allDay && e.start - Date.now() < 60 * 60e3 && e.start > Date.now();
  const now = !e.allDay && e.start <= Date.now() && e.end > Date.now();
  const when = e.allDay ? 'All day' : now ? 'Now' : e.start < dayStart(1) ? hm(e.start) : `${new Date(e.start).toLocaleDateString('en-US', { weekday: 'short' })} ${hm(e.start)}`;
  return `<div class="item tap" data-act="event" data-id="${esc(e.id || '')}"><span class="cal-bar"></span>
    <div class="t"><b>${esc(e.title)}</b><span>${esc([e.calendar, e.location].filter(Boolean).join(' · '))}</span></div>
    <span class="when ${soon || now ? 'soon' : ''}">${esc(when)}</span></div>`;
}

// ---------------------------------------------------------------------------
// The focus dial: a ring you drag to set the session length, like winding a
// kitchen timer. One turn is 90 minutes for focus, 30 for a break.
// ---------------------------------------------------------------------------

const dialMax = (phase) => (phase === 'focus' ? 90 : 30);
const dialPresets = (phase) => (phase === 'focus' ? [15, 25, 45, 60, 90] : [3, 5, 10, 15, 20]);
const DIAL = { c: 300, r: 250 };
const polar = (r, frac) => { const a = frac * 2 * Math.PI - Math.PI / 2; return [DIAL.c + r * Math.cos(a), DIAL.c + r * Math.sin(a)]; };

/** minutes = null draws the running state (an arc that fills with elapsed time, no handle). */
function dialSvg(minutes, max, elapsedFrac) {
  const circ = 2 * Math.PI * DIAL.r;
  const frac = minutes == null ? elapsedFrac : minutes / max;
  // Twelve quiet marks, like a watch face; nothing else on the ring.
  let marks = '';
  for (let i = 0; i < 12; i++) {
    const [x1, y1] = polar(DIAL.r + 16, i / 12), [x2, y2] = polar(DIAL.r + (i % 3 === 0 ? 28 : 23), i / 12);
    marks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }
  const [kx, ky] = polar(DIAL.r, frac);
  return `<svg viewBox="0 0 600 600" class="dial-svg">
    <g class="dial-marks">${marks}</g>
    <circle cx="300" cy="300" r="${DIAL.r}" class="dial-track"/>
    <g transform="rotate(-90 300 300)">
      <circle cx="300" cy="300" r="${DIAL.r}" class="dial-arc ${minutes == null ? 'ring-fg' : ''}" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - frac)}" data-c="${circ}"/>
    </g>
    ${minutes == null ? '' : `<g class="dial-knob" transform="translate(${kx.toFixed(1)} ${ky.toFixed(1)})"><circle r="30" class="k-hit"/><circle r="11" class="k-body"/></g>`}
  </svg>`;
}

/** Set the dial to `m` minutes without re-rendering the page (called many times a second while dragging). */
function dialShow(m) {
  const d = $('[data-dial]');
  if (!d) return;
  const max = dialMax(T.phase), frac = m / max, circ = 2 * Math.PI * DIAL.r;
  d.querySelectorAll('.dial-arc').forEach((el) => el.setAttribute('stroke-dashoffset', circ * (1 - frac)));
  const [x, y] = polar(DIAL.r, frac);
  d.querySelector('.dial-knob')?.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
  const num = d.querySelector('[data-dial-num]'); if (num) num.textContent = m;
  const ends = d.querySelector('[data-dial-ends]'); if (ends) ends.textContent = `Ends ${hm(Date.now() + m * 60e3)}`;
  document.querySelectorAll('.f3-presets button').forEach((b) => b.classList.toggle('on', Number(b.dataset.min) === m));
}

function dialSet(m) {
  T.custom = { ...(T.custom || {}), [T.phase]: m };
  T.remaining = null; T.total = null;
  saveT();
}

// Dragging the ring. Works with a finger, a mouse, or the Pi's touch-as-mouse.
let dialDrag = null;
document.addEventListener('pointerdown', (e) => {
  const d = e.target.closest?.('[data-dial].idle');
  if (!d || e.target.closest('button')) return;
  const box = d.getBoundingClientRect();
  const dx = e.clientX - (box.left + box.width / 2), dy = e.clientY - (box.top + box.height / 2);
  const dist = Math.hypot(dx, dy) / (box.width / 2);
  if (dist < 0.62 || dist > 1.08) return; // only the ring itself, not the face
  dialDrag = { box, value: phaseMinutes(T.phase) };
  d.classList.add('dragging');
  d.setPointerCapture?.(e.pointerId);
  dialMove(e);
  e.preventDefault();
});
function dialMove(e) {
  if (!dialDrag) return;
  const { box } = dialDrag, max = dialMax(T.phase), snap = max === 90 ? 5 : 1, min = max === 90 ? 5 : 1;
  let frac = Math.atan2(e.clientX - (box.left + box.width / 2), -(e.clientY - (box.top + box.height / 2))) / (2 * Math.PI);
  if (frac < 0) frac += 1;
  let m = Math.round((frac * max) / snap) * snap;
  // Don't jump across the top: crossing 12 o'clock stops at the nearest end.
  if (Math.abs(m - dialDrag.value) > max / 2) m = dialDrag.value > max / 2 ? max : min;
  m = Math.min(max, Math.max(min, m));
  if (m !== dialDrag.value) { dialDrag.value = m; dialShow(m); }
}
document.addEventListener('pointermove', dialMove);
for (const ev of ['pointerup', 'pointercancel']) {
  document.addEventListener(ev, () => {
    if (!dialDrag) return;
    dialSet(dialDrag.value);
    dialDrag = null;
    $('[data-dial]')?.classList.remove('dragging');
  });
}

const VIEWS = {
  home() {
    const w = D.weather?.data;
    const [wxLabel, wxIcon] = w ? wx(w.code) : ['', 'sun'];
    const rainH = w?.nextRain ? new Date(w.nextRain.time).getHours() : 0;
    const rain = w?.nextRain ? ` · rain ~${rainH % 12 || 12}${rainH < 12 ? 'am' : 'pm'}` : '';
    const events = (D.calendar?.data?.events || []).filter((e) => e.allDay ? e.start >= dayStart() : e.end >= Date.now() || e.start >= Date.now()).slice(0, 4);
    const todos = realTodos().filter((t) => !t.done).sort(todoSort).slice(0, 5);
    const toReview = suggestedTodos().length;
    const doneToday = D.todos.filter((t) => t.done && t.doneAt >= dayStart()).length;
    const p = D.payit?.data;
    const delta = p && p.yesterdaySameTimeCents ? Math.round(((p.today.grossCents - p.yesterdaySameTimeCents) / p.yesterdaySameTimeCents) * 100) : null;
    const sysBad = (p?.systems || []).filter((s) => s.status !== 'up');
    const accounts = D.mail?.data?.accounts || [];
    const digest = D.digest?.headline ? D.digest : null;
    const hasTimer = T.running || T.remaining != null;

    return `<div class="home">
      <section class="hero a-clock tap" data-act="weather">
        <i class="hero-ring"></i><i class="hero-ring two"></i>
        <div class="hero-top">
          <div class="hero-clock">
            <div class="dotclock" data-dotclock="day" role="img" aria-label="${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}"></div>
            <div class="hero-date"><span class="ampm">${new Date().getHours() < 12 ? 'AM' : 'PM'}</span>${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          </div>
          ${w ? `<div class="hero-wx">
            <div class="hero-temp">${icon(wxIcon)}<b>${w.temp}°</b></div>
            <div class="hero-cond">${esc(wxLabel)}</div>
            <div class="hero-hl mono">H ${w.hi}° · L ${w.lo}°${w.rainChance >= 20 ? ` · ${w.rainChance}% rain` : ''}</div>
          </div>` : ''}
        </div>
        ${w?.hours?.length ? `<div class="hero-hours">${w.hours.slice(1, 7).map((h) => { const hr = new Date(h.time).getHours(); return `<div><span class="mono">${hr % 12 || 12}${hr < 12 ? 'a' : 'p'}</span><b>${h.temp}°</b>${h.rain >= 30 ? `<i>${h.rain}%</i>` : ''}</div>`; }).join('')}</div>` : ''}
      </section>

      <section class="card a-focus tap" data-act="go" data-view="focus">
        <div class="card-h">${icon('focus')}<span class="grow">Focus</span><span class="link">${D.focus.todayMinutes} min today</span></div>
        <div class="mini-focus">
          <div class="ring">${ring(120, 10, hasTimer ? 1 - tLeft() / tTotal() : 0, T.phase === 'focus' ? 'var(--accent)' : 'var(--info)')}<span data-timer>${fmtLeft(tLeft())}</span></div>
          <div class="btns">
            ${T.running
              ? `<button class="btn" data-act="t-pause">${icon('pause')} Pause</button>`
              : `<button class="btn primary" data-act="t-start">${icon('play')} ${hasTimer ? 'Resume' : `Start ${PHASES[T.phase].toLowerCase()}`}</button>`}
            <button class="btn ghost small" data-act="go" data-view="focus">${esc(T.label || 'Open timer')}</button>
          </div>
        </div>
      </section>

      <section class="card a-payit tap" data-act="go" data-view="payit">
        <div class="card-h">${icon('payit')}<span class="grow">PayIt today</span>
          ${sysBad.length ? `<span class="status ${sysBad.some((s) => s.status === 'down') ? 'down' : 'degraded'}">${icon('warnI')} ${sysBad.length} issue${sysBad.length > 1 ? 's' : ''}</span>`
            : p ? `<span class="status up">${icon('check')} All up</span>` : ''}</div>
        ${p ? `<div class="big-num money">${money(p.today.grossCents)}</div>
          ${delta !== null ? `<div class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}% vs. this time yesterday</div>` : '<div class="delta muted">—</div>'}
          <div class="kv ${p.profit ? 'four' : ''}"><div><b>${p.today.count}</b><span>sales</span></div><div><b>${money(p.today.avgTicketCents, true)}</b><span>avg ticket</span></div><div><b>${p.today.declined}</b><span>declined</span></div>${p.profit ? `<div class="profit"><b>${money(p.profit.todayCents, true)}</b><span>platform profit</span></div>` : ''}</div>`
          : D.payit?.configured === false ? notConfigured('PayIt', 'Add SUPABASE_URL + key to .env') : `<div class="empty">${esc(D.payit?.error || 'Loading…')}</div>`}
      </section>

      <section class="card a-next tap" data-act="go" data-view="schedule">
        <div class="card-h">${icon('schedule')}<span class="grow">Up next</span></div>
        <div class="list">${events.length ? events.map(eventRow).join('') : D.calendar?.configured === false ? notConfigured('Calendar', 'Add CALENDAR_FEEDS (Canvas / Google ICS links) to .env') : '<div class="empty">Nothing in the next few days.</div>'}</div>
      </section>

      <section class="card a-tasks tap" data-act="go" data-view="tasks">
        <div class="card-h">${icon('tasks')}<span class="grow">To do</span>${toReview ? `<button class="chip review-chip" data-act="go" data-view="tasks">${toReview} to review</button>` : `<span class="link">${doneToday ? `${doneToday} done today` : ''}</span>`}</div>
        <div class="list">${todos.length ? todos.map((t) => todoRow(t)).join('') : '<div class="empty">All clear. Nice.</div>'}</div>
        <button class="btn small ghost" style="margin-top:auto" data-act="todo-add">${icon('plus')} Add task</button>
      </section>

      <section class="card a-mail tap" data-act="go" data-view="mail">
        <div class="card-h">${icon('mail')}<span class="grow">Mail digest</span>${digest ? `<span class="link">${hm(digest.at)}</span>` : ''}</div>
        ${accounts.length ? `
          <div class="home-digest">${digest
            ? `<b>${esc(digest.headline)}</b>${digest.highlights.length ? `<ul>${digest.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}`
            : `<div class="empty">${D.digestRunning ? 'Claude is writing today\'s digest…' : D.aiEnabled ? `Today's digest arrives at ${esc(D.settings.digestAt)}.` : 'Add ANTHROPIC_API_KEY for a daily digest.'}</div>`}</div>
          <div class="row mail-counts">${accounts.map((a) => `<span class="mail-acct"><b>${esc(a.name)}</b>&nbsp;<span class="pill">${a.unread}</span></span>`).join('')}</div>`
          : D.mail?.configured === false ? notConfigured('Mail', 'Add MAIL_1_USER / MAIL_1_PASS to .env') : `<div class="empty">${esc(D.mail?.error || 'Loading…')}</div>`}
      </section>
    </div>`;
  },

  focus() {
    const active = T.running || T.remaining != null;
    const isFocus = T.phase === 'focus';
    const mins = phaseMinutes(T.phase);
    const open = realTodos().filter((t) => !t.done).sort(todoSort).slice(0, 3);
    const sessions = D.focus.today || [];
    const dayFrom = dayStart() + 6 * 3600e3, daySpan = 18 * 3600e3;
    const pos = (ms) => Math.min(100, Math.max(0, ((ms - dayFrom) / daySpan) * 100));

    return `<div class="f3">
      <header class="f3-head">
        <nav class="f3-tabs">${Object.entries(PHASES).map(([k, v]) => `<button class="${T.phase === k ? 'on' : ''}" data-act="t-phase" data-phase="${k}">${v}</button>`).join('')}</nav>
        <div class="f3-cycle" aria-label="Session ${T.cycle + 1} of 4">${[0, 1, 2, 3].map((i) => `<i class="${i < T.cycle ? 'done' : i === T.cycle && isFocus ? 'now' : ''}"></i>`).join('')}</div>
      </header>

      <div class="f3-stage">
        <div class="dial ${active ? 'active' : 'idle'}" data-dial data-noscroll>
          ${dialSvg(active ? null : mins, dialMax(T.phase), active ? 1 - tLeft() / tTotal() : 0)}
          <div class="dial-center">
            ${active
              ? `<div class="dial-time" data-timer>${fmtLeft(tLeft())}</div>
                 <div class="dial-sub">${T.running ? `Ends ${hm(T.endsAt)}` : 'Paused'}</div>`
              : `<div class="dial-num"><span data-dial-num>${mins}</span></div>
                 <div class="dial-sub"><span class="unit">minutes</span><span data-dial-ends>Ends ${hm(Date.now() + mins * 60e3)}</span></div>`}
          </div>
        </div>
        ${active
          ? `<div class="f3-actions">${T.running ? `<button class="fpill" data-act="t-pause">Pause</button>` : `<button class="fpill solid" data-act="t-start">Resume</button>`}<button class="fpill" data-act="t-reset">Reset</button></div>`
          : `<div class="f3-presets">${dialPresets(T.phase).map((m) => `<button class="${m === mins ? 'on' : ''}" data-act="t-set" data-min="${m}">${m}</button>`).join('')}</div>
             <div class="f3-actions"><button class="fpill solid wide" data-act="t-start">${isFocus ? 'Begin' : 'Start break'}</button></div>`}
      </div>

      <section class="f3-list">
        <h3>Working on</h3>
        <button class="f3-row ${!T.label ? 'on' : ''}" data-act="t-label" data-label=""><span>Nothing in particular</span><i></i></button>
        ${open.map((t) => { const subs = t.subtasks || [], left = subs.filter((x) => !x.done).length;
          return `<button class="f3-row ${T.label === t.text ? 'on' : ''}" data-act="t-label" data-label="${esc(t.text)}"><span>${esc(t.text)}</span>
            <em>${esc(subs.length ? `${subs.length - left} of ${subs.length}` : t.due && t.due < dayStart(1) ? 'Today' : t.tag || '')}</em><i></i></button>`; }).join('')}
      </section>

      <footer class="f3-day">
        <div class="f3-line"><span><b>${D.focus.todayMinutes}</b> min today</span><span><b>${D.focus.todaySessions}</b> session${D.focus.todaySessions === 1 ? '' : 's'}</span><span><b>${D.focus.week.reduce((a, d) => a + d.minutes, 0)}</b> min this week</span></div>
        <div class="f3-strip">${sessions.map((f) => `<i style="left:${pos(f.at - f.minutes * 60e3)}%;width:${Math.max(0.8, (f.minutes * 60e3 / daySpan) * 100)}%"></i>`).join('')}<b style="left:${pos(Date.now())}%"></b></div>
      </footer>
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
    return `<div class="page-h"><h1>To do</h1>
        ${f === 'done' && list.length ? `<button class="btn small ghost" data-act="todo-clear">Clear done</button>` : ''}
        <button class="btn primary" data-act="todo-add">${icon('plus')} Add</button></div>
      <div class="tasks-page">
      ${review.length ? `<section class="card review">
        <div class="card-h">${icon('mail')}<span class="grow">Suggested from email</span><span class="link">Keep the ones that are real</span></div>
        <div class="list">${review.map((t) => `<div class="item">
          <div class="t"><b class="wrap">${esc(t.text)}</b><span>${esc(t.source?.why || [t.source?.from, t.source?.subject].filter(Boolean).join(' · '))}${t.subtasks?.length ? ` · ${t.subtasks.length} steps` : ''}</span></div>
          ${t.tag ? `<span class="tag">${esc(t.tag)}</span>` : ''}${dueHtml(t)}
          <button class="btn small primary" data-act="sugg-keep" data-id="${t.id}">${icon('check')} Keep</button>
          <button class="icon-btn" data-act="sugg-dismiss" data-id="${t.id}" aria-label="Dismiss">${icon('x')}</button>
        </div>`).join('')}</div>
      </section>` : ''}
      <div class="chips">${filters.map(([k, v]) => `<button class="chip ${f === k ? 'on' : ''}" data-act="task-filter" data-f="${esc(k)}">${esc(v)}</button>`).join('')}</div>
      <section class="card tasks"><div class="list">${list.length ? list.map((t) => todoRow(t, true)).join('') : '<div class="empty">Nothing here.</div>'}</div></section>
      </div>`;
  },

  payit() {
    const s = D.payit;
    if (!s?.data) return `<div class="page-h"><h1>PayIt</h1></div><section class="card">${s?.configured === false ? notConfigured('PayIt', 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env on the Pi.') : `<div class="empty">${esc(s?.error || 'Loading…')}</div>`}</section>`;
    const p = s.data, t = p.today;
    const delta = p.yesterdaySameTimeCents ? Math.round(((t.grossCents - p.yesterdaySameTimeCents) / p.yesterdaySameTimeCents) * 100) : null;
    const nowH = new Date().getHours();
    const hours = p.hourly.slice(0, nowH + 1);
    const hourLabel = (h) => `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;
    const weekTotal = p.week.reduce((a, d) => a + d.cents, 0);
    const providers = Object.entries(t.byProvider).sort((a, b) => b[1] - a[1]);
    const provName = { stripe: 'Card (Stripe)', cash: 'Cash', ath_movil: 'ATH Móvil' };
    return `<div class="page-h"><h1>PayIt</h1><span class="muted">Updated ${s.updatedAt ? hm(s.updatedAt) : '—'}</span></div>
      <div class="payit">
        <section class="card">
          <div class="card-h">Gross volume today</div>
          <div class="row" style="align-items:baseline;gap:14px"><div class="big-num money" style="font-size:60px">${money(t.grossCents)}</div>
            ${delta !== null ? `<span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}% vs. ${money(p.yesterdaySameTimeCents)} yesterday by now</span>` : ''}</div>
          ${p.profit ? `<div class="kept">Platform kept <b>${money(p.profit.todayCents, true)}</b> today${p.profit.cardVolumeCents ? ` · ${((p.profit.todayCents / p.profit.cardVolumeCents) * 100).toFixed(2)}% of card volume` : ''} · <b>${money(p.profit.weekCents, true)}</b> this week</div>`
            : p.profitError ? `<div class="kept" style="color:var(--warn)">Platform profit unavailable: ${esc(p.profitError)}</div>`
            : '<div class="kept muted">Platform profit needs a restricted Stripe key (see .env.example)</div>'}
          <div class="tiles" style="margin-top:14px">
            <div class="tile"><b>${t.count}</b><span>sales</span></div>
            <div class="tile"><b>${money(t.avgTicketCents, true)}</b><span>avg ticket</span></div>
            <div class="tile"><b>${t.activeMerchants}</b><span>active merchants</span></div>
            <div class="tile"><b style="color:${t.declined >= 3 ? 'var(--warn)' : 'inherit'}">${t.declined}</b><span>declined · ${t.refunded} refunded</span></div>
          </div>
        </section>
        <section class="card">
          <div class="card-h">Systems</div>
          <div class="list">${p.systems.length ? p.systems.map((x) => `<div class="item"><div class="t"><b style="text-transform:capitalize">${esc(x.system.replace(/_/g, ' '))}</b>${x.detail ? `<span>${esc(x.detail)}</span>` : `<span>checked ${ago(x.checked_at)} ago</span>`}</div>
            <span class="status ${esc(x.status)}">${icon(x.status === 'up' ? 'check' : x.status === 'down' ? 'downI' : 'warnI')} ${esc(x.status)}</span></div>`).join('')
            : '<div class="empty">No checks in the last 3 hours — is the hourly-system-check cron running?</div>'}</div>
          <div class="row" style="margin-top:auto;gap:18px;padding-top:8px">
            <span class="muted">New businesses today <b style="color:var(--text)">${t.newBusinesses}</b></span></div>
        </section>
        <section class="card">
          <div class="card-h">By hour</div>
          ${bars('hourly', hours, hours.map((_, h) => hourLabel(h)), (v) => money(v), { height: 190, capLabel: (h) => `${hourLabel(h)}–${hourLabel((h + 1) % 24)}` })}
        </section>
        <section class="card">
          <div class="card-h"><span class="grow">Last 7 days</span><span class="link">${money(weekTotal)} total</span></div>
          ${bars('week', p.week.map((d) => d.cents), p.week.map((d) => new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' })), (v) => money(v), { height: 150, capLabel: (i) => `${new Date(p.week[i].date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}${p.week[i].profitCents != null ? ` · kept ${money(p.week[i].profitCents, true)}` : ''}` })}
          <div class="row" style="gap:18px;margin-top:10px;flex-wrap:wrap">${providers.map(([k, v]) => `<span class="muted">${esc(provName[k] || k)} <b style="color:var(--text)">${money(v)}</b></span>`).join('') || '<span class="muted">No sales yet today</span>'}</div>
        </section>
      </div>`;
  },

  mail() {
    const s = D.mail;
    if (!s?.data) return `<div class="page-h"><h1>Mail</h1></div><section class="card">${s?.configured === false ? notConfigured('Mail', 'Add one MAIL_n_* block per account to .env (see README).') : `<div class="empty">${esc(s?.error || 'Loading…')}</div>`}</section>`;
    return `<div class="page-h"><h1>Mail</h1><span class="muted">${s.data.aiEnabled ? 'Summaries by Claude · ' : ''}updated ${s.updatedAt ? hm(s.updatedAt) : '—'}</span>
        <button class="btn small ghost" data-act="refresh">Refresh</button></div>
      <div class="mail-page">${digestCard()}
      <div class="mailview">${s.data.accounts.map((a) => `<section class="card">
        <div class="card-h"><span class="grow">${esc(a.name)}</span><span class="pill">${a.unread} unread</span></div>
        ${a.needsSignIn ? `<div class="empty">Not signed in yet.<br><button class="btn small primary" style="margin-top:10px" data-act="go" data-view="settings">Connect in Settings</button></div>` : a.error ? `<div class="empty" style="color:var(--warn)">${esc(a.error)}</div>` : ''}
        <div class="list">${a.messages.map((m) => `<div class="msg tap ${m.priority === 'low' ? 'low' : ''}" data-act="mail-open" data-id="${esc(m.id)}">
          <div class="top">${m.priority === 'urgent' ? '<span class="prio"><span class="dot" style="background:var(--bad)"></span>Urgent</span>' : ''}<b>${esc(m.from)}</b><span class="muted">${ago(m.date)}</span></div>
          <p>${esc(m.summary)}</p>
          ${m.action ? `<div class="act">${icon('arrow')} ${esc(m.action)}</div>` : ''}
        </div>`).join('') || (a.needsSignIn ? '' : '<div class="empty">No unread mail from the last few days.</div>')}</div>
      </section>`).join('')}</div></div>`;
  },

  journal() {
    const r = D.recap;
    const today = D.journal.filter((j) => j.at >= dayStart());
    const earlier = D.journal.filter((j) => j.at < dayStart());
    let recap;
    if (D.recapRunning) recap = '<div class="empty">Claude is writing up your day…</div>';
    else if (r?.headline) {
      recap = `<div class="head">${esc(r.headline)}</div>
        ${r.bullets.length ? `<ul>${r.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
        ${r.tomorrow.length ? `<div class="tomorrow"><b>Tomorrow</b><ul>${r.tomorrow.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div>` : ''}
        <div class="foot"><span class="grow">${hm(r.at)}</span><button class="btn small ghost" data-act="recap-run">Redo</button></div>`;
    } else if (!D.aiEnabled) recap = '<div class="empty">Add ANTHROPIC_API_KEY to the Pi\'s .env to get a recap of your day.</div>';
    else if (r?.error) recap = `<div class="empty" style="color:var(--warn)">${esc(r.error)}</div><div class="foot"><span class="grow"></span><button class="btn small ghost" data-act="recap-run">Try again</button></div>`;
    else recap = `<div class="foot" style="margin:0"><span class="grow">Your recap arrives at ${esc(D.settings.recapAt)}, from your notes, tasks and focus time.</span><button class="btn small ghost" data-act="recap-run">Make it now</button></div>`;
    const row = (j) => `<div class="msg">
      <div class="top"><b>${esc(j.note || j.text)}</b><span class="muted">${j.kind === 'reflection' ? 'Reflection · ' : ''}${hm(j.at)}</span></div>
      ${j.note && j.note !== j.text ? `<p class="said">“${esc(j.text)}”</p>` : ''}
      ${j.pending ? '<div class="act">Working out what you meant…</div>' : `${(j.completed || []).map((t) => `<div class="act done">${icon('check')} Done: ${esc(t)}</div>`).join('')}${j.tasks.map((t) => `<div class="act">${icon('plus')} ${esc(t)}</div>`).join('')}`}
    </div>`;
    return `<div class="page-h"><h1>Journal</h1><button class="btn primary" data-act="note-add">${icon('plus')} Note</button></div>
      <div class="mail-page">
        <section class="card digest"><div class="card-h">${icon('journal')}<span class="grow">Today's recap</span></div>${recap}</section>
        <section class="card" style="flex:1;min-height:0"><div class="card-h"><span class="grow">Voice notes</span><span class="link">${D.voiceReady ? 'Ring token set' : 'Ring not set up yet'}</span></div>
          <div class="list journal-list">${today.length || earlier.length ? `${today.map(row).join('')}${earlier.length ? `<h3 class="daysep">Yesterday</h3>${earlier.map(row).join('')}` : ''}`
            : '<div class="empty">Nothing yet. Speak into the ring, or tap Note to type one. Say what you need to do and it lands in To do.</div>'}</div>
        </section>
      </div>`;
  },

  schedule() {
    const cal = D.calendar;
    if (cal?.configured === false) return `<div class="page-h"><h1>Schedule</h1></div><section class="card">${notConfigured('Calendar', 'Add CALENDAR_FEEDS to .env (your Google Calendar secret iCal address).')}</section>`;
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
    const busyMin = timed.reduce((m, e) => m + Math.max(0, Math.min(e.end, to) - Math.max(e.start, from)) / 60e3, 0);
    if (busyMin >= 60) bits.push(`${(busyMin / 60).toFixed(busyMin % 60 ? 1 : 0)} h booked`);
    const w = sel === 0 ? D.weather?.data : null;

    // Timeline: hours down the side, events placed by time, overlaps side by side.
    const hourOf = (ms) => (ms - from) / 3600e3;
    const startH = Math.max(0, Math.min(8, Math.floor(Math.min(...timed.map((e) => hourOf(e.start)), 8))));
    const endH = Math.min(24, Math.max(18, Math.ceil(Math.max(...timed.map((e) => hourOf(e.end)), 18))));
    const span = endH - startH;
    const pct = (h) => ((Math.min(endH, Math.max(startH, h)) - startH) / span) * 100;
    const cols = [];
    const placed = timed.map((e) => {
      let c = cols.findIndex((end) => end <= e.start);
      if (c === -1) { c = cols.length; cols.push(0); }
      cols[c] = Math.max(e.end, e.start + 30 * 60e3);
      return { e, c };
    });
    const hours = Array.from({ length: span + 1 }, (_, i) => startH + i);
    const hourLabel = (h) => `${h % 12 || 12} ${h < 12 || h === 24 ? 'AM' : 'PM'}`;
    const nowH = hourOf(Date.now());
    const timeline = `<div class="tl">
      ${hours.map((h) => `<div class="tl-hour" style="top:${pct(h)}%"><span>${hourLabel(h)}</span></div>`).join('')}
      ${sel === 0 && nowH >= startH && nowH <= endH ? `<div class="tl-now" style="top:${pct(nowH)}%"></div>` : ''}
      <div class="tl-events">${placed.map(({ e, c }) => {
        const top = pct(hourOf(e.start)), h = Math.max(pct(hourOf(e.end)) - top, 0);
        const past = e.end < Date.now();
        return `<div class="tl-ev tap ${past ? 'past' : ''}" data-act="event" data-id="${esc(e.id || '')}" style="top:min(${top}%, calc(100% - 46px));height:${h}%;left:${(c / cols.length) * 100}%;width:${100 / cols.length}%">
          <b>${esc(e.title)}</b><span>${hm(e.start)}${e.end > e.start ? `–${hm(e.end)}` : ''}${e.location ? ` · ${esc(e.location)}` : ''}</span></div>`;
      }).join('')}</div>
      ${timed.length ? '' : '<div class="tl-empty">Nothing on the calendar</div>'}
    </div>`;

    const strip = Array.from({ length: 7 }, (_, o) => {
      const d = new Date(dayStart(o)), n = onDay(o).length;
      return `<button class="day ${o === sel ? 'on' : ''}" data-act="sched-day" data-o="${o}">
        <span>${o === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })}</span><b>${d.getDate()}</b>
        <i>${'<u></u>'.repeat(Math.min(n, 4))}</i></button>`;
    }).join('');

    return `<div class="page-h"><h1>Schedule</h1>${cal?.error ? `<span class="muted" style="color:var(--warn)">${esc(cal.error)}</span>` : ''}</div>
      <div class="sched-page">
        <section class="card daysum">
          <div class="daysum-date">${sel === 0 ? 'Today' : sel === 1 ? 'Tomorrow' : date.toLocaleDateString('en-US', { weekday: 'long' })}<span>${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</span></div>
          <div class="daysum-line">${esc(bits.join(' · '))}${w ? ` · ${w.temp}° now, high ${w.hi}°${w.rainChance >= 40 ? `, ${w.rainChance}% rain` : ''}` : ''}</div>
          ${allDay.length ? `<div class="chips" style="margin-top:10px">${allDay.map((e) => `<span class="chip allday">${esc(e.title)}</span>`).join('')}</div>` : ''}
          ${tasks.length ? `<div class="list" style="margin-top:8px">${tasks.slice(0, 3).map((t) => todoRow(t)).join('')}</div>${tasks.length > 3 ? `<div class="muted" style="margin-top:6px">+${tasks.length - 3} more in To do</div>` : ''}` : ''}
        </section>
        <section class="card tl-card">${timeline}</section>
        <div class="weekstrip">${strip}</div>
      </div>`;
  },

  settings() {
    const st = D.settings;
    const step = (key, val, unit = '') => `<div class="stepper"><button data-act="set-step" data-k="${key}" data-d="-1">−</button><b>${esc(val)}${unit}</b><button data-act="set-step" data-k="${key}" data-d="1">+</button></div>`;
    const sys = D.system;
    const row = (label, hint, control) => `<div class="set-row"><label>${label}${hint ? `<span>${hint}</span>` : ''}</label><div class="set-ctl">${control}</div></div>`;
    const toggle = (k) => `<button class="toggle ${st[k] ? 'on' : ''}" data-act="set-toggle" data-k="${k}" aria-pressed="${Boolean(st[k])}"></button>`;
    const range = (k, min, max) => `<input type="range" min="${min}" max="${max}" value="${st[k]}" data-act="set-range" data-k="${k}">`;
    const group = (title, rows) => `<section class="card"><div class="card-h">${title}</div>${rows.join('')}</section>`;
    return `<div class="page-h"><h1>Settings</h1>
        <button class="btn" data-act="mode" data-mode="sleep">${icon('moon')} Sleep now</button>
</div>
      <div class="settings">
        ${group('Display', [
          row('Text size', `Bigger text for reading from your chair · ${st.textSize || 115}%`, `<input type="range" min="100" max="140" step="5" value="${st.textSize || 115}" data-act="set-range" data-k="textSize">`),
          row('Brightness', D.hasBacklight ? 'Desk screen backlight' : 'No backlight here; this controls the desk screen', range('dayBrightness', 10, 100)),
          row('Sleep brightness', 'How dim the bedside clock gets', range('sleepBrightness', 0, 30)),
          row('Sounds', '', toggle('chime')),
        ])}
        ${group('Evening and morning', [
          row('Wind down', 'Desk screen dims and puts mail and PayIt away', toggle('windDown')),
          row('Wind down starts', '', step('windDownAt', st.windDownAt)),
          row('Automatic sleep mode', '', toggle('autoSleep')),
          row('Sleep at', '', step('sleepAt', st.sleepAt)),
          row('Wake at', '', step('wakeAt', st.wakeAt)),
          row('Morning brief', 'Sunrise screen with your day, until you tap it', toggle('morningBrief')),
        ])}
        ${group('Mail and Claude', [
          row('Email digest at', "Claude's summary of the last 24 hours", step('digestAt', st.digestAt)),
          row('Day recap at', 'From your notes, tasks and focus time', step('recapAt', st.recapAt)),
          row('Tasks from email', 'Checked hourly; you approve new ones', toggle('emailTasks')),
          schoolRow(row),
        ])}
        ${group('Focus timer', [
          row('Focus length', '', step('focusMinutes', st.focusMinutes, 'm')),
          row('Short break', '', step('shortBreak', st.shortBreak, 'm')),
          row('Long break', '', step('longBreak', st.longBreak, 'm')),
          row('Focus lock', 'A focus session takes over the screen until you hold to leave', toggle('focusLock')),
        ])}
        ${group('This hub', [
          row(esc(sys.host), `${sys.tempC != null ? `${sys.tempC.toFixed(0)}°C · ` : ''}load ${sys.load.toFixed(2)} · memory ${sys.memUsedPct}% · up ${sys.uptimeH}h`, ''),
          row('Data', 'Reload mail, PayIt, calendar and weather now', '<button class="btn small ghost" data-act="refresh">Refresh</button>'),
          row('This screen', 'Reload the page', '<button class="btn small ghost" data-act="reload">Reload</button>'),
          row('Restart the Pi', D.canRestart ? 'Reboots the whole device; back in about a minute' : 'Not allowed yet: run scripts/allow-restart.sh on the Pi once', `<button class="btn small ghost danger" data-act="restart-pi" ${D.canRestart ? '' : 'disabled'}>Restart</button>`),
          D.signedIn ? row('Signed in on this device', '', '<button class="btn small ghost" data-act="logout">Sign out</button>') : '',
        ])}
      </div>`;
  },
};

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

// Microsoft 365 (school) mail: sign in with a code on another device.
function schoolRow(row) {
  const sc = D.school;
  if (!sc?.configured) return '';
  if (sc.pending) return `<div class="code-box"><div>On your phone or laptop, open <b>${esc(sc.pending.uri.replace(/^https?:\/\//, ''))}</b> and enter</div>
    <div class="code">${esc(sc.pending.code)}</div><div class="muted">then sign in with your school account. This screen updates by itself.</div></div>`;
  if (sc.connected) return row('School mail', 'Signed in with Microsoft (read-only)', '<button class="btn small ghost" data-act="school-disconnect">Disconnect</button>');
  return row('School mail', sc.error ? `<span style="color:var(--warn)">${esc(sc.error)}</span>` : 'Sign in with Microsoft using a short code', '<button class="btn small primary" data-act="school-connect">Connect</button>');
}

function digestCard() {
  const d = D.digest;
  let body;
  if (D.digestRunning) body = '<div class="empty">Claude is reading the last 24 hours of mail…</div>';
  else if (d?.headline) {
    body = `<div class="head">${esc(d.headline)}</div>
      ${d.highlights.length ? `<ul>${d.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
      <div class="foot"><span class="grow">${hm(d.at)} · ${d.emailCount} emails${d.taskCount ? ` · ${d.taskCount} task${d.taskCount > 1 ? 's' : ''} suggested` : ''}${d.errors?.length ? ` · ${esc(d.errors.join('; '))}` : ''}</span>
        <button class="btn small ghost" data-act="digest-run">Redo</button></div>`;
  } else if (!D.aiEnabled) body = '<div class="empty">Add ANTHROPIC_API_KEY to the Pi\'s .env to get a daily summary from Claude.</div>';
  else if (d?.error) body = `<div class="empty" style="color:var(--warn)">${esc(d.error)}</div><div class="foot"><span class="grow"></span><button class="btn small ghost" data-act="digest-run">Try again</button></div>`;
  else body = `<div class="foot" style="margin:0"><span class="grow">Today's digest arrives at ${esc(D.settings.digestAt)}.</span><button class="btn small ghost" data-act="digest-run">Make it now</button></div>`;
  return `<section class="card digest"><div class="card-h">${icon('mail')}<span class="grow">Today's digest</span></div>${body}</section>`;
}

function windHome() {
  const tomorrowEvents = (D.calendar?.data?.events || []).filter((e) => e.start >= dayStart(1) && e.start < dayStart(2)).slice(0, 3);
  const open = realTodos().filter((t) => !t.done).sort(todoSort);
  const tomorrowTasks = open.filter((t) => t.due && t.due >= dayStart(1) && t.due < dayStart(2));
  const left = open.filter((t) => !t.due || t.due < dayStart(1)).slice(0, 4);
  const r = D.recap?.headline ? D.recap : null;
  const doneToday = D.todos.filter((t) => t.done && t.doneAt >= dayStart()).length;
  const w = D.weather?.data;
  const tw = w?.tomorrow;
  // How far through wind-down we are, from its start to sleep time.
  const toMin = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const span = (toMin(D.settings.sleepAt) - toMin(D.settings.windDownAt) + 1440) % 1440 || 1;
  const into = (nowMin - toMin(D.settings.windDownAt) + 1440) % 1440;
  const windDone = Math.min(1, into / span), minsLeft = Math.max(0, span - into);
  const lightsOut = new Date(2000, 0, 1, ...D.settings.sleepAt.split(':').map(Number)).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  // What was said tonight, newest first (D.journal already is).
  const tonight = (D.journal || []).filter((j) => j.evening && j.at > Date.now() - 12 * 3600e3).slice(0, 6);
  return `<div class="wind">
    <section class="card clock wind-hero">
      <div class="wind-top mono"><span>Wind down</span><span>Lights out ${esc(lightsOut)}</span></div>
      <div class="dotclock" data-dotclock="wind" role="img" aria-label="${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}"></div>
      <div class="wind-bar"><i style="width:${(windDone * 100).toFixed(1)}%"></i></div>
      <div class="wind-left mono">${minsLeft > 0 ? `${minsLeft >= 60 ? `${Math.floor(minsLeft / 60)} h ` : ''}${minsLeft % 60} min left` : 'Time for bed'}</div>
      <div class="date">${doneToday ? `${doneToday} thing${doneToday > 1 ? 's' : ''} done today` : 'The day is done'}${D.focus.todayMinutes ? ` · ${D.focus.todayMinutes} min of focus` : ''}</div>
    </section>
    <section class="card">
      <div class="card-h">${icon('schedule')}<span class="grow">Tomorrow</span>${tw ? `<span class="wind-wx">${icon(wx(tw.code)[1])}${tw.hi}° / ${tw.lo}°${w.tomorrowRain >= 30 ? ` · ${w.tomorrowRain}% rain` : ''}</span>` : ''}</div>
      <div class="list">${tomorrowEvents.map(eventRow).join('')}${tomorrowTasks.map((t) => todoRow(t)).join('')
        || (tomorrowEvents.length ? '' : '<div class="empty">Nothing scheduled for tomorrow yet.</div>')}</div>
    </section>
    <section class="card tap" data-act="go" data-view="journal">
      <div class="card-h">${icon('journal')}<span class="grow">Before you sleep</span></div>
      ${tonight.length ? `<div class="night-list">${tonight.map((j) => j.pending
            ? `<div class="night pending"><i>Listening</i><p>Claude is reading what you said…</p></div>`
            : `<div class="night ${j.kind === 'reflection' ? 'refl' : ''}"><i>${j.kind === 'reflection' ? 'Reflection' : j.note ? 'For tomorrow' : 'Sorted'} · ${hm(j.at)}</i><p>${esc(j.note || [j.tasks?.length && `Added ${j.tasks.length} task${j.tasks.length > 1 ? 's' : ''}`, j.completed?.length && `marked ${j.completed.length} done`].filter(Boolean).join(', ') || j.text)}</p></div>`).join('')}</div>`
        : r ? `<div class="home-digest"><b>${esc(r.headline)}</b>${r.bullets.length ? `<ul>${r.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}</div>`
          : ''}
      <div class="night-hint">${icon('journal')}<span>${tonight.length ? 'Press the ring to add more.' : 'Press the ring and say what\'s on your mind. Claude keeps it as a reflection on today or a note for tomorrow.'}</span></div>
      <button class="night-type" data-act="note-add">or type it</button>
    </section>
    <section class="card tap" data-act="go" data-view="tasks">
      <div class="card-h">${icon('tasks')}<span class="grow">Still open</span></div>
      <div class="list">${left.length ? left.map((t) => todoRow(t)).join('') : '<div class="empty">Nothing left open. Nice.</div>'}</div>
      <button class="btn small ghost" style="margin-top:auto" data-act="todo-add">${icon('plus')} Add for tomorrow</button>
    </section>
    <div class="wind-foot"><button class="btn" data-act="mode" data-mode="sleep">${icon('moon')} Sleep now</button>
      <button class="btn ghost" data-act="wind-override">Show everything</button></div>
  </div>`;
}

// The morning brief: a sunrise over the day ahead, on the desk screen from wake
// time until it's tapped away.
function renderMorning() {
  const el = $('#morning');
  const show = KIOSK && D.morningDue && D.mode === 'day';
  if (!show) { el.hidden = true; el.dataset.html = ''; return; }
  const h = new Date().getHours();
  const w = D.weather?.data;
  const open = realTodos().filter((t) => !t.done).sort(todoSort);
  const today = open.filter((t) => t.due && t.due >= dayStart() && t.due < dayStart(1));
  const carried = open.filter((t) => t.due && t.due < dayStart());
  const events = (D.calendar?.data?.events || []).filter((e) => e.start < dayStart(1)).slice(0, 4);
  const missed = (D.mail?.data?.accounts || []).flatMap((a) => a.messages)
    .filter((m) => Date.parse(m.date) < dayStart() && (m.priority === 'urgent' || m.action))
    .sort((a, b) => (a.priority === 'urgent' ? 0 : 1) - (b.priority === 'urgent' ? 0 : 1)).slice(0, 3);
  const line = (t, sub) => `<li><b>${esc(t)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</li>`;
  const block = (title, items) => items.length ? `<div class="m-block"><h3>${title}</h3><ul>${items.join('')}</ul></div>` : '';
  const html = `<div class="sky"><div class="sun"><i></i></div><div class="hills"></div></div>
    <div class="m-body">
      <h1>${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}</h1>
      <p class="m-date">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      ${w ? weatherWidget(w, { tap: false }) : ''}
      ${D.digest?.headline ? `<p class="m-digest">${esc(D.digest.headline)}</p>` : ''}
      <div class="m-grid">
        ${block('On your calendar', events.map((e) => line(e.title, e.allDay ? 'All day' : hm(e.start))))}
        ${block('To do today', today.slice(0, 5).map((t) => line(t.text, t.tag)))}
        ${block('Left from yesterday', carried.slice(0, 4).map((t) => line(t.text, 'Overdue')))}
        ${block('Email you haven\'t dealt with', missed.map((m) => line(m.action || m.summary, m.from)))}
        ${!events.length && !today.length && !carried.length && !missed.length ? '<div class="m-block"><h3>A clear day</h3><ul><li><b>Nothing scheduled, nothing overdue.</b></li></ul></div>' : ''}
      </div>
      <button class="btn m-go" data-act="morning-done">Start the day</button>
    </div>`;
  if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
  el.hidden = false;
}

// Wind-down (desk screen only): work is put away for the night.
const WIND_VIEWS = ['home', 'tasks', 'journal', 'settings'];
const winding = () => KIOSK && D?.phase === 'winddown' && ui.windOverride !== new Date().toDateString();

const NAV = [['home', 'Home'], ['focus', 'Focus'], ['tasks', 'To do'], ['payit', 'PayIt'], ['mail', 'Mail'], ['journal', 'Journal'], ['schedule', 'Schedule'], ['settings', 'Settings']];

function renderRail() {
  const urgentMail = (D?.mail?.data?.accounts || []).flatMap((a) => a.messages).filter((m) => m.priority === 'urgent').length;
  const openToday = (D?.todos || []).filter((t) => !t.done && !t.suggested && t.due && t.due < dayStart(1)).length;
  const badge = { mail: urgentMail, tasks: openToday + (D ? suggestedTodos().length : 0) };
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

function render() {
  if (!D) return;
  document.documentElement.classList.toggle('winddown', winding());
  document.documentElement.dataset.view = view;
  document.documentElement.style.setProperty('--ts', (D.settings.textSize || 115) / 100);
  if (winding() && !WIND_VIEWS.includes(view)) view = 'home';
  renderRail();
  renderStatus();
  $('#view').innerHTML = winding() && view === 'home' ? windHome() : VIEWS[view]();
  mountClocks();
  renderMorning();
  renderLock();
  drawCharts();
  if (!$('#drawer').hidden) renderDrawer();
}

// The day's weather: now, the next hours, sun times, and tomorrow.
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
  const fact = (ic, main, sub) => `<div class="ev-fact">${icon(ic)}<div><b>${esc(main)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div></div>`;
  $('#drawer').innerHTML = `<div class="panel sheet event" data-stop>
    <div class="page-h"><h1>${esc(e.title)}</h1><button class="btn small" data-act="close-drawer">Close</button></div>
    <div class="ev-facts">
      ${fact('schedule', day, [time, rel, e.repeats ? 'Repeats' : ''].filter(Boolean).join(' · '))}
      ${e.location ? fact('pin', e.location) : ''}
      ${e.link ? fact('link', /zoom|meet\.google|teams\.|webex/i.test(e.link) ? 'Video call' : 'Link', e.link.replace(/^https?:\/\//, '')) : ''}
      ${fact('tasks', e.calendar, e.organizer ? (e.organizedByMe ? 'You organized this' : `Organized by ${e.organizer}`) : '')}
    </div>
    ${e.myReply ? `<div class="ev-reply ${e.myReply}"><span>Your reply</span><b>${REPLY[e.myReply]}</b></div>` : ''}
    ${e.description ? `<div class="ev-desc">${esc(e.description)}</div>` : ''}
    ${e.guests?.length ? `<h3 class="wx-h">Guests · ${e.guestCount}</h3><div class="ev-guests">${e.guests.map((g) => `<div class="${g.reply}"><i></i><b>${esc(g.name)}</b><span>${REPLY[g.reply]}</span></div>`).join('')}</div>` : ''}
  </div>`;
}

function renderWeather() {
  const w = D.weather?.data;
  if (!w) { $('#drawer').hidden = true; return; }
  const [label, ic] = wx(w.code);
  const t = (s) => new Date(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const hr = (s) => { const h = new Date(s).getHours(); return `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`; };
  const temps = (w.hours || []).slice(0, 12).map((h) => h.temp), lo = Math.min(...temps), hi = Math.max(...temps);
  const [tLabel, tIcon] = wx(w.tomorrow.code);
  $('#drawer').innerHTML = `<div class="panel sheet weather" data-stop>
    <div class="page-h"><h1>Weather</h1><button class="btn small" data-act="close-drawer">Close</button></div>
    <div class="wx-now">${icon(ic)}<div class="wx-temp">${w.temp}°</div>
      <div class="wx-desc"><b>${esc(label)}</b><span>Feels like ${w.feels}° · High ${w.hi}° · Low ${w.lo}°</span></div></div>
    <div class="wx-facts">
      <div><span>Rain today</span><b>${w.rainChance ?? 0}%</b></div>
      <div><span>Wind</span><b>${w.wind ?? '–'} ${esc(w.windUnit || '')}</b></div>
      <div><span>Humidity</span><b>${w.humidity ?? '–'}%</b></div>
      <div><span>Sunrise</span><b>${w.sunrise ? t(w.sunrise) : '–'}</b></div>
      <div><span>Sunset</span><b>${w.sunset ? t(w.sunset) : '–'}</b></div>
    </div>
    ${w.nextRain ? `<div class="wx-note">${icon('rain')} Rain likely around ${hr(w.nextRain.time)} (${w.nextRain.chance}%)</div>` : ''}
    <h3 class="wx-h">Next hours</h3>
    <div class="wx-hours">${(w.hours || []).slice(0, 12).map((h, i) => `<div class="wx-hour">
        <span>${i === 0 ? 'Now' : hr(h.time)}</span>${icon(wx(h.code)[1])}
        <i style="--p:${hi > lo ? ((h.temp - lo) / (hi - lo)).toFixed(2) : 0.5}"></i>
        <b>${h.temp}°</b><em class="${h.rain >= 30 ? 'wet' : ''}">${h.rain >= 10 ? `${h.rain}%` : ''}</em></div>`).join('')}</div>
    <div class="wx-tomorrow">${icon(tIcon)}<div><b>Tomorrow</b><span>${esc(tLabel)} · High ${w.tomorrow.hi}° · Low ${w.tomorrow.lo}°${w.tomorrowRain >= 20 ? ` · ${w.tomorrowRain}% rain` : ''}</span></div></div>
  </div>`;
}

function renderDrawer() {
  if (ui.drawer === 'mail') return renderReader();
  if (ui.drawer === 'weather') return renderWeather();
  if (ui.drawer === 'event') return renderEvent();
  const alerts = D.alerts;
  $('#drawer').innerHTML = `<div class="panel" data-stop>
    <div class="page-h"><h1>Alerts</h1><button class="btn small ghost" data-act="close-drawer">Close</button></div>
    ${alerts.length ? alerts.map((a) => `<div class="alert ${esc(a.level)}"><div class="t"><small>${esc(a.source)}</small><b>${esc(a.title)}</b>${a.body ? `<p>${esc(a.body)}</p>` : ''}</div>
      <button class="icon-btn" data-act="dismiss" data-id="${esc(a.id)}">${icon('x')}</button></div>`).join('') : '<div class="empty">Nothing needs your attention.</div>'}
  </div>`;
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

// Reading one email in full. The text is fetched from the mailbox on demand.
function renderReader() {
  const r = ui.reading;
  const m = r?.message;
  $('#drawer').innerHTML = `<div class="panel reader" data-stop>
    <div class="page-h"><h1>${esc(m?.account || 'Mail')}</h1>
      ${m ? `<button class="btn small ghost" data-act="mail-todo" data-id="${esc(m.id)}">${icon('plus')} Make it a task</button>` : ''}
      <button class="btn small" data-act="close-drawer">Close</button></div>
    ${r?.error ? `<div class="empty" style="color:var(--warn)">${esc(r.error)}</div>`
      : !m ? '<div class="loading"><div class="loadbar"><i></i></div><span>Fetching it from your mailbox…</span></div>'
      : `<h2 class="r-subject">${esc(m.subject)}</h2>
         <div class="r-meta"><b>${esc(m.from)}</b>${m.fromAddress ? ` <span>&lt;${esc(m.fromAddress)}&gt;</span>` : ''}<br>
           <span>${m.date ? new Date(m.date).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}${m.to?.length ? ` · to ${esc(m.to.join(', '))}` : ''}</span></div>
         ${r.summary ? `<div class="r-summary">${esc(r.summary)}${r.action ? `<div class="act">${icon('arrow')} ${esc(r.action)}</div>` : ''}</div>` : ''}
         ${m.html ? `<iframe class="r-frame" title="Email" sandbox="${KIOSK ? 'allow-same-origin' : 'allow-popups allow-popups-to-escape-sandbox'}" referrerpolicy="no-referrer" srcdoc="${esc(emailDoc(m.html))}"></iframe>`
           : `<div class="r-body">${esc(m.text)}</div>${m.truncated ? '<div class="muted" style="margin-top:10px">This email is very long; the rest is cut off here.</div>' : ''}`}
         ${m.attachments?.length ? `<div class="r-attach">Attachments: ${m.attachments.map(esc).join(', ')}</div>` : ''}`}
  </div>`;
  // Scripts stay off in the frame; same-origin only lets the hub attach drag-scrolling to it.
  const frame = $('#drawer .r-frame');
  if (frame && KIOSK) frame.addEventListener('load', () => { try { enableDragScroll(frame.contentDocument, () => frame.contentDocument.scrollingElement); } catch {} });
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
  return evs.length ? `First up tomorrow: ${esc(evs[0].title)} at ${hm(evs[0].start)}` : `Wakes at ${esc(wake)}`;
}

function renderSleep() {
  const el = $('#sleep');
  el.hidden = !KIOSK || D.mode === 'day'; // a phone shouldn't go dark because the desk did
  if (el.hidden) return;
  el.classList.toggle('sim', !D.hasBacklight);
  const d = new Date();
  const html = `<div class="time">${d.getHours() % 12 || 12}:${pad(d.getMinutes())}</div>
    <div class="next">${nextMorningLine()}</div>
    <div class="actions"><button class="btn" data-act="mode" data-mode="day">Wake up</button></div>`;
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
// Alerts -> toasts
// ---------------------------------------------------------------------------

let seenAlerts = null;
function handleAlerts() {
  const ids = new Set(D.alerts.map((a) => a.id));
  if (seenAlerts) {
    const fresh = D.alerts.filter((a) => !seenAlerts.has(a.id));
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
  el.className = `toast ${a.level}`;
  el.innerHTML = `<div><b>${esc(a.title)}</b>${a.body ? `<p>${esc(a.body)}</p>` : ''}</div>`;
  el.addEventListener('pointerdown', () => el.remove());
  $('#toasts').prepend(el);
  setTimeout(() => el.remove(), 9000);
}

// ---------------------------------------------------------------------------
// Interactions (one delegated handler)
// ---------------------------------------------------------------------------

function go(v) { view = v; ui.chartSel = {}; if (v === 'schedule') ui.schedDay = 0; applySky(); render(); }

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

const SET_STEPS = { windDownAt: 15, recapAt: 15, digestAt: 15, sleepAt: 15, wakeAt: 15, focusMinutes: 5, shortBreak: 1, longBreak: 5 };

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
      case 'chart': ui.chartSel[el.dataset.id] = Number(el.dataset.i); render(); break;
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
      case 't-set': dialSet(Number(el.dataset.min)); dialShow(Number(el.dataset.min)); break;
      case 't-label': T.label = el.dataset.label; saveT(); render(); break;
      case 'todo-add': addTask(); break;
      case 'todo-toggle': {
        const t = D.todos.find((x) => x.id === el.dataset.id);
        t.done = !t.done; t.doneAt = t.done ? Date.now() : null;
        if (t.done) chime('soft');
        render();
        await api('PATCH', `/api/todos/${t.id}`, { done: t.done });
        break;
      }
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
      case 'todo-clear': await api('POST', '/api/todos/clear-done'); load(); break;
      case 'task-filter': ui.taskFilter = el.dataset.f; render(); break;
      case 'mail-open': {
        const listed = D.mail.data.accounts.flatMap((a) => a.messages).find((x) => x.id === el.dataset.id);
        ui.drawer = 'mail';
        ui.reading = { id: el.dataset.id, summary: listed?.ai ? listed.summary : '', action: listed?.action || '' };
        $('#drawer').hidden = false; renderReader();
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
        D.mode = el.dataset.mode; syncMode(); renderBanner();
        await api('POST', '/api/mode', { mode: el.dataset.mode });
        if (!KIOSK) toast({ level: 'info', title: el.dataset.mode === 'day' ? 'Desk display is awake' : 'Desk display is asleep' });
        if (el.dataset.mode === 'day') load();
        break;
      case 'event': if (!el.dataset.id) break; ui.drawer = 'event'; ui.eventId = el.dataset.id; $('#drawer').hidden = false; renderEvent(); break;
      case 'weather': ui.drawer = 'weather'; $('#drawer').hidden = false; renderWeather(); break;
      case 'alerts': ui.drawer = 'alerts'; $('#drawer').hidden = false; renderDrawer(); break;
      case 'close-drawer': $('#drawer').hidden = true; break;
      case 'dismiss':
        D.alerts = D.alerts.filter((a) => a.id !== el.dataset.id); renderDrawer(); renderRail();
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
        } else v = Math.max(1, Math.min(120, v + d));
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

// Drift back to Home after a few idle minutes (unless the timer screen is up and running).
let lastTouch = Date.now();
document.addEventListener('pointerdown', () => (lastTouch = Date.now()), true);
setInterval(() => {
  if (KIOSK && view !== 'home' && Date.now() - lastTouch > 3 * 60e3 && !(view === 'focus' && T.running) && $('#keyboard').hidden) go('home');
}, 15e3);

window.addEventListener('resize', () => drawCharts());

// Deep link: /#read=<email id> opens that email (handy from a notification or for testing).
// The address can carry a starting point: #view=payit, #read=<email id>,
// #open=weather, and #sky=<warm>,<day> (each 0..1) to pin the backdrop while
// trying looks out. Combine with &.
const hashArgs = new URLSearchParams(location.hash.slice(1));
if (hashArgs.has('sky')) { const [warm, day] = hashArgs.get('sky').split(',').map(Number); window.__sky = { warm: warm || 0, day: day || 0 }; }
load().then(() => {
  if (!D) return;
  if (VIEWS[hashArgs.get('view')]) go(hashArgs.get('view'));
  if (hashArgs.get('open') === 'weather') { ui.drawer = 'weather'; $('#drawer').hidden = false; renderWeather(); }
  if (hashArgs.has('read')) { go('mail'); document.querySelector(`.msg[data-id="${CSS.escape(hashArgs.get('read'))}"]`)?.click(); }
});
setInterval(load, 20e3);
// Midnight rollover and long-running kiosk hygiene: full reload once a day at 4am.
if (KIOSK) setInterval(() => { const d = new Date(); if (d.getHours() === 4 && d.getMinutes() === 0) location.reload(); }, 60e3);
