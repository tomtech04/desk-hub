// Upcoming events from ICS feeds (Canvas, Google Calendar "secret address", Outlook).
// A deliberately small parser: VEVENTs with DAILY/WEEKLY recurrence, EXDATE, all-day.
import { TZ, startOfDay, zonedToUtc } from './util.js';

/** CALENDAR_FEEDS=Canvas|https://...,Personal|https://... */
export const feeds = (process.env.CALENDAR_FEEDS || '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
  const [name, ...rest] = s.split('|');
  return rest.length ? { name, url: rest.join('|') } : { name: 'Calendar', url: name };
});
export const calendarConfigured = feeds.length > 0;

const HORIZON_DAYS = 7;
const DAY = 86400e3;

function parseDate(value, params) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h) return { ms: zonedToUtc(TZ, +y, +mo, +d), allDay: true };
  if (z) return { ms: Date.UTC(+y, +mo - 1, +d, +h, +mi, +s), allDay: false };
  return { ms: zonedToUtc(params.TZID || TZ, +y, +mo, +d, +h, +mi, +s), allDay: false };
}

const unescape = (s) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

function parseEvents(ics) {
  const lines = ics.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const events = [];
  let ev = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { ev = { exdates: [] }; continue; }
    if (line === 'END:VEVENT') { if (ev?.start) events.push(ev); ev = null; continue; }
    if (!ev) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const [name, ...paramParts] = line.slice(0, idx).split(';');
    const params = Object.fromEntries(paramParts.map((p) => p.split('=')));
    const value = line.slice(idx + 1);
    if (name === 'SUMMARY') ev.title = unescape(value);
    else if (name === 'LOCATION') ev.location = unescape(value);
    else if (name === 'DTSTART') ev.start = parseDate(value, params);
    else if (name === 'DTEND') ev.end = parseDate(value, params);
    else if (name === 'RRULE') ev.rrule = Object.fromEntries(value.split(';').map((p) => p.split('=')));
    else if (name === 'EXDATE') for (const v of value.split(',')) { const d = parseDate(v, params); if (d) ev.exdates.push(d.ms); }
    else if (name === 'STATUS') ev.cancelled = value === 'CANCELLED';
  }
  return events;
}

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** Expand one event into occurrences inside [from, to). */
function occurrences(ev, from, to) {
  const dur = ev.end ? ev.end.ms - ev.start.ms : 0;
  const r = ev.rrule;
  if (!r) return ev.start.ms + dur >= from && ev.start.ms < to ? [ev.start.ms] : [];
  if (r.FREQ !== 'DAILY' && r.FREQ !== 'WEEKLY') return [];
  const until = r.UNTIL ? parseDate(r.UNTIL, {}).ms : Infinity;
  const interval = Number(r.INTERVAL || 1);
  const byDay = r.BYDAY ? r.BYDAY.split(',') : [WEEKDAYS[new Date(ev.start.ms).getUTCDay()]];
  const out = [];
  // Step day by day (cheap over a 7-day window) and keep matches.
  const firstDay = startOfDay(ev.start.ms);
  const timeOfDay = ev.start.ms - firstDay;
  for (let day = Math.max(firstDay, startOfDay(from) - DAY); day < to; day = startOfDay(day, 1)) {
    const t = day + timeOfDay;
    if (t < ev.start.ms || t > until || t + dur < from || t >= to) continue;
    const daysSince = Math.round((day - firstDay) / DAY);
    if (r.FREQ === 'DAILY' && daysSince % interval !== 0) continue;
    if (r.FREQ === 'WEEKLY') {
      const weekday = WEEKDAYS[new Date(day + 12 * 3600e3).getUTCDay()];
      if (!byDay.includes(weekday) || Math.floor(daysSince / 7) % interval !== 0) continue;
    }
    if (ev.exdates.some((x) => Math.abs(x - t) < 60e3)) continue;
    out.push(t);
  }
  return out;
}

export async function loadCalendar() {
  const now = Date.now();
  const from = startOfDay(now);
  const to = startOfDay(now, HORIZON_DAYS);
  const errors = [];
  const all = [];
  await Promise.all(feeds.map(async (feed) => {
    try {
      const res = await fetch(feed.url.replace(/^webcal:/, 'https:'), { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`responded ${res.status}`);
      for (const ev of parseEvents(await res.text())) {
        if (ev.cancelled) continue;
        const dur = ev.end ? ev.end.ms - ev.start.ms : 0;
        for (const start of occurrences(ev, from, to)) {
          all.push({ calendar: feed.name, title: ev.title || '(untitled)', location: ev.location || '', start, end: start + dur, allDay: ev.start.allDay });
        }
      }
    } catch (err) {
      errors.push(`${feed.name}: ${err.message}`);
    }
  }));
  all.sort((a, b) => a.start - b.start);
  if (errors.length && !all.length) throw new Error(errors.join('; '));
  return { events: all.slice(0, 40), errors };
}
