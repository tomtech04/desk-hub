import { openKeyboard } from './keyboard.js';

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

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  focus: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
  tasks: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="m8 12 3 3 5-6"/>',
  payit: '<path d="M4 20V11M10 20V5M16 20v-6M2 20h20"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>',
  journal: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  schedule: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  bell: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
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
const hm = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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
  return new Date(ms).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
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
const ui = { taskFilter: 'open', chartSel: {}, mailOpen: null };

async function load() {
  try {
    D = await api('GET', '/api/dashboard');
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
  { phase: 'focus', running: false, endsAt: 0, remaining: null, total: null, label: '', cycle: 0 },
  JSON.parse(localStorage.getItem('timer') || '{}'),
);
const saveT = () => localStorage.setItem('timer', JSON.stringify(T));
const phaseMinutes = (p) => (p === 'focus' ? D?.settings.focusMinutes : p === 'short' ? D?.settings.shortBreak : D?.settings.longBreak) || 25;
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
  T.running = false;
  if (wasFocus) {
    const minutes = Math.round((tTotal() - (skipped ? tLeft() : 0)) / 60e3);
    if (minutes >= 1) api('POST', '/api/focus', { minutes, label: T.label }).then(load).catch(() => {});
    T.cycle = (T.cycle + 1) % 4;
    timerReset(T.cycle === 0 ? 'long' : 'short');
  } else {
    timerReset('focus');
  }
  if (!skipped) { chime('done'); toast({ level: 'info', title: wasFocus ? 'Focus session done — take a break' : 'Break over — ready to focus?' }); }
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
  document.querySelectorAll('.ring-fg').forEach((el) => el.setAttribute('stroke-dashoffset', el.dataset.c * (1 - (T.running || T.remaining != null ? frac : 0))));
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
  return `<span class="when">${new Date(t.due).toLocaleDateString([], { weekday: 'short' })}</span>`;
}

function todoRow(t, full = false) {
  return `<div class="item ${t.done ? 'done' : ''}">
    <button class="check ${t.done ? 'done' : ''}" data-act="todo-toggle" data-id="${t.id}">${t.done ? icon('check') : ''}</button>
    <div class="t"><b class="wrap">${esc(t.text)}</b></div>
    ${t.tag ? `<span class="tag">${esc(t.tag)}</span>` : ''}
    ${dueHtml(t)}
    ${full ? `<button class="icon-btn ${t.star ? 'on' : ''}" data-act="todo-star" data-id="${t.id}">${icon('star')}</button>
              <button class="icon-btn" data-act="todo-del" data-id="${t.id}">${icon('trash')}</button>` : ''}
  </div>`;
}

function eventRow(e) {
  const soon = !e.allDay && e.start - Date.now() < 60 * 60e3 && e.start > Date.now();
  const now = !e.allDay && e.start <= Date.now() && e.end > Date.now();
  const when = e.allDay ? 'All day' : now ? 'Now' : e.start < dayStart(1) ? hm(e.start) : `${new Date(e.start).toLocaleDateString([], { weekday: 'short' })} ${hm(e.start)}`;
  return `<div class="item"><span class="cal-bar"></span>
    <div class="t"><b>${esc(e.title)}</b><span>${esc([e.calendar, e.location].filter(Boolean).join(' · '))}</span></div>
    <span class="when ${soon || now ? 'soon' : ''}">${esc(when)}</span></div>`;
}

const VIEWS = {
  home() {
    const w = D.weather?.data;
    const [wxLabel, wxIcon] = w ? wx(w.code) : ['', 'sun'];
    const rain = w?.nextRain ? ` · rain ~${new Date(w.nextRain.time).toLocaleTimeString([], { hour: 'numeric' })}` : '';
    const events = (D.calendar?.data?.events || []).slice(0, 4);
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
      <section class="card a-clock clock">
        <div class="time" id="clock-time">${clockHtml()}</div>
        <div class="date">${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        <div class="wx">${w ? `${icon(wxIcon)}<b>${w.temp}°</b> ${esc(wxLabel)} · H ${w.hi}° L ${w.lo}°${esc(rain)}` : '<span class="muted">Weather loading…</span>'}</div>
      </section>

      <section class="card a-focus">
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
            : p ? `<span class="status up">${icon('check')} All systems up</span>` : ''}</div>
        ${p ? `<div class="big-num money">${money(p.today.grossCents)}</div>
          ${delta !== null ? `<div class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}% vs. this time yesterday</div>` : '<div class="delta muted">—</div>'}
          <div class="kv"><div><b>${p.today.count}</b><span>sales</span></div><div><b>${money(p.today.avgTicketCents, true)}</b><span>avg ticket</span></div><div><b>${p.today.declined}</b><span>declined</span></div></div>`
          : D.payit?.configured === false ? notConfigured('PayIt', 'Add SUPABASE_URL + key to .env') : `<div class="empty">${esc(D.payit?.error || 'Loading…')}</div>`}
      </section>

      <section class="card a-next">
        <div class="card-h">${icon('schedule')}<span class="grow">Up next</span></div>
        <div class="list">${events.length ? events.map(eventRow).join('') : D.calendar?.configured === false ? notConfigured('Calendar', 'Add CALENDAR_FEEDS (Canvas / Google ICS links) to .env') : '<div class="empty">Nothing in the next few days.</div>'}</div>
      </section>

      <section class="card a-tasks">
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
    const hasTimer = T.running || T.remaining != null;
    const openTodos = realTodos().filter((t) => !t.done).sort(todoSort).slice(0, 6);
    const week = D.focus.week;
    return `<div class="focus">
      <section class="card main">
        <div class="phases">${Object.entries(PHASES).map(([k, v]) => `<button class="chip ${T.phase === k ? 'on' : ''}" data-act="t-phase" data-phase="${k}">${v} · ${phaseMinutes(k)}m</button>`).join('')}</div>
        <div class="bigring">${ring(400, 18, hasTimer ? 1 - tLeft() / tTotal() : 0, T.phase === 'focus' ? 'var(--accent)' : 'var(--info)')}
          <div class="center"><div class="clock-txt" data-timer>${fmtLeft(tLeft())}</div>
            <div class="lbl">${esc(T.label || PHASES[T.phase])}</div>
            <div class="cycle">${[0, 1, 2, 3].map((i) => `<i class="${i < T.cycle ? 'on' : ''}"></i>`).join('')}</div></div>
        </div>
        <div class="controls">
          <button class="btn" data-act="t-adj" data-min="-5">−5</button>
          ${T.running ? `<button class="btn primary" data-act="t-pause">${icon('pause')} Pause</button>` : `<button class="btn primary" data-act="t-start">${icon('play')} ${hasTimer ? 'Resume' : 'Start'}</button>`}
          <button class="btn" data-act="t-adj" data-min="5">+5</button>
          <button class="btn" data-act="t-reset">${icon('reset')}</button>
          <button class="btn" data-act="t-skip">${icon('skip')}</button>
        </div>
      </section>
      <div class="focus-side">
        <section class="card">
          <div class="card-h">Today</div>
          <div class="row" style="gap:28px"><div><div class="big-num" style="font-size:44px">${D.focus.todayMinutes}<span class="muted" style="font-size:20px"> min</span></div></div>
            <div><div class="big-num" style="font-size:44px">${D.focus.todaySessions}</div><span class="muted">sessions</span></div></div>
          <div style="margin-top:12px">${bars('focusweek', week.map((d) => d.minutes), week.map((d) => new Date(d.date).toLocaleDateString([], { weekday: 'narrow' })), (v) => `${v} min`, { height: 110, cls: 'focus-c', capLabel: (i) => new Date(week[i].date).toLocaleDateString([], { weekday: 'long' }) })}</div>
        </section>
        <section class="card working">
          <div class="card-h">Working on</div>
          <div class="chips">${['', ...openTodos.map((t) => t.text)].map((txt) => `<button class="chip ${T.label === txt ? 'on' : ''}" data-act="t-label" data-label="${esc(txt)}" style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;line-height:44px">${esc(txt || 'Nothing specific')}</button>`).join('')}</div>
        </section>
      </div>
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
          <div class="t"><b class="wrap">${esc(t.text)}</b><span>${esc(t.source?.why || [t.source?.from, t.source?.subject].filter(Boolean).join(' · '))}</span></div>
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
          ${bars('week', p.week.map((d) => d.cents), p.week.map((d) => new Date(d.date).toLocaleDateString([], { weekday: 'short' })), (v) => money(v), { height: 150, capLabel: (i) => new Date(p.week[i].date).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }) })}
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
        ${a.error ? `<div class="empty" style="color:var(--warn)">${esc(a.error)}</div>` : ''}
        <div class="list">${a.messages.map((m) => `<div class="msg tap ${m.priority === 'low' ? 'low' : ''}" data-act="mail-open" data-id="${esc(m.id)}">
          <div class="top">${m.priority === 'urgent' ? '<span class="prio"><span class="dot" style="background:var(--bad)"></span>Urgent</span>' : ''}<b>${esc(m.from)}</b><span class="muted">${ago(m.date)}</span></div>
          <p>${esc(m.summary)}</p>
          ${m.action ? `<div class="act">${icon('arrow')} ${esc(m.action)}</div>` : ''}
          ${ui.mailOpen === m.id ? `<div class="subj">Subject: ${esc(m.subject)}</div>
            <div class="row" style="margin-top:8px"><button class="btn small ghost" data-act="mail-todo" data-id="${esc(m.id)}">${icon('plus')} Make it a task</button></div>` : ''}
        </div>`).join('') || '<div class="empty">No unread mail from the last few days.</div>'}</div>
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
      <div class="top"><b>${esc(j.note || j.text)}</b><span class="muted">${hm(j.at)}</span></div>
      ${j.note && j.note !== j.text ? `<p class="said">“${esc(j.text)}”</p>` : ''}
      ${j.pending ? '<div class="act">Working out what you meant…</div>' : j.tasks.map((t) => `<div class="act">${icon('check')} ${esc(t)}</div>`).join('')}
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
    const s = D.calendar;
    const evs = s?.data?.events || [];
    const groups = {};
    for (const e of evs) (groups[dayLabel(e.start)] ??= []).push(e);
    return `<div class="page-h"><h1>Schedule</h1><span class="muted">Next 7 days</span></div>
      <section class="card sched">${s?.configured === false ? notConfigured('Calendar', 'Add CALENDAR_FEEDS to .env — Canvas → Calendar → Calendar Feed gives you the link.')
        : evs.length ? Object.entries(groups).map(([day, list]) => `<h3>${esc(day)}</h3><div class="list">${list.map(eventRow).join('')}</div>`).join('')
        : `<div class="empty">${esc(s?.error || 'Nothing scheduled.')}</div>`}
        ${s?.data?.errors?.length ? `<div class="empty" style="color:var(--warn)">${esc(s.data.errors.join(' · '))}</div>` : ''}</section>`;
  },

  settings() {
    const st = D.settings;
    const step = (key, val, unit = '') => `<div class="stepper"><button data-act="set-step" data-k="${key}" data-d="-1">−</button><b>${esc(val)}${unit}</b><button data-act="set-step" data-k="${key}" data-d="1">+</button></div>`;
    const sys = D.system;
    return `<div class="page-h"><h1>Settings</h1>
        <button class="btn" data-act="mode" data-mode="sleep">${icon('moon')} Sleep now</button>
        <button class="btn ghost" data-act="mode" data-mode="off">Screen off</button></div>
      <div class="settings">
        <section class="card">
          <div class="card-h">Display</div>
          <div class="set-row"><label>Brightness<span>${D.hasBacklight ? 'Touch Display backlight' : 'No backlight found — dims on the Pi only'}</span></label>
            <input type="range" min="10" max="100" value="${st.dayBrightness}" data-act="set-range" data-k="dayBrightness"></div>
          <div class="set-row"><label>Sleep brightness<span>How dim the bedside clock gets</span></label>
            <input type="range" min="0" max="30" value="${st.sleepBrightness}" data-act="set-range" data-k="sleepBrightness"></div>
          <div class="set-row"><label>Automatic sleep mode</label><button class="toggle ${st.autoSleep ? 'on' : ''}" data-act="set-toggle" data-k="autoSleep"></button></div>
          <div class="set-row"><label>Sleep at</label>${step('sleepAt', st.sleepAt)}</div>
          <div class="set-row"><label>Wake at</label>${step('wakeAt', st.wakeAt)}</div>
          <div class="set-row"><label>Email digest at<span>Claude's daily summary of the last 24 hours</span></label>${step('digestAt', st.digestAt)}</div>
          <div class="set-row"><label>Day recap at<span>Evening summary from your notes, tasks and focus time</span></label>${step('recapAt', st.recapAt)}</div>
          <div class="set-row"><label>Suggest tasks from email<span>You approve each one before it counts</span></label><button class="toggle ${st.emailTasks ? 'on' : ''}" data-act="set-toggle" data-k="emailTasks"></button></div>
          <div class="set-row"><label>Sounds</label><button class="toggle ${st.chime ? 'on' : ''}" data-act="set-toggle" data-k="chime"></button></div>
        </section>
        <section class="card">
          <div class="card-h">Focus timer</div>
          <div class="set-row"><label>Focus length</label>${step('focusMinutes', st.focusMinutes, 'm')}</div>
          <div class="set-row"><label>Short break</label>${step('shortBreak', st.shortBreak, 'm')}</div>
          <div class="set-row"><label>Long break</label>${step('longBreak', st.longBreak, 'm')}</div>
          <div class="card-h" style="margin-top:16px">Pi</div>
          <div class="set-row"><label>${esc(sys.host)}<span>${sys.tempC != null ? `${sys.tempC.toFixed(0)}°C · ` : ''}load ${sys.load.toFixed(2)} · mem ${sys.memUsedPct}% · up ${sys.uptimeH}h</span></label>
            <button class="btn small ghost" data-act="refresh">Refresh data</button><button class="btn small ghost" data-act="reload">Reload</button></div>
          ${D.signedIn ? `<div class="set-row"><label>Signed in on this device</label><button class="btn small ghost" data-act="logout">Sign out</button></div>` : ''}
          <div class="set-row"><label>Use it from your phone or laptop<span>Open http://${esc(sys.host.includes(".") ? sys.host : sys.host + ".local")}:${esc(location.port || 80)} on the same Wi-Fi</span></label></div>
        </section>
      </div>`;
  },
};

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

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

const NAV = [['home', 'Home'], ['focus', 'Focus'], ['tasks', 'To do'], ['payit', 'PayIt'], ['mail', 'Mail'], ['journal', 'Journal'], ['schedule', 'Schedule'], ['settings', 'Settings']];

function renderRail() {
  const alerts = D?.alerts || [];
  const serious = alerts.some((a) => a.level !== 'info');
  const urgentMail = (D?.mail?.data?.accounts || []).flatMap((a) => a.messages).filter((m) => m.priority === 'urgent').length;
  const openToday = (D?.todos || []).filter((t) => !t.done && t.due && t.due < dayStart(1)).length;
  const badge = { mail: urgentMail, tasks: openToday + (D ? suggestedTodos().length : 0) };
  $('#rail').innerHTML = NAV.map(([k, label]) => `<button class="${view === k ? 'on' : ''}" data-act="go" data-view="${k}" aria-label="${label}">${icon(k)}${badge[k] ? `<span class="badge info">${badge[k]}</span>` : ''}</button>`).join('')
    + `<div class="spacer"></div>
      <button data-act="alerts" aria-label="Alerts">${icon('bell')}${alerts.length ? `<span class="badge ${serious ? '' : 'info'}">${alerts.length}</span>` : ''}</button>
      <button class="moon" data-act="mode" data-mode="sleep" aria-label="Sleep">${icon('moon')}</button>`;
}

function render() {
  if (!D) return;
  renderRail();
  $('#view').innerHTML = VIEWS[view]();
  drawCharts();
  if (!$('#drawer').hidden) renderDrawer();
}

function renderDrawer() {
  const alerts = D.alerts;
  $('#drawer').innerHTML = `<div class="panel" data-stop>
    <div class="page-h"><h1>Alerts</h1><button class="btn small ghost" data-act="close-drawer">Close</button></div>
    ${alerts.length ? alerts.map((a) => `<div class="alert ${esc(a.level)}"><div class="t"><small>${esc(a.source)}</small><b>${esc(a.title)}</b>${a.body ? `<p>${esc(a.body)}</p>` : ''}</div>
      <button class="icon-btn" data-act="dismiss" data-id="${esc(a.id)}">${icon('x')}</button></div>`).join('') : '<div class="empty">Nothing needs your attention.</div>'}
  </div>`;
}

// Wind-down banner: 30 minutes before sleep mode kicks in.
function renderBanner() {
  const el = $('#banner');
  if (!KIOSK && D && D.mode !== 'day') {
    el.innerHTML = `<div class="b">${icon('moon')} Desk display is ${D.mode === 'off' ? 'off' : 'asleep'} <button class="btn small" data-act="mode" data-mode="day">Wake it</button></div>`;
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
  el.classList.toggle('off', D.mode === 'off');
  el.classList.toggle('sim', !D.hasBacklight);
  const d = new Date();
  const html = `<div class="time">${d.getHours() % 12 || 12}:${pad(d.getMinutes())}</div>
    <div class="next">${nextMorningLine()}</div>
    <div class="actions"><button class="btn" data-act="mode" data-mode="day">Wake up</button>
      ${D.mode === 'off' ? `<button class="btn" data-act="mode" data-mode="sleep">Dim clock</button>` : `<button class="btn" data-act="mode" data-mode="off">Screen off</button>`}</div>`;
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

function go(v) { view = v; ui.chartSel = {}; render(); }

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

const SET_STEPS = { recapAt: 15, digestAt: 15, sleepAt: 15, wakeAt: 15, focusMinutes: 5, shortBreak: 1, longBreak: 5 };

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
      case 't-start': timerStart(); break;
      case 't-pause': timerPause(); break;
      case 't-reset': timerReset(); break;
      case 't-skip': timerFinish(true); break;
      case 't-adj': timerAdjust(Number(el.dataset.min)); break;
      case 't-phase': timerReset(el.dataset.phase); break;
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
      case 'mail-open': ui.mailOpen = ui.mailOpen === el.dataset.id ? null : el.dataset.id; render(); break;
      case 'mail-todo': {
        e.stopPropagation();
        const m = D.mail.data.accounts.flatMap((a) => a.messages).find((x) => x.id === el.dataset.id);
        addTask({ text: m.action || m.subject, due: m.priority === 'urgent' ? dayStart() : null });
        break;
      }
      case 'mode':
        D.mode = el.dataset.mode; syncMode(); renderBanner();
        await api('POST', '/api/mode', { mode: el.dataset.mode });
        if (!KIOSK) toast({ level: 'info', title: el.dataset.mode === 'day' ? 'Desk display is awake' : el.dataset.mode === 'off' ? 'Desk display is off' : 'Desk display is asleep' });
        if (el.dataset.mode === 'day') load();
        break;
      case 'alerts': $('#drawer').hidden = false; renderDrawer(); break;
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

// Drift back to Home after a few idle minutes (unless the timer screen is up and running).
let lastTouch = Date.now();
document.addEventListener('pointerdown', () => (lastTouch = Date.now()), true);
setInterval(() => {
  if (KIOSK && view !== 'home' && Date.now() - lastTouch > 3 * 60e3 && !(view === 'focus' && T.running) && $('#keyboard').hidden) go('home');
}, 15e3);

window.addEventListener('resize', () => drawCharts());

load();
setInterval(load, 20e3);
// Midnight rollover and long-running kiosk hygiene: full reload once a day at 4am.
if (KIOSK) setInterval(() => { const d = new Date(); if (d.getHours() === 4 && d.getMinutes() === 0) location.reload(); }, 60e3);
