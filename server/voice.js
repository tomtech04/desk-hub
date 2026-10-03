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
  required: ['tasks', 'note'],
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'due', 'tag'],
        properties: { text: { type: 'string' }, due: { type: 'string' }, tag: { type: 'string', enum: [...tags, ''] } },
      },
    },
    note: { type: 'string' },
  },
});

/** No-AI fallback: sentences that sound like to-dos become tasks, the rest a note. */
function roughSplit(text) {
  const tasks = [], rest = [];
  for (const raw of text.split(/(?<=[.!?])\s+|\s+and then\s+|;\s*/i)) {
    const s = raw.trim().replace(/[.!?]+$/, '');
    if (!s) continue;
    const m = /^(?:i\s+)?(?:need to|have to|got to|gotta|should|must|remind me to|remember to|don't forget to|to-?do:?|add(?: a)? task(?: to)?:?)\s+(.+)/i.exec(s);
    if (m) tasks.push({ text: m[1][0].toUpperCase() + m[1].slice(1), due: '', tag: '' });
    else rest.push(s);
  }
  return { tasks, note: rest.join('. ') };
}

/** What did they ask for? Returns { tasks: [{ text, due: 'YYYY-MM-DD'|'', tag }], note }. */
export async function interpretVoice({ text, tags, today, weekday }) {
  if (!aiEnabled()) return roughSplit(text);
  try {
    const out = await askJson({
      schema: VOICE_SCHEMA(tags),
      system: `You turn a person's spoken note into entries for their desk dashboard. They pressed a button on a ring and spoke; the text is an automatic transcription, so expect small mistakes and fix obvious ones. Today is ${weekday}, ${today}.

- tasks: every to-do they stated or clearly meant for themselves, one per item, each a short imperative as they'd write it on their own list. Keep their specifics (names, numbers, places). due is YYYY-MM-DD when they gave or implied a day ("tomorrow", "by Friday", "tonight" = today), else "". tag is the best fit from the allowed list, or "".
- note: anything else worth keeping (an idea, something that happened, how the day went), cleaned up into one or two plain sentences in their voice. "" if the recording was only tasks.

Don't invent tasks they didn't ask for, and don't turn a passing thought into a task.`,
      content: `<recording>\n${text}\n</recording>`,
    });
    return { tasks: out.tasks.map((t) => ({ ...t, due: /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : '' })), note: out.note };
  } catch (err) {
    console.error('[voice] falling back to simple split:', err.message);
    return roughSplit(text);
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
