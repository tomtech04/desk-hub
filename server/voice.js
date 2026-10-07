// Voice notes -> tasks, a journal, and an evening recap of the day.
//
// The Pebble Index 01 ring's phone app POSTs each recording to a webhook as
// multipart/form-data: `transcription` (text, transcribed on the phone),
// `recordedAt` (unix ms), `client`, optionally `audio` (m4a) and `test`.
// Anything else that can send text works too (JSON { "text": "..." }).
import { askJson, aiEnabled } from './mail.js';

/** Pull the text fields out of a multipart/form-data body; file parts (audio) are skipped. */
export function parseMultipart(buffer, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) return {};
  const boundary = Buffer.from(`--${m[1] || m[2]}`);
  const fields = {};
  let pos = buffer.indexOf(boundary);
  while (pos !== -1) {
    const next = buffer.indexOf(boundary, pos + boundary.length);
    if (next === -1) break;
    const part = buffer.subarray(pos + boundary.length, next);
    const split = part.indexOf('\r\n\r\n');
    if (split !== -1) {
      const head = part.subarray(0, split).toString('utf8');
      const name = /name="([^"]+)"/i.exec(head)?.[1];
      // Only keep plain fields; anything with a filename is an upload.
      if (name && !/filename=/i.test(head)) fields[name] = part.subarray(split + 4, part.length - 2).toString('utf8');
    }
    pos = next;
  }
  return fields;
}

/** Normalize whatever arrived into { text, recordedAt, test }. */
export function readVoiceRequest(buffer, headers) {
  const type = headers['content-type'] || '';
  let f = {};
  if (type.includes('multipart/form-data')) f = parseMultipart(buffer, type);
  else if (type.includes('application/json')) { try { f = JSON.parse(buffer.toString('utf8')); } catch { f = {}; } }
  else f = { text: buffer.toString('utf8') };
  const text = String(f.transcription ?? f.text ?? f.transcript ?? '').trim().slice(0, 8000);
  const recordedAt = Number(f.recordedAt) || Date.now();
  const test = String(f.test) === 'true' || headers['x-index-test'] !== undefined || headers['x-index-trigger'] === 'test-event';
  return { text, recordedAt, test, trigger: headers['x-index-trigger'] || null };
}

const VOICE_SCHEMA = (tags) => ({
  type: 'object',
  additionalProperties: false,
  required: ['tasks', 'complete', 'note', 'kind', 'reply'],
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'due', 'tag', 'subtasks'],
        properties: { text: { type: 'string' }, due: { type: 'string' }, tag: { type: 'string', enum: [...tags, ''] }, subtasks: { type: 'array', items: { type: 'string' } } },
      },
    },
    complete: { type: 'array', items: { type: 'string' } },
    note: { type: 'string' },
    kind: { type: 'string', enum: ['reflection', 'note', ''] },
    reply: { type: 'string' },
  },
});

const norm = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\b(the|a|an|my|to|go|do|task|item)\b/g, ' ').replace(/\s+/g, ' ').trim();

/** No-AI fallback: sentences that sound like to-dos become tasks, "mark X as done" completes, the rest is a note. */
function roughSplit(text, open = []) {
  const tasks = [], complete = [], rest = [];
  const everything = open.flatMap((t) => [{ ref: t.ref, text: t.text }, ...t.subtasks]);
  for (const raw of text.split(/(?<=[.!?])\s+|\s+and then\s+|;\s*/i)) {
    const s = raw.trim().replace(/[.!?]+$/, '');
    if (!s) continue;
    const done = /^(?:please\s+)?(?:mark|check off|tick off|cross off|complete)\s+(.+?)(?:\s+(?:as|is)\s+(?:done|complete|completed|finished))?$/i.exec(s)
      || /^(?:i\s+)?(?:finished|completed|did|am done with|have done)\s+(.+)$/i.exec(s);
    const hit = done && everything.find((t) => { const a = norm(t.text), b = norm(done[1]); return b && (a.includes(b) || b.includes(a)); });
    if (hit) { complete.push(hit.ref); continue; }
    const m = /^(?:i\s+)?(?:need to|have to|got to|gotta|should|must|remind me to|remember to|don't forget to|to-?do:?|add(?: a)? task(?: to)?:?)\s+(.+)/i.exec(s);
    if (m) tasks.push({ text: m[1][0].toUpperCase() + m[1].slice(1), due: '', tag: '', subtasks: [] });
    else rest.push(s);
  }
  const note = rest.join('. ');
  // Without Claude: looking-back words make it a reflection.
  const kind = !note ? '' : /\b(today was|i feel|i felt|feeling|grateful|proud|tired|stressed|happy|anxious|worried|good day|rough day|long day)\b/i.test(note) ? 'reflection' : 'note';
  return { tasks, complete, note, kind, reply: '' };
}

/**
 * What did they ask for?
 * @param open  their open tasks: [{ ref, text, subtasks: [{ ref, text }] }]
 * @returns { tasks: [{ text, due, tag, subtasks: [string] }], complete: [ref], note, reply }
 */
export async function interpretVoice({ text, tags, today, weekday, clock = '', evening = false, open = [] }) {
  if (!aiEnabled()) return roughSplit(text, open);
  try {
    const out = await askJson({
      schema: VOICE_SCHEMA(tags),
      system: `You act on a person's spoken note for their desk dashboard. They pressed a button on a ring and spoke; the text is an automatic transcription, so expect small mistakes and fix obvious ones. Today is ${weekday}, ${today}${clock ? `, and it's ${clock}` : ''}${evening ? ' (they are winding down for the night)' : ''}. You're given their open tasks, each with a ref (and refs for any subtasks).

- tasks: every NEW to-do they stated or clearly meant for themselves, one per item, each a short imperative as they'd write it. Keep their specifics (names, numbers, places). due is YYYY-MM-DD when they gave or implied a day ("tomorrow", "by Friday", "tonight" = today), else "". tag is the best fit from the allowed list, or "". subtasks are the separate steps they listed for that task, if they listed any; otherwise empty.
- complete: the refs of open tasks or subtasks they said are done ("mark grocery shopping as completed", "I finished the lab report", "done with step two of the onboarding"). Match by meaning, not exact words, but only when it's clear which one they mean; if it's ambiguous, leave it out and say so in reply. Copy refs exactly.
- note: anything else worth keeping (an idea, something that happened, how the day went), cleaned up into one or two plain sentences in their voice. "" if there's nothing beyond tasks and completions.
- kind: what the note is. "reflection" when they're looking back or inward: how the day went, how they feel, what they're grateful for or proud of, what's weighing on them, something they want to let go of before sleep. "note" when it's something to keep or pick up later: an idea, a fact, a reminder that isn't a task, a thought for tomorrow. Late at night, an unprompted musing about the day is a reflection. "" when note is "".
- reply: one short sentence confirming what you did, for a notification (e.g. "Marked grocery shopping as done." or "Added 2 tasks."). If you couldn't tell which task they meant, say that instead.

Don't invent tasks they didn't ask for, don't turn a passing thought into a task, and don't add a task for something they just said they finished.`,
      content: JSON.stringify({ open_tasks: open, recording: text }),
    });
    const refs = new Set(open.flatMap((t) => [t.ref, ...t.subtasks.map((x) => x.ref)]));
    return {
      tasks: out.tasks.map((t) => ({ ...t, due: /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : '' })),
      complete: out.complete.filter((r) => refs.has(r)),
      note: out.note,
      kind: out.note ? out.kind || 'note' : '',
      reply: out.reply,
    };
  } catch (err) {
    console.error('[voice] falling back to simple split:', err.message);
    return roughSplit(text, open);
  }
}

const RECAP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'bullets', 'tomorrow'],
  properties: {
    headline: { type: 'string' },
    bullets: { type: 'array', items: { type: 'string' } },
    tomorrow: { type: 'array', items: { type: 'string' } },
  },
};

/** An evening summary of the day from what was said, done and left open. */
export async function buildRecap({ today, weekday, notes, done, open, focusMinutes, focusSessions }) {
  if (!aiEnabled()) throw new Error('Add ANTHROPIC_API_KEY to .env to get a daily recap');
  const out = await askJson({
    schema: RECAP_SCHEMA,
    effort: 'medium',
    system: `You write a short end-of-day recap for one person's desk dashboard, from their own voice notes and task list. Today is ${weekday}, ${today}. Write to them as "you", plainly and warmly, without cheerleading or advice they didn't ask for.

- headline: one sentence capturing the day.
- bullets: at most 5 short lines on what happened and what got done, most significant first. Use their voice notes for what the day was like; use the task and focus numbers as facts, not as a scorecard.
- tomorrow: at most 3 short lines on what's waiting for tomorrow, taken only from the open tasks and anything they said they'd do. Empty if nothing is.

Only use what's in the input. If there's very little, say less rather than padding.`,
    content: JSON.stringify({ voice_notes: notes, tasks_completed_today: done, tasks_still_open: open, focus_minutes: focusMinutes, focus_sessions: focusSessions }),
  });
  return { headline: out.headline, bullets: out.bullets.slice(0, 5), tomorrow: out.tomorrow.slice(0, 3) };
}
