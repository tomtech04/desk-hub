// Fake data for `npm run demo`, so the UI can be designed and tested off the Pi.
import { startOfDay } from './util.js';

export const source = (fn) => ({ get: () => ({ data: fn(), error: null, updatedAt: Date.now() }), refresh() {} });

const H = 3600e3;

export function seedState() {
  const today = startOfDay();
  const mk = (text, tag, extra = {}) => ({ id: crypto.randomUUID(), text, tag, due: null, star: false, done: false, createdAt: Date.now(), ...extra });
  return {
    todos: [
      mk('ME 3057 lab report — acoustics', 'School', { due: today, star: true }),
      mk('Review payout reconciliation', 'PayIt', { due: today }),
      mk('Problem set 4 (Dynamics)', 'School', { due: startOfDay(Date.now(), 1) }),
      mk('Reply to Stripe support ticket', 'PayIt'),
      mk('Groceries', 'Personal', { done: true, doneAt: Date.now() - H }),
      mk('Push OTA fix to preview channel', 'PayIt', { done: true, doneAt: Date.now() - 2 * H }),
    ],
    focusLog: [
      { at: today + 9 * H, minutes: 50, label: 'Dynamics' },
      { at: today + 10.2 * H, minutes: 25, label: 'Lab report' },
      { at: today + 11 * H, minutes: 25, label: 'Lab report' },
      ...Array.from({ length: 6 }, (_, i) => ({ at: startOfDay(Date.now(), i - 6) + 14 * H, minutes: [90, 50, 120, 25, 75, 100][i], label: null })),
    ],
  };
}

export function payit() {
  const hour = new Date().getHours();
  const hourly = Array.from({ length: 24 }, (_, h) => (h <= hour && h >= 8 ? Math.round((Math.sin(h / 3) + 1.3) * 9000 + h * 700) : 0));
  const gross = hourly.reduce((a, b) => a + b, 0);
  return {
    today: { grossCents: gross, count: 47, declined: 4, refunded: 1, activeMerchants: 9, byProvider: { stripe: gross * 0.71, cash: gross * 0.2, ath_movil: gross * 0.09 }, newBusinesses: 2, avgTicketCents: Math.round(gross / 47) },
    yesterdaySameTimeCents: Math.round(gross * 0.86),
    hourly,
    week: Array.from({ length: 7 }, (_, i) => ({ date: new Date(startOfDay(Date.now(), i - 6)).toISOString(), cents: i === 6 ? gross : [182000, 241500, 198300, 265000, 301200, 227900][i], count: 40 })),
    systems: [
      { system: 'database', status: 'up', detail: null, checked_at: new Date().toISOString() },
      { system: 'mercury', status: 'up', detail: null, checked_at: new Date().toISOString() },
      { system: 'stripe_connectivity', status: 'degraded', detail: 'p95 latency 2.4s on /v1/charges', checked_at: new Date().toISOString() },
      { system: 'stripe_status', status: 'up', detail: null, checked_at: new Date().toISOString() },
    ],
  };
}

export function mail() {
  const ago = (m) => new Date(Date.now() - m * 60e3).toISOString();
  return {
    aiEnabled: true,
    accounts: [
      { id: 'mail1', name: 'Personal', unread: 14, messages: [
        { id: 'p1', from: 'Stripe', subject: 'Action required: verify business details', date: ago(25), summary: 'Connected account needs updated tax ID by Friday or payouts pause.', priority: 'urgent', action: 'Update tax ID in the Stripe dashboard' },
        { id: 'p2', from: 'Apple Developer', subject: 'Your build is ready for TestFlight', date: ago(80), summary: 'PayIt 1.4.2 (88) finished processing and is available to testers.', priority: 'normal', action: '' },
        { id: 'p3', from: 'Mom', subject: 'Sunday?', date: ago(190), summary: 'Asking if you are coming home for dinner Sunday.', priority: 'normal', action: 'Reply about Sunday dinner' },
        { id: 'p4', from: 'Spotify', subject: 'New releases for you', date: ago(400), summary: 'Weekly new-release roundup.', priority: 'low', action: '' },
      ] },
      { id: 'mail2', name: 'School', unread: 5, messages: [
        { id: 's1', from: 'Prof. Ramirez', subject: 'ME 3057 Lab 2 rubric update', date: ago(40), summary: 'Lab 2 report now due Thursday 11:59pm; rubric adds uncertainty section.', priority: 'urgent', action: 'Add uncertainty analysis to lab 2' },
        { id: 's2', from: 'Canvas', subject: 'New announcement: Exam 2 logistics', date: ago(300), summary: 'Exam 2 is Oct 14 in Klaus 1443; one formula sheet allowed.', priority: 'normal', action: '' },
        { id: 's3', from: 'GT Career Center', subject: 'Fall career fair recap', date: ago(900), summary: 'Recap and employer list from the fall career fair.', priority: 'low', action: '' },
      ] },
    ],
  };
}

export function calendar() {
  const today = startOfDay();
  const ev = (calendar, title, start, mins, location = '') => ({ calendar, title, start, end: start + mins * 60e3, allDay: false, location });
  return {
    events: [
      ev('Classes', 'ME 3057 Lecture', today + 13.5 * H, 75, 'MRDC 2404'),
      ev('Canvas', 'Lab 2 Report due', today + 23.98 * H, 0),
      ev('Personal', 'Gym', today + 18 * H, 60),
      ev('Classes', 'Dynamics', startOfDay(Date.now(), 1) + 9.5 * H, 50, 'Klaus 1443'),
      ev('PayIt', 'Merchant onboarding call', startOfDay(Date.now(), 1) + 15 * H, 30, 'Zoom'),
    ].filter((e) => e.end >= Date.now()),
    errors: [],
  };
}

export function weather() {
  return { unit: 'F', temp: 74, feels: 76, code: 2, isDay: true, hi: 81, lo: 63, rainChance: 40, nextRain: { time: new Date(Date.now() + 4 * H).toISOString().slice(0, 16), chance: 60 }, tomorrow: { hi: 78, lo: 61, code: 61 }, sunset: '' };
}

export function digest() {
  const inDays = (n) => new Date(startOfDay(Date.now(), n) + 12 * H).toISOString().slice(0, 10);
  return {
    headline: 'Stripe needs your tax ID by Friday, and Lab 2 is now due Thursday night.',
    highlights: [
      'Stripe: connected account will pause payouts Friday without an updated tax ID.',
      'Prof. Ramirez moved the ME 3057 Lab 2 report to Thursday 11:59pm and added an uncertainty section.',
      'Apple: PayIt 1.4.2 (88) is processed and live for TestFlight testers.',
      'Canvas: Exam 2 is Oct 14 in Klaus 1443, one formula sheet allowed.',
      'Mom asked whether you are coming home for dinner Sunday.',
      '9 newsletters and notifications (Spotify, LinkedIn, GT Career Center).',
    ],
    tasks: [
      { email_id: 'p1', text: 'Update tax ID in Stripe dashboard', due: inDays(1), tag: 'PayIt', why: 'Stripe · payouts pause Friday', from: 'Stripe', subject: 'Action required: verify business details' },
      { email_id: 's1', text: 'Add uncertainty analysis to Lab 2 report', due: inDays(0), tag: 'School', why: 'Prof. Ramirez · rubric update', from: 'Prof. Ramirez', subject: 'ME 3057 Lab 2 rubric update' },
      { email_id: 'p3', text: 'Reply to Mom about Sunday dinner', due: '', tag: 'Personal', why: 'Mom · asked about Sunday', from: 'Mom', subject: 'Sunday?' },
    ],
    emailCount: 23,
    errors: [],
  };
}
