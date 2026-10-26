// Fake data for `npm run demo`, so the UI can be designed and tested off the Pi.
import { startOfDay } from './util.js';

export const source = (fn) => ({ get: () => ({ data: fn(), error: null, failures: 0, updatedAt: Date.now() }), refresh() {} });

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
    today: { grossCents: gross, count: 47, declined: 4, refunded: 1, activeMerchants: 9, byProvider: { stripe: gross * 0.82, ath_movil: gross * 0.18 }, newBusinesses: 2, avgTicketCents: Math.round(gross / 47) },
    yesterdaySameTimeCents: Math.round(gross * 0.86),
    profit: { todayCents: Math.round(gross * 0.82 * 0.029), weekCents: 41250, cardVolumeCents: Math.round(gross * 0.82) },
    hourly,
    week: Array.from({ length: 7 }, (_, i) => ({ date: new Date(startOfDay(Date.now(), i - 6)).toISOString(), cents: i === 6 ? gross : [182000, 241500, 198300, 265000, 301200, 227900][i], count: 40 })),
    excludedProviders: ['cash'],
    subscriptions: { paying: 38, paidThisMonth: 31, monthCents: 92969, inTrial: 6, billingIssues: 1 },
    recent: [[4250, 'stripe', 'completed', 3], [1800, 'ath_movil', 'completed', 9], [6400, 'stripe', 'completed', 16], [2999, 'stripe', 'declined', 22],
      [1250, 'ath_movil', 'completed', 31], [8800, 'stripe', 'completed', 44], [3500, 'stripe', 'completed', 58], [5200, 'stripe', 'refunded', 75]]
      .map(([cents, provider, status, min]) => ({ cents, provider, status, at: new Date(Date.now() - min * 60e3).toISOString() })),
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
  const ev = (calendar, title, start, mins, location = '', more = {}) => ({ id: `${title}:${start}`, calendar, title, start, end: start + mins * 60e3, allDay: false, location, description: '', link: '', organizer: '', guests: [], guestCount: 0, myReply: '', ...more });
  return {
    events: [
      ev('Classes', 'ME 3057 Lecture', today + 13.5 * H, 75, 'MRDC 2404'),
      ev('Canvas', 'Lab 2 Report due', today + 23.98 * H, 0),
      ev('Personal', 'Gym', today + 18 * H, 60),
      ev('Classes', 'Dynamics', startOfDay(Date.now(), 1) + 9.5 * H, 50, 'Klaus 1443'),
      ev('PayIt', 'Merchant onboarding call', startOfDay(Date.now(), 1) + 15 * H, 30, 'Zoom', { description: 'Walk Casa Luna through card readers and payouts.\n\nBring: test reader, payout schedule, tax ID checklist.', link: 'https://zoom.us/j/0000000000', organizer: 'Maya Ortiz', guests: [{ name: 'Maya Ortiz', reply: 'yes' }, { name: 'Luis Rivera', reply: 'maybe' }, { name: 'Casa Luna', reply: 'none' }], guestCount: 4, myReply: 'none' }),
    ].filter((e) => e.end >= Date.now()),
    errors: [],
  };
}

export function weather() {
  const local = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const today = startOfDay();
  const nowH = new Date().getHours();
  return {
    unit: 'F', temp: 74, feels: 76, code: 2, isDay: nowH >= 7 && nowH < 19, hi: 81, lo: 63, rainChance: 40,
    nextRain: { time: local(Date.now() + 4 * H), chance: 60 }, tomorrow: { hi: 78, lo: 61, code: 61 }, tomorrowRain: 70,
    sunrise: local(today + 7.6 * H), sunset: local(today + 19.2 * H), sunriseTomorrow: local(today + 31.6 * H), wind: 6, windUnit: 'mph', humidity: 58,
    hours: Array.from({ length: 18 }, (_, i) => ({ time: local(Date.now() + i * H).slice(0, 13) + ':00', temp: Math.round(74 - Math.abs(i - 2) * 1.1 + Math.sin(i / 3) * 3), code: i >= 4 && i <= 6 ? 61 : i > 9 ? 0 : 2, rain: i >= 4 && i <= 6 ? 60 : i === 3 || i === 7 ? 30 : 5 })),
  };
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

// What the iPhone app sends from Apple Health on an ordinary, slightly stressful day.
export function health() {
  const at = (h, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.getTime(); };
  const hm = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const day = new Date().toISOString().slice(0, 10);
  return {
    day, updatedAt: Date.now(),
    headline: 'More stressed than usual',
    summary: `Your heart rate was up while you were sitting still around ${hm(at(14, 10))} and ${hm(at(16, 40))}. At ${hm(at(17, 30))} you said you felt stressed and drained, mostly about school and PayIt, and low on energy. You got in a 32-minute walk.`,
    stress: { score: 62, label: 'elevated', basis: 'HRV 38 ms vs your usual 52, resting heart rate 64 vs 60, 40 min of raised heart rate while still', learning: false },
    hrv: { avg: 38, usual: 52, samples: 5 }, restingHR: { today: 64, usual: 60 }, heartRate: { avg: 78, max: 141 },
    steps: 8423, activeKcal: 512, exerciseMin: 34, standHours: 9, daylightMin: 46, mindfulMin: 5,
    moments: [{ start: at(14, 10), minutes: 25, bpm: 98 }, { start: at(16, 40), minutes: 15, bpm: 94 }],
    workouts: [{ type: 'Walking', start: at(12, 5), minutes: 32, kcal: 160 }],
    checkins: [{ at: at(17, 30), mood: 3, stress: 4, energy: 2, feelings: ['Stressed', 'Drained'], about: ['School', 'PayIt'], note: '' }],
  };
}

export function recap() {
  return {
    headline: 'A solid lab-and-PayIt day: the report is nearly done and payouts are unblocked.',
    bullets: [
      'You finished the acoustics data for Lab 2 and said the uncertainty section is the only part left.',
      'Stripe tax ID updated, so Friday payouts are no longer at risk.',
      '100 minutes of focus across 3 sessions, mostly on the lab report.',
      'You noted the merchant onboarding call went well and they want a demo next week.',
    ],
    tomorrow: ['Finish the Lab 2 uncertainty section (due 11:59pm)', 'Problem set 4 (Dynamics)', 'Schedule the merchant demo'],
  };
}

export function message(id) {
  const m = mail().accounts.flatMap((a) => a.messages.map((x) => ({ ...x, account: a.name }))).find((x) => x.id === id);
  if (!m) throw new Error('That email is no longer in the list. Refresh and try again.');
  const html = id === 'p1' ? `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1f36"><div style="background:#635bff;color:#fff;padding:22px 24px;border-radius:8px 8px 0 0;font-size:22px;font-weight:700">stripe</div><div style="border:1px solid #e3e8ee;border-top:0;padding:24px;border-radius:0 0 8px 8px"><h2 style="margin:0 0 12px">Action required: verify business details</h2><p style="line-height:1.5">We need an updated tax ID for your connected account. Payouts will pause on <b>Friday</b> if it isn't provided.</p><p><a href="https://example.com" style="display:inline-block;background:#635bff;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:600">Update details</a></p><img alt="" width="512" height="120" style="max-width:100%;border-radius:6px" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='512' height='120'><rect width='512' height='120' fill='%23f6f9fc'/><text x='24' y='68' font-family='Arial' font-size='20' fill='%23635bff'>[ an image from the email ]</text></svg>"><p style="color:#697386;font-size:13px;margin-top:18px">Stripe, 354 Oyster Point Blvd, South San Francisco, CA</p></div></div>` : '';
  return {
    html,
    id, account: m.account, from: m.from, fromAddress: 'sender@example.com', to: ['Tomas'], subject: m.subject, date: m.date,
    text: `Hi Tomas,\n\n${m.summary}\n\nThis is demo text standing in for the full email. On the Pi this shows the real message exactly as it was sent, fetched from your mailbox when you tap it, without marking it as read.\n\nA second paragraph so the reader has something to scroll: lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\n\nThanks,\n${m.from}`,
    truncated: false, attachments: id === 's1' ? ['Lab2_rubric_v2.pdf'] : [],
  };
}

export function draft(id) {
  const m = mail().accounts.flatMap((a) => a.messages).find((x) => x.id === id);
  if (!m) throw new Error('That email is no longer in the list. Refresh and try again.');
  const first = m.from.split(' ')[0];
  return id === 'p1' ? `Hi,\n\nThanks for the heads-up. I'll add the updated tax ID in the dashboard today so payouts aren't paused on Friday.\n\nThanks,`
    : id === 'p3' ? `Hi Mom,\n\nYes, I'll be home for dinner on Sunday. What time should I be there?\n\nLove,`
    : `Hi ${first},\n\nThanks for letting me know. ${m.action ? `I'll take care of it: ${m.action.toLowerCase()}.` : 'Noted.'}\n\nThanks,`;
}

export function taskFromEmail(id) {
  const m = mail().accounts.flatMap((a) => a.messages).find((x) => x.id === id);
  if (!m) throw new Error('That email is no longer in the list. Refresh and try again.');
  return id === 's1'
    ? { text: 'Finish ME 3057 Lab 2 report with the new rubric', due: new Date(startOfDay(Date.now(), 4) + 12 * H).toISOString().slice(0, 10), tag: 'School', why: 'Prof. Ramirez · rubric update', from: m.from, subject: m.subject,
        subtasks: ['Add the uncertainty analysis section', 'Re-check figures against the new rubric', 'Submit on Canvas by 11:59pm Thursday'] }
    : { text: m.action || m.subject, due: '', tag: '', why: m.from, from: m.from, subject: m.subject, subtasks: [] };
}

// Claude chats as the Claude Status app on the Mac reports them: one waiting on you, two working,
// one finished that you haven't opened, and a couple from earlier.
export function claude() {
  const ago = (min) => Date.now() - min * 60e3;
  return [
    { id: 'c1', title: 'Fix payout rounding', project: 'Checkout', state: 'needs', detail: 'Wants to use Bash', since: ago(3) },
    { id: 'c2', title: 'Desk Hub widget', project: 'Desk Hub', state: 'running', detail: 'Editing files', since: ago(12) },
    { id: 'c3', title: 'Lab 2 outline', project: 'School', state: 'running', detail: 'Using the browser', since: ago(26) },
    { id: 'c4', title: 'Onboarding video edits', project: 'Checkout', state: 'done', detail: '', since: ago(4), unread: true,
      preview: 'The new cut is 27 seconds and the captions now match the voiceover.' },
    { id: 'c5', title: 'Weekly planning', project: 'School', state: 'done', detail: '', since: ago(95), unread: false,
      preview: 'Your week is mapped out: two labs, one problem set, and a free Saturday.' },
    { id: 'c6', title: 'Trip planner', project: 'Trips', state: 'done', detail: '', since: ago(180), unread: false,
      preview: 'Three route options are ready; the coastal one is the cheapest.' },
  ];
}
