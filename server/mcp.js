// A small MCP server so Claude (Claude Code, the desktop app, claude.ai) can
// put work on the hub: add tasks, tick them off, leave notes, log what got done.
//
// Stateless Streamable HTTP: each POST is one JSON-RPC message (or a batch) and
// gets a plain JSON reply. Access needs HUB_MCP_TOKEN, sent as
// "Authorization: Bearer <token>" or, for clients that can't set headers, as
// the last part of the URL: /mcp/<token>.
import crypto from 'node:crypto';

const PROTOCOL = '2025-06-18';
// This server only does plain request/response tool calls, which every protocol
// revision so far shares, so it answers in whichever dated version the client
// asked for (newer clients send it in _meta) and falls back to PROTOCOL.
const asked = (params) => {
  const v = params?.protocolVersion || params?._meta?.['io.modelcontextprotocol/protocolVersion'];
  return /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : PROTOCOL;
};

const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const TASK_FIELDS = {
  text: str('The task, as a short imperative ("Email Prof. Lee about the extension").'),
  due: str('Deadline as YYYY-MM-DD, if there is one. Omit otherwise.'),
  tag: str('Category. One of the hub\'s tags (see list_tasks) or omit.'),
  subtasks: { type: 'array', items: { type: 'string' }, description: 'Separate steps to tick off, when the task has several parts.' },
};

export const TOOLS = [
  {
    name: 'add_tasks',
    description: 'Add one or more tasks to the user\'s Desk Hub to-do list. Use when the user says they need to do something, asks to be reminded, or when a piece of work ends with follow-ups.',
    inputSchema: { type: 'object', required: ['tasks'], properties: { tasks: { type: 'array', minItems: 1, items: { type: 'object', required: ['text'], properties: TASK_FIELDS } } } },
  },
  {
    name: 'list_tasks',
    description: 'List the user\'s open tasks on the Desk Hub (with ids, due dates, tags and steps), plus the tags that exist. Call this before completing or updating a task so you have its id.',
    inputSchema: { type: 'object', properties: { include_done: { type: 'boolean', description: 'Also return tasks finished today.' } } },
  },
  {
    name: 'complete_task',
    description: 'Mark a task, or one step of a task, as done on the Desk Hub. Give the id from list_tasks, or the task\'s wording if you are sure which one it is.',
    inputSchema: { type: 'object', required: ['task'], properties: { task: str('Task id, or enough of its text to identify it.'), step: str('To tick off just one step: that step\'s text.') } },
  },
  {
    name: 'add_steps',
    description: 'Add steps (subtasks) to an existing task on the Desk Hub.',
    inputSchema: { type: 'object', required: ['task', 'steps'], properties: { task: str('Task id, or enough of its text to identify it.'), steps: { type: 'array', minItems: 1, items: { type: 'string' } } } },
  },
  {
    name: 'log_work',
    description: 'Record a finished piece of work on the Desk Hub: a short summary goes in the journal (it feeds the evening recap), tasks it completed are ticked off, and follow-ups become new tasks. Use at the end of a working session, or when the user says "log this" / "send this to my hub".',
    inputSchema: {
      type: 'object', required: ['summary'],
      properties: {
        summary: str('One or two plain sentences on what was done, in the user\'s voice.'),
        minutes: { type: 'number', description: 'Time spent, if known. Logged as focus time.' },
        completed: { type: 'array', items: { type: 'string' }, description: 'Ids or wording of existing tasks this work finished.' },
        next_steps: { type: 'array', items: { type: 'object', required: ['text'], properties: TASK_FIELDS }, description: 'Follow-up tasks to add.' },
      },
    },
  },
  {
    name: 'add_note',
    description: 'Save a note to the Desk Hub journal (an idea, a decision, something to remember). Not a task.',
    inputSchema: { type: 'object', required: ['text'], properties: { text: str('The note.') } },
  },
  {
    name: 'get_today',
    description: 'What the user\'s day looks like on the Desk Hub: tasks due, what\'s overdue, today\'s calendar, focus time so far, and the mail digest headline.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const norm = (t) => String(t).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Build the tool implementations around the hub's own state and helpers. */
export function createMcp(hub) {
  const { state, save, newTodo, makeSubtasks, dayToMs, localDay, startOfDay, notify } = hub;
  const open = () => state.todos.filter((t) => !t.done && !t.suggested);
  const view = (t) => ({ id: t.id, text: t.text, due: t.due ? localDay(t.due) : null, tag: t.tag || null, starred: Boolean(t.star), steps: (t.subtasks || []).map((x) => ({ text: x.text, done: x.done })) });
  const okDue = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? dayToMs(d) : null);

  function find(ref) {
    const list = open();
    const byId = list.find((t) => t.id === ref);
    if (byId) return { task: byId };
    const want = norm(ref);
    if (!want) return { error: 'No task given.' };
    // Wording has to be specific: two or more words, or most of the task's text.
    // One vague word ("report") is not enough to act on.
    const specific = (have) => want.split(' ').length >= 2 || want.length >= have.length * 0.6;
    const hits = list.filter((t) => { const have = norm(t.text); return (have.includes(want) && specific(have)) || want.includes(have); });
    if (hits.length === 1) return { task: hits[0] };
    return { error: hits.length ? `That matches ${hits.length} tasks (${hits.map((t) => `"${t.text}"`).join(', ')}). Use the id from list_tasks.` : `No open task matches "${ref}". Call list_tasks to see what's there.` };
  }

  function add(tasks, why) {
    const made = tasks.filter((t) => String(t.text || '').trim()).map((t) => newTodo({ text: t.text, tag: t.tag, due: okDue(t.due), subtasks: t.subtasks, source: { why } }));
    state.todos.push(...made);
    return made;
  }

  const impl = {
    add_tasks({ tasks }) {
      const made = add(tasks, 'Added from Claude');
      save();
      if (made.length) notify(`Claude added ${made.length} task${made.length > 1 ? 's' : ''}`, made.map((t) => t.text).join(' · '));
      return { added: made.map(view) };
    },
    list_tasks({ include_done } = {}) {
      const today = startOfDay();
      return {
        today: localDay(), tags: state.settings.tags, open: open().map(view),
        ...(include_done ? { done_today: state.todos.filter((t) => t.done && t.doneAt >= today).map((t) => t.text) } : {}),
        awaiting_review: state.todos.filter((t) => t.suggested).length,
      };
    },
    complete_task({ task, step }) {
      const hit = find(task);
      if (hit.error) throw new Error(hit.error);
      const t = hit.task;
      if (step) {
        const want = norm(step);
        const sub = (t.subtasks || []).find((x) => !x.done && (norm(x.text).includes(want) || want.includes(norm(x.text))));
        if (!sub) throw new Error(`"${t.text}" has no open step matching "${step}".`);
        sub.done = true; save();
        notify('Claude ticked off a step', `${sub.text} (${t.text})`);
        return { task: view(t) };
      }
      t.done = true; t.doneAt = Date.now(); save();
      notify('Claude marked a task done', t.text);
      return { completed: t.text };
    },
    add_steps({ task, steps }) {
      const hit = find(task);
      if (hit.error) throw new Error(hit.error);
      hit.task.subtasks = [...(hit.task.subtasks || []), ...makeSubtasks(steps)];
      save();
      return { task: view(hit.task) };
    },
    log_work({ summary, minutes, completed = [], next_steps = [] }) {
      const done = [], missed = [];
      for (const ref of completed) {
        const hit = find(ref);
        if (hit.task) { hit.task.done = true; hit.task.doneAt = Date.now(); done.push(hit.task.text); } else missed.push(ref);
      }
      const made = add(next_steps, 'Follow-up from Claude');
      state.journal.push({ id: `c${Date.now()}`, at: Date.now(), text: String(summary).slice(0, 2000), note: String(summary).slice(0, 2000), tasks: made.map((t) => t.text), completed: done, trigger: 'claude' });
      state.journal = state.journal.slice(-400);
      const mins = Math.round(Number(minutes) || 0);
      if (mins >= 1) state.focusLog.push({ at: Date.now(), minutes: Math.min(mins, 600), label: String(summary).slice(0, 60) });
      save();
      notify('Work logged from Claude', String(summary).slice(0, 200));
      return { logged: true, completed: done, could_not_match: missed, added: made.map(view), focus_minutes_logged: mins >= 1 ? Math.min(mins, 600) : 0 };
    },
    add_note({ text }) {
      state.journal.push({ id: `c${Date.now()}`, at: Date.now(), text: String(text).slice(0, 2000), note: String(text).slice(0, 2000), tasks: [], completed: [], trigger: 'claude' });
      state.journal = state.journal.slice(-400);
      save();
      return { saved: true };
    },
    get_today() {
      const today = startOfDay(), tomorrow = startOfDay(Date.now(), 1);
      const list = open();
      const d = hub.snapshot();
      return {
        date: localDay(),
        due_today: list.filter((t) => t.due && t.due >= today && t.due < tomorrow).map(view),
        overdue: list.filter((t) => t.due && t.due < today).map(view),
        other_open: list.filter((t) => !t.due || t.due >= tomorrow).length,
        calendar: (d.calendar || []).filter((e) => e.start < tomorrow && e.end >= Date.now() - 1).map((e) => ({ title: e.title, start: new Date(e.start).toISOString(), all_day: e.allDay, location: e.location || undefined })),
        focus_minutes_today: state.focusLog.filter((f) => f.at >= today).reduce((a, f) => a + f.minutes, 0),
        mail_digest: d.digestHeadline || null,
      };
    },
  };

  function rpc(msg) {
    const { id, method, params = {} } = msg;
    const ok = (result) => ({ jsonrpc: '2.0', id, result });
    const fail = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
    if (id === undefined) return null; // a notification: nothing to send back
    switch (method) {
      case 'initialize':
        return ok({ protocolVersion: asked(params), capabilities: { tools: {} }, serverInfo: { name: 'desk-hub', version: '1.0.0' },
          instructions: 'Desk Hub is the user\'s personal dashboard. Use these tools to put tasks, notes and finished work on it. Dates are YYYY-MM-DD in the user\'s local time.' });
      case 'ping': return ok({});
      case 'tools/list': return ok({ tools: TOOLS });
      case 'tools/call': {
        const fn = impl[params.name];
        if (!fn) return fail(-32602, `Unknown tool: ${params.name}`);
        try { return ok({ content: [{ type: 'text', text: JSON.stringify(fn(params.arguments || {}), null, 1) }] }); }
        catch (err) { return ok({ content: [{ type: 'text', text: err.message }], isError: true }); }
      }
      default: return fail(-32601, `Method not found: ${method}`);
    }
  }

  /** Handle one HTTP request to /mcp. Returns true once it has responded. */
  return async function handle(req, res, url, token) {
    // One line per request, so a client that can't connect can be diagnosed.
    // The token itself is never logged, only whether one came and where from.
    let what = '';
    const send = (status, body, headers = {}) => {
      const hdr = req.headers.authorization, inUrl = Boolean(url.pathname.split('/')[2] || url.searchParams.get('key'));
      console.log(`[mcp] ${req.method} ${url.pathname.split('/').slice(0, 2).join('/')}${inUrl ? '/<token>' : ''} -> ${status}${what ? ` (${what})` : ''} | auth: ${hdr ? (/^bearer\s/i.test(hdr) ? 'bearer header' : 'header without Bearer') : inUrl ? 'in url' : 'none'} | accept: ${req.headers.accept || '-'} | agent: ${String(req.headers['user-agent'] || '-').slice(0, 60)}`);
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }); res.end(body === undefined ? '' : JSON.stringify(body));
    };
    if (!token) return send(404, { error: 'The Claude connector is off. Set HUB_MCP_TOKEN in .env.' });
    const sha = (v) => crypto.createHash('sha256').update(v).digest();
    const header = String(req.headers.authorization || '').replace(/^bearer\s+/i, '').trim();
    const inPath = decodeURIComponent(url.pathname.split('/')[2] || '');
    const given = header || inPath || url.searchParams.get('key') || '';
    if (!given || !crypto.timingSafeEqual(sha(given), sha(token))) return send(401, { error: 'unauthorized' }, { 'WWW-Authenticate': 'Bearer' });
    if (req.method !== 'POST') return send(405, { error: 'POST only' }, { Allow: 'POST' });
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 512e3) return send(413, { error: 'too large' }); }
    let msg;
    try { msg = JSON.parse(raw); } catch { return send(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
    what = (Array.isArray(msg) ? msg : [msg]).map((m) => m?.method + (m?.params?.name ? `:${m.params.name}` : '')).join(',');
    const out = Array.isArray(msg) ? msg.map(rpc).filter(Boolean) : rpc(msg);
    if (out === null || (Array.isArray(out) && !out.length)) return send(202); // notifications only
    return send(200, out);
  };
}
