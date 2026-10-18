// The workstation: the hub on a laptop (1024px and wider). The desk screen is for
// glancing and tapping; this is for working: keyboard-first, denser, every list
// editable, and able to steer the desk screen. Same server and data as the Pi.
//
// It draws into #ws in regions (data-r="…"): a region's HTML is only swapped when
// it actually changed, and what you were typing, the caret and scroll positions
// are carried across the swap, so the 20-second refresh never interrupts you.

export function createWorkstation(h) {
  const { api, icon, esc, money, hm, ago, wx, dayStart, clock12, dueLabel, tagColor, T } = h;
  const root = document.getElementById('ws');
  const $ = (s, el = root) => el.querySelector(s);
  const $$ = (s, el = root) => [...el.querySelectorAll(s)];

  const NAV = [
    ['today', 'Today', 'home', 'var(--g-home)'], ['inbox', 'Inbox', 'mail', 'var(--g-mail)'], ['tasks', 'Tasks', 'tasks', 'var(--g-tasks)'], ['journal', 'Journal', 'journal', 'var(--g-journal)'],
    ['calendar', 'Calendar', 'schedule', 'var(--g-cal)'], ['payit', 'PayIt', 'payit', 'var(--g-money)'], ['focus', 'Focus', 'focus', 'var(--g-focus)'], ['settings', 'Settings', 'settings', 'var(--g-home)'],
  ];
  const DESK_VIEWS = [['home', 'Home', 'home'], ['focus', 'Focus', 'focus'], ['schedule', 'Schedule', 'schedule'], ['journal', 'Journal', 'journal']];
  const store = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };

  const st = {
    view: store('wsView', 'today'),
    mailFolder: 'all', mailSel: null, mailQuery: '', msgs: new Map(), draft: null,
    taskSel: null, taskFilter: 'open', taskQuery: '',
    jSel: null, jQuery: '', jDays: null, jLoading: false,
    calSel: null, focusWhere: 'here', deskMinutes: null,
    palette: null, rec: null, alertsOpen: false,
    dismissed: store('wsDismissed', {}), noteSaved: null,
  };

  // ---------------------------------------------------------------------------
  // Regions
  // ---------------------------------------------------------------------------

  const cache = {};
  let shell = null;

  function patch(key, html) {
    const el = root.querySelector(`[data-r="${key}"]`);
    if (!el || cache[key] === html) return;
    const active = document.activeElement;
    const keep = active && el.contains(active) && active.dataset.k ? { k: active.dataset.k, a: active.selectionStart, b: active.selectionEnd } : null;
    const values = {};
    for (const i of el.querySelectorAll('[data-k]')) if (i.dataset.dirty) values[i.dataset.k] = i.value;
    const scroll = {};
    for (const x of el.querySelectorAll('[data-s]')) scroll[x.dataset.s] = x.scrollTop;
    el.innerHTML = html; cache[key] = html;
    for (const [k, v] of Object.entries(values)) { const i = el.querySelector(`[data-k="${CSS.escape(k)}"]`); if (i) { i.value = v; i.dataset.dirty = '1'; } }
    for (const x of el.querySelectorAll('[data-s]')) if (scroll[x.dataset.s]) x.scrollTop = scroll[x.dataset.s];
    if (keep) { const i = el.querySelector(`[data-k="${CSS.escape(keep.k)}"]`); if (i) { i.focus(); try { i.setSelectionRange(keep.a, keep.b); } catch {} } }
  }

  function render() {
    const D = h.D;
    if (!D) return;
    if (!root.dataset.ready) {
      root.innerHTML = `<aside class="w-side" data-r="side"></aside>
        <section class="w-main"><header class="w-head" data-r="head"></header><div class="w-body"></div></section>
        <footer class="w-foot" data-r="foot"></footer><div data-r="over"></div>`;
      root.dataset.ready = '1';
    }
    patch('side', side()); patch('head', head()); patch('foot', foot());
    if (shell !== st.view) {
      $('.w-body').innerHTML = SHELL[st.view];
      $('.w-body').dataset.view = st.view;
      for (const k of Object.keys(cache)) if (k.startsWith('v-')) delete cache[k];
      shell = st.view;
    }
    VIEW[st.view]();
    patch('over', overlays());
    h.mountClocks(root);
    tick();
  }

  function go(view) {
    if (!NAV.some(([k]) => k === view)) return;
    st.view = view; st.alertsOpen = false;
    localStorage.setItem('wsView', JSON.stringify(view));
    if (view === 'journal') loadDays();
    render();
  }

  // ---------------------------------------------------------------------------
  // Shared bits
  // ---------------------------------------------------------------------------

  const todos = () => h.realTodos();
  const openTodos = () => todos().filter((t) => !t.done).sort(h.todoSort);
  const dueNow = () => openTodos().filter((t) => t.due && t.due < dayStart(1));
  const mailAll = () => (h.D.mail?.data?.accounts || []).flatMap((a) => a.messages.map((m) => ({ ...m, account: a.name })));
  const mailInbox = () => mailAll().filter((m) => !m.hidden);
  const events = () => h.D.calendar?.data?.events || [];
  const where = (e) => (e.location || e.calendar || '').split(',')[0];
  const deskTimer = () => { const t = h.D.desk?.timer; return t && (t.running || t.remaining != null) ? t : null; };
  const deskLeft = (t) => (t.running ? Math.max(0, t.endsAt - Date.now()) : t.remaining ?? 0);
  const localActive = () => T.running || T.remaining != null;
  const tile = (name, bg, cls = '') => `<span class="w-tile ${cls}" style="background:${bg}">${icon(name)}</span>`;

  function groups(list) {
    const g = { overdue: [], today: [], upcoming: [], nodate: [] };
    for (const t of list) (!t.due ? g.nodate : t.due < dayStart() ? g.overdue : t.due < dayStart(1) ? g.today : g.upcoming).push(t);
    return [['overdue', 'Overdue', g.overdue], ['today', 'Today', g.today], ['upcoming', 'Upcoming', g.upcoming], ['nodate', 'No date', g.nodate]].filter(([, , items]) => items.length);
  }

  function taskRow(t, { focusBtn = false } = {}) {
    const subs = t.subtasks || [], due = dueLabel(t), on = t.done || t.finishing;
    return `<div class="w-task ${t.finishing ? 'finishing' : ''} ${t.done ? 'done' : ''} ${st.view === 'tasks' && st.taskSel === t.id ? 'sel' : ''}">
      <button class="w-check ${on ? 'done' : ''}" data-act="todo-toggle" data-id="${t.id}" aria-label="Done">${on ? icon('check') : ''}</button>
      <button class="w-task-t" data-ws="task-select" data-id="${t.id}"><span>${esc(t.text)}</span>${subs.length ? `<em>${subs.filter((x) => x.done).length}/${subs.length}</em>` : ''}</button>
      ${t.tag ? `<span class="w-tag"><i style="background:${tagColor(t.tag)}"></i>${esc(t.tag)}</span>` : ''}
      <span class="w-due ${due && !t.done ? due[1] : ''}">${due && !t.done ? due[0] : ''}</span>
      ${focusBtn ? `<button class="w-ibtn play" data-ws="focus-task" data-id="${t.id}" title="Focus on this">${icon('play')}</button>` : ''}
      <button class="w-ibtn star ${t.star ? 'on' : ''}" data-act="todo-star" data-id="${t.id}" aria-label="Star">${icon('star')}</button>
    </div>`;
  }
  const groupCards = (list, opts) => groups(list).map(([k, label, items]) => `<section class="w-card w-group ${k}"><div class="w-kick">${label} · ${items.length}</div>${items.map((t) => taskRow(t, opts)).join('')}</section>`).join('');

  /** "Read ch. 4 #school !fri" -> { text, tag, due } */
  function parseTask(raw) {
    let tag = null, due = null;
    const tags = h.D.settings.tags;
    const text = raw.replace(/(^|\s)#(\w+)/g, (all, sp, w) => { const hit = tags.find((t) => t.toLowerCase() === w.toLowerCase()); if (!hit) return all; tag = hit; return sp; })
      .replace(/(^|\s)!(\w+)/g, (all, sp, w) => {
        const k = w.toLowerCase(), days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        if (k === 'today') due = dayStart(); else if (k === 'tomorrow' || k === 'tmrw') due = dayStart(1); else if (k === 'week') due = dayStart(7);
        else if (days.includes(k.slice(0, 3))) { const d = (days.indexOf(k.slice(0, 3)) - new Date().getDay() + 7) % 7 || 7; due = dayStart(d); }
        else return all;
        return sp;
      }).replace(/\s+/g, ' ').trim();
    return { text, tag, due };
  }
  async function addTask(raw) {
    const t = parseTask(raw);
    if (!t.text) return;
    await api('POST', '/api/todos', t);
    await h.load();
  }

  // ---------------------------------------------------------------------------
  // Frame: sidebar, header, status bar
  // ---------------------------------------------------------------------------

  function side() {
    const D = h.D, d = D.desk || {};
    const counts = { inbox: mailInbox().length, tasks: dueNow().length };
    const awake = D.mode === 'day';
    const dt = deskTimer();
    const run = localActive() ? `<button class="w-run" data-ws="go" data-view="focus">
        <span class="w-run-ring">${h.ring(34, 4, 1 - h.tLeft() / h.tTotal(), 'url(#g-focus)')}</span>
        <span><b data-timer>${h.fmtLeft(h.tLeft())}</b><em>${esc(`here · ${T.label || h.PHASES[T.phase]}`)}</em></span></button>`
      : dt ? `<button class="w-run" data-ws="focus-desk"><span class="w-run-ring">${h.ring(34, 4, 1 - deskLeft(dt) / (dt.total || 1), 'url(#g-focus)', true)}</span>
        <span><b data-desk-timer>${h.fmtLeft(deskLeft(dt))}</b><em>${esc(`on desk · ${dt.label || 'focus'}`)}</em></span></button>` : '';
    return `<div class="w-brand"><b>Desk Hub</b><span>WORKSTATION</span></div>
      <button class="w-rec" data-ws="record">${icon('journal')}Record a note<kbd>R</kbd></button>
      <button class="w-find" data-ws="palette">${icon('search')}Search or run…<kbd>⌘K</kbd></button>
      ${NAV.map(([k, label, ic, bg]) => `<button class="w-nav ${st.view === k ? 'on' : ''}" data-ws="go" data-view="${k}">
        <span class="w-nav-i" ${st.view === k ? `style="background:${bg};color:#0C0E12"` : ''}>${icon(ic)}</span><span>${label}</span>
        ${counts[k] ? `<em class="${k}">${counts[k]}</em>` : ''}</button>`).join('')}
      <div class="grow"></div>${run}
      <section class="w-desk">
        <div class="w-desk-h"><i class="${d.online ? (awake ? 'on' : 'asleep') : 'off'}"></i><b>${esc(D.system?.host || 'deskhub')}</b><span>${d.online ? (awake ? 'awake' : 'asleep') : 'offline'}</span></div>
        <div class="w-desk-v">${DESK_VIEWS.map(([k, label, ic]) => `<button class="${d.online && d.view === k ? 'on' : ''}" data-ws="desk-view" data-view="${k}" title="Show ${label} on the desk">${icon(ic)}</button>`).join('')}</div>
        <div class="w-desk-f">${d.online ? `Desk shows ${esc(d.view || 'home')}` : 'The desk screen isn\'t answering'}</div>
      </section>`;
  }

  function head() {
    const D = h.D, alerts = D.alerts || [];
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const open = openTodos().length, due = dueNow().length;
    const week = `${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${new Date(dayStart(6)).getDate()}`;
    const [title, sub] = {
      today: ['Today', `${today} · your workspace`],
      inbox: ['Inbox', `${mailInbox().length} unread · summaries and drafts by Claude`],
      tasks: ['Tasks', `${open} open · ${due} due today`],
      journal: ['Journal', 'Write, record and search every day'],
      calendar: ['Calendar', week],
      payit: ['PayIt', `Live · updated ${D.payit?.updatedAt ? hm(D.payit.updatedAt) : '—'}`],
      focus: ['Focus', 'Runs here or on your desk'],
      settings: ['Settings', 'This computer and your desk'],
    }[st.view];
    return `<h1>${title}</h1><span class="w-sub">${esc(sub)}</span><span class="grow"></span>
      <span class="w-sync ${D.desk?.online ? '' : 'off'}"><i></i>${D.desk?.online ? 'Synced with desk' : 'Desk offline'}</span>
      <button class="w-bell ${alerts.length ? 'has' : ''}" data-ws="alerts">${icon('bell')}${alerts.length}</button>`;
  }

  function foot() {
    const D = h.D, p = D.payit?.data, w = D.weather?.data, d = D.desk || {};
    const delta = p?.yesterdaySameTimeCents ? Math.round(((p.today.grossCents - p.yesterdaySameTimeCents) / p.yesterdaySameTimeCents) * 100) : null;
    const bad = (p?.systems || []).filter((s) => s.status !== 'up'), down = bad.filter((s) => s.status === 'down').length;
    const dt = deskTimer();
    return `<span class="w-f-desk"><i class="${d.online ? (D.mode === 'day' ? 'on' : 'asleep') : 'off'}"></i>${esc(D.system?.host || 'deskhub')} ${d.online ? `${D.mode === 'day' ? 'awake' : 'asleep'} · shows ${esc(d.view || 'home')}` : 'offline'}</span>
      ${localActive() ? `<span class="amber">▶ Focus <span data-timer>${h.fmtLeft(h.tLeft())}</span>${T.label ? ` · ${esc(T.label)}` : ''}</span>` : dt ? `<span class="amber">▶ Desk <span data-desk-timer>${h.fmtLeft(deskLeft(dt))}</span>${dt.label ? ` · ${esc(dt.label)}` : ''}</span>` : ''}
      ${p ? `<span>PayIt <b class="mint">${money(p.today.grossCents)}${delta !== null ? ` ${delta >= 0 ? '▲' : '▼'}${Math.abs(delta)}%` : ''}</b></span>` : ''}
      ${down ? `<span class="coral">${down} system${down > 1 ? 's' : ''} down</span>` : bad.length ? `<span class="amber">${bad.length} system${bad.length > 1 ? 's' : ''} degraded</span>` : ''}
      <span>${mailInbox().length} unread</span><span class="grow"></span>
      <span>${w ? `${w.temp}° ${esc(wx(w.code)[0].toLowerCase())} · ` : ''}<span data-clock></span></span>
      <span class="dim">⌘K commands · R record · 1–8 views</span>`;
  }

  // ---------------------------------------------------------------------------
  // Today
  // ---------------------------------------------------------------------------

  function todayLeft() {
    const D = h.D, w = D.weather?.data, now = Date.now(), d = new Date();
    const today = events().filter((e) => e.start < dayStart(1) && e.end >= dayStart()).sort((a, b) => a.start - b.start);
    const tomorrow = events().filter((e) => e.start >= dayStart(1) && e.start < dayStart(2));
    let marked = false;
    const rows = today.map((e) => {
      const past = !e.allDay && e.end < now, live = !e.allDay && e.start <= now && e.end > now;
      const marker = !marked && !e.allDay && e.start > now ? ((marked = true), `<div class="w-nowline"><span data-clock-short></span><i></i></div>`) : '';
      const mins = Math.round((e.end - e.start) / 60e3);
      return `${marker}<button class="w-ag ${past ? 'past' : ''}" data-ws="event" data-id="${esc(e.id || '')}"><span class="${live ? 'now' : ''}">${e.allDay ? 'All day' : hm(e.start)}</span>
        <span><span class="w-ag-t"><b>${esc(e.title)}</b>${live ? '<em>NOW</em>' : ''}</span><i>${esc([where(e), !e.allDay && mins > 0 ? `${mins} min` : ''].filter(Boolean).join(' · '))}</i></span></button>`;
    }).join('');
    return `<section class="w-hero"><i></i>
        <div class="dotclock" data-dotclock="mini"></div>
        <div class="w-hero-d"><span>${d.getHours() < 12 ? 'AM' : 'PM'}</span>${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        ${w ? `<div class="w-hero-w">${icon(wx(w.code)[1])}<b>${w.temp}°</b><span>${esc(wx(w.code)[0])}</span><em>H${w.hi} L${w.lo} · ${w.rainChance ?? 0}%</em></div>` : ''}
      </section>
      <section class="w-card w-agenda">
        <div class="w-ch">${tile('schedule', 'var(--g-cal)')}<b>Agenda</b><button data-ws="go" data-view="calendar">Week →</button></div>
        ${rows || '<div class="w-empty">Nothing on the calendar today.</div>'}${today.length && !marked ? '<div class="w-nowline"><span data-clock-short></span><i></i></div>' : ''}
      </section>
      ${tomorrow.length ? `<section class="w-card w-tomorrow"><div class="w-kick">Tomorrow</div>${tomorrow.slice(0, 5).map((e) => `<button class="w-tm" data-ws="event" data-id="${esc(e.id || '')}"><span>${e.allDay ? 'All day' : hm(e.start)}</span><b>${esc(e.title)}</b></button>`).join('')}</section>` : ''}`;
  }

  function todayTasks() {
    const open = openTodos();
    return `<div class="w-colh"><b>Tasks</b><span>${open.length} open · ${dueNow().length} due today</span></div>
      <div class="w-add"><label>${icon('plus')}<input data-k="newtask" data-enter="add-task" placeholder="Add a task and press Enter" autocomplete="off"><kbd>N</kbd></label>
        <p>${h.D.settings.tags.map((t) => `#${t.toLowerCase()}`).join(' ')} · !today !tomorrow !fri</p></div>
      ${groupCards(open, { focusBtn: true }) || '<div class="w-empty center">All clear. Nice.</div>'}`;
  }

  function needs() {
    const D = h.D, out = [];
    for (const s of D.payit?.data?.systems || []) if (s.status !== 'up') out.push({ id: `sys:${s.system}:${s.status}`, kind: 'PayIt · system', icon: 'payit', bg: 'var(--g-bad)', title: `${s.system.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())} is ${s.status}`, body: s.detail || '', acts: [['Open PayIt', 'data-ws="go" data-view="payit"', true]] });
    for (const m of mailInbox()) if (m.priority === 'urgent') out.push({ id: `mail:${m.id}`, kind: `Mail · urgent · ${m.account}`, icon: 'mail', bg: 'var(--g-mail)', title: m.subject || m.from, body: `${m.from}: ${m.summary}`,
      acts: [['Draft reply', `data-ws="mail-draft" data-id="${esc(m.id)}"`, true], ['Make task', `data-ws="mail-task" data-id="${esc(m.id)}"`], ['Open', `data-ws="mail-open" data-id="${esc(m.id)}"`]] });
    for (const t of h.suggestedTodos()) out.push({ id: `sugg:${t.id}`, kind: 'Suggested from email', icon: 'tasks', bg: 'var(--g-tasks)', title: t.text, body: t.source?.why || [t.source?.from, t.source?.subject].filter(Boolean).join(' · '),
      acts: [['Keep', `data-act="sugg-keep" data-id="${t.id}"`, true], ['Not real', `data-act="sugg-dismiss" data-id="${t.id}"`]] });
    return out.filter((n) => !st.dismissed[n.id]);
  }

  function todayNeeds() {
    const list = needs();
    return `<div class="w-colh"><b>Needs you</b><span>${list.length} item${list.length === 1 ? '' : 's'}</span></div>
      ${list.map((n) => `<section class="w-card w-need">
        <div>${tile(n.icon, n.bg, 'lg')}<div class="grow"><div class="w-kick tight">${esc(n.kind)}</div><b>${esc(n.title)}</b>${n.body ? `<p>${esc(n.body)}</p>` : ''}</div>
          <button class="w-ibtn" data-ws="need-dismiss" data-id="${esc(n.id)}" aria-label="Dismiss">${icon('x')}</button></div>
        <div class="w-need-a">${n.acts.map(([label, attrs, primary]) => `<button class="w-btn ${primary ? 'primary' : ''}" ${attrs}>${label}</button>`).join('')}</div>
      </section>`).join('') || '<div class="w-empty center">All clear. Nice.</div>'}`;
  }

  const words = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);
  const noteMeta = (text) => (text.trim() ? `Saved · ${words(text)} word${words(text) === 1 ? '' : 's'}` : 'Saved to your journal');
  function noteCard(big = false) {
    const text = h.D.dayNote || '';
    return `<section class="w-card w-note ${big ? 'big' : ''}">
      <div class="w-ch">${big ? '' : tile('journal', 'var(--g-journal)')}<b>Today's note</b><span data-note-meta>${noteMeta(text)}${big ? ' · shows on the desk' : ''}</span></div>
      <textarea data-k="daynote" placeholder="Anything to remember about today. It's saved to your journal and searchable later.">${esc(text)}</textarea>
    </section>`;
  }

  // ---------------------------------------------------------------------------
  // Inbox
  // ---------------------------------------------------------------------------

  function mailList() {
    const q = st.mailQuery.toLowerCase();
    let list = st.mailFolder === 'done' ? mailAll().filter((m) => m.hidden) : mailInbox();
    if (st.mailFolder === 'urgent') list = list.filter((m) => m.priority === 'urgent');
    else if (!['all', 'done'].includes(st.mailFolder)) list = list.filter((m) => m.account === st.mailFolder);
    if (q) list = list.filter((m) => [m.from, m.subject, m.summary].some((x) => (x || '').toLowerCase().includes(q)));
    return list.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  }

  function selectMail(id) {
    st.mailSel = id;
    if (st.draft?.id !== id) st.draft = null;
    if (id && !st.msgs.has(id)) {
      st.msgs.set(id, { loading: true });
      api('POST', '/api/mail/read', { id }).then((message) => st.msgs.set(id, { message }), (err) => st.msgs.set(id, { error: err.message })).then(render);
    }
  }

  function inbox() {
    const D = h.D, list = mailList();
    if (!list.some((m) => m.id === st.mailSel)) selectMail(list[0]?.id || null);
    const accounts = D.mail?.data?.accounts || [];
    const all = mailInbox();
    const folders = [['all', 'All mail', all.length], ...accounts.map((a) => [a.name, a.name, all.filter((m) => m.account === a.name).length]),
      ['urgent', 'Urgent', all.filter((m) => m.priority === 'urgent').length], ['done', 'Done', mailAll().filter((m) => m.hidden).length]];
    const digest = D.digest?.headline ? D.digest : null;
    patch('v-folders', `${folders.map(([k, label, n]) => `<button class="w-folder ${st.mailFolder === k ? 'on' : ''}" data-ws="mail-folder" data-f="${esc(k)}"><span>${esc(label)}</span><em>${n}</em></button>`).join('')}
      ${digest ? `<section class="w-digest"><div class="w-kick violet">Digest · Claude · ${hm(digest.at)}</div><p>${esc(digest.headline)}</p></section>` : ''}`);
    patch('v-list', `<label class="w-search">${icon('search')}<input data-k="mailsearch" data-input="mail-search" placeholder="Search mail" autocomplete="off" value="${esc(st.mailQuery)}"></label>
      <div class="w-mlist" data-s="mlist">${list.map((m) => `<button class="w-mrow ${m.id === st.mailSel ? 'sel' : ''} ${m.priority === 'low' ? 'low' : ''}" data-ws="mail-select" data-id="${esc(m.id)}">
          <div><i class="${m.hidden ? 'off' : ''}"></i><b>${esc(m.from)}</b>${m.priority === 'urgent' ? '<em>URGENT</em>' : ''}<span>${esc(m.account)} · ${ago(m.date)}</span></div>
          <strong>${esc(m.subject || '')}</strong><p>${esc(m.summary || '')}</p></button>`).join('') || `<div class="w-empty center">${st.mailQuery ? 'Nothing matches.' : st.mailFolder === 'done' ? 'Nothing marked done.' : 'Inbox zero. Nice.'}</div>`}</div>
      <div class="w-hint">J / K move · D draft reply · E done · T task</div>`);
    patch('v-reader', reader(list.find((m) => m.id === st.mailSel)));
  }

  function reader(m) {
    if (!m) return '<div class="w-empty center">Pick an email to read it here.</div>';
    const r = st.msgs.get(m.id) || {}, msg = r.message, d = st.draft?.id === m.id ? st.draft : null;
    return `<div class="w-reader" data-s="reader">
      <h2>${esc(msg?.subject || m.subject || m.summary)}</h2>
      <div class="w-rd-from"><b>${esc(m.from)}</b>${msg?.fromAddress ? ` &lt;${esc(msg.fromAddress)}&gt;` : ''} · ${esc(m.account)} · ${ago(m.date) === 'now' ? 'just now' : `${ago(m.date)} ago`}</div>
      ${m.summary ? `<section class="w-sum"><div class="w-kick violet">Summary · Claude</div><p>${esc(m.summary)}</p>${m.action ? `<div class="w-act">${icon('arrow')}${esc(m.action)}</div>` : ''}</section>` : ''}
      <div class="w-rd-btns">
        <button class="w-btn mail" data-ws="mail-draft" data-id="${esc(m.id)}" ${d?.loading ? 'disabled' : ''}>Draft reply with Claude<kbd>D</kbd></button>
        <button class="w-btn" data-ws="mail-task" data-id="${esc(m.id)}">Make it a task<kbd>T</kbd></button>
        <button class="w-btn" data-ws="mail-done" data-id="${esc(m.id)}">${m.hidden ? 'Back to inbox' : 'Done'}<kbd>E</kbd></button>
      </div>
      ${d ? `<section class="w-draft">
          <div class="w-kick violet">${d.loading ? 'Claude is drafting…' : d.error ? 'Couldn\'t draft a reply' : 'Draft · edit before you send'}</div>
          ${d.loading ? '<div class="loadbar"><i></i></div>' : d.error ? `<p class="w-err">${esc(d.error)}</p>`
            : `<textarea data-k="draft:${esc(m.id)}">${esc(d.text)}</textarea>
              <div class="w-rd-btns"><button class="w-btn primary" data-ws="draft-mail" data-id="${esc(m.id)}">Open in Mail</button><button class="w-btn" data-ws="draft-copy" data-id="${esc(m.id)}">Copy</button>
                <button class="w-btn ghost" data-ws="draft-discard">Discard</button><span>The hub doesn't send email. This opens the reply in your mail app, ready to send.</span></div>`}
        </section>` : ''}
      ${r.error ? `<div class="w-empty">${esc(r.error)}</div>` : !msg ? '<div class="w-loading"><span>Fetching the email as it was sent…</span><div class="loadbar white"><i></i></div></div>'
        : msg.html ? `<iframe class="w-frame" title="Email" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" srcdoc="${esc(h.emailDoc(msg.html))}"></iframe>`
        : `<div class="w-mailtext">${esc(msg.text)}</div>`}
    </div>`;
  }

  async function draftReply(id) {
    if (st.view !== 'inbox' || st.mailSel !== id) { st.view = 'inbox'; st.mailFolder = 'all'; selectMail(id); }
    st.draft = { id, loading: true };
    render();
    try { st.draft = { id, text: (await api('POST', '/api/mail/draft', { id })).draft }; }
    catch (err) { st.draft = { id, error: err.message }; }
    if (st.mailSel === id) render();
  }
  async function mailTask(id) {
    h.toast({ level: 'info', source: 'mail', title: 'Claude is reading it…' });
    try {
      const t = await api('POST', '/api/mail/task', { id });
      h.toast({ level: 'info', source: 'tasks', title: 'Added to Tasks', body: `${t.text}${t.subtasks?.length ? ` (${t.subtasks.length} steps)` : ''}` });
      await h.load();
    } catch (err) { h.toast({ level: 'error', source: 'mail', title: 'Couldn\'t make a task', body: err.message }); }
  }
  async function mailDone(id) {
    const m = mailAll().find((x) => x.id === id);
    if (!m) return;
    const hidden = !m.hidden, list = mailList(), at = list.findIndex((x) => x.id === id);
    for (const a of h.D.mail.data.accounts) for (const x of a.messages) if (x.id === id) x.hidden = hidden;
    selectMail((list[at + 1] || list[at - 1])?.id || null);
    render();
    await api('POST', '/api/mail/hide', { id, hidden });
  }

  // ---------------------------------------------------------------------------
  // Tasks
  // ---------------------------------------------------------------------------

  function taskList() {
    const f = st.taskFilter, q = st.taskQuery.toLowerCase();
    let list = todos().slice().sort(h.todoSort);
    if (f === 'done') list = list.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    else {
      list = list.filter((t) => !t.done || t.finishing);
      if (f === 'starred') list = list.filter((t) => t.star); else if (f !== 'open') list = list.filter((t) => t.tag === f);
    }
    if (q) list = list.filter((t) => t.text.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q));
    return list;
  }

  function tasks() {
    const list = taskList();
    if (!list.some((t) => t.id === st.taskSel) && !todos().some((t) => t.id === st.taskSel && t.finishing)) st.taskSel = list[0]?.id || null;
    const chips = [['open', 'All open'], ['starred', 'Starred'], ...h.D.settings.tags.map((t) => [t, t]), ['done', 'Done']];
    patch('v-tasks', `<div class="w-trow"><label class="w-add inline">${icon('plus')}<input data-k="newtask" data-enter="add-task" placeholder="Add a task · #tag !due · Enter" autocomplete="off"></label>
        <label class="w-search">${icon('search')}<input data-k="taskfilter" data-input="task-filter" placeholder="Filter" autocomplete="off" value="${esc(st.taskQuery)}"></label></div>
      <div class="w-chips">${chips.map(([k, v]) => `<button class="${st.taskFilter === k ? 'on' : ''}" data-ws="task-filter" data-f="${esc(k)}">${esc(v)}</button>`).join('')}</div>
      <div class="w-scroll" data-s="tasks">${st.taskFilter === 'done' ? (list.length ? `<section class="w-card w-group"><div class="w-kick">Done · ${list.length}</div>${list.map((t) => taskRow(t)).join('')}</section>` : '')
        : groupCards(list)}${list.length ? '' : `<div class="w-empty center">${st.taskQuery ? 'Nothing matches.' : st.taskFilter === 'done' ? 'Nothing finished yet.' : 'All clear. Nice.'}</div>`}</div>`);
    patch('v-editor', editor(todos().find((t) => t.id === st.taskSel)));
  }

  function editor(t) {
    if (!t) return '<div class="w-empty center">Pick a task to edit it here.</div>';
    const subs = t.subtasks || [], on = t.done || t.finishing;
    const fri = dayStart((5 - new Date().getDay() + 7) % 7 || 7), mon = dayStart((1 - new Date().getDay() + 7) % 7 || 7);
    const dues = [['Today', dayStart()], ['Tomorrow', dayStart(1)], ['Fri', fri], ['Mon', mon]].filter(([, ms], i, a) => a.findIndex((x) => x[1] === ms) === i);
    const other = t.due && !dues.some(([, ms]) => ms === t.due);
    return `<div class="w-ed" data-s="editor">
      <div class="w-ed-h"><button class="w-check lg ${on ? 'done' : ''}" data-act="todo-toggle" data-id="${t.id}" aria-label="Done">${on ? icon('check') : ''}</button>
        <textarea class="w-ed-title" rows="1" data-k="title:${t.id}" data-enter="task-title" data-id="${t.id}">${esc(t.text)}</textarea></div>
      <div class="w-ed-row"><span>Tag</span><div class="w-chips sm">${h.D.settings.tags.map((g) => `<button class="${t.tag === g ? 'on' : ''}" data-ws="task-tag" data-id="${t.id}" data-tag="${esc(g)}"><i style="background:${tagColor(g)}"></i>${esc(g)}</button>`).join('')}
        <button class="${t.tag ? '' : 'on'}" data-ws="task-tag" data-id="${t.id}" data-tag=""><i></i>None</button></div></div>
      <div class="w-ed-row"><span>Due</span><div class="w-chips sm">${dues.map(([label, ms]) => `<button class="${t.due === ms ? 'on' : ''}" data-ws="task-due" data-id="${t.id}" data-due="${ms}">${label}</button>`).join('')}
        ${other ? `<button class="on">${new Date(t.due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</button>` : ''}<button class="${t.due ? '' : 'on'}" data-ws="task-due" data-id="${t.id}" data-due="">None</button></div></div>
      ${(t.updates || []).map((u) => `<div class="w-upd"><span>${esc(u.note)}${u.from ? ` · ${esc(u.from.replace(/\s*<.*>/, ''))}` : ''}</span><button data-act="update-clear" data-id="${t.id}">Got it</button></div>`).join('')}
      ${t.source?.why ? `<div class="w-why">${esc(t.source.why)}</div>` : ''}
      <section class="w-card w-steps"><div class="w-kick">Steps${subs.length ? ` · ${subs.filter((x) => x.done).length} of ${subs.length}` : ''}</div>
        ${subs.map((x) => `<div class="w-step ${x.done ? 'done' : ''}"><button class="w-check ${x.done ? 'done' : ''}" data-act="sub-toggle" data-id="${t.id}" data-sid="${x.id}">${x.done ? icon('check') : ''}</button><span>${esc(x.text)}</span>
          <button class="w-ibtn" data-act="sub-del" data-id="${t.id}" data-sid="${x.id}" aria-label="Remove step">${icon('x')}</button></div>`).join('')}
        <label class="w-step add">${icon('plus')}<input data-k="step:${t.id}" data-enter="add-step" data-id="${t.id}" placeholder="Add a step" autocomplete="off"></label></section>
      <div class="w-kick pad">Notes</div>
      <textarea class="w-notes" data-k="notes:${t.id}" data-id="${t.id}" placeholder="Links, where things are, what's left.">${esc(t.notes || '')}</textarea>
      <div class="w-ed-f"><button class="w-btn focus" data-ws="focus-task" data-id="${t.id}">${icon('play')}Focus on this</button><button class="w-btn" data-ws="focus-task-desk" data-id="${t.id}">Focus on desk</button>
        <span class="grow"></span><button class="w-btn ghost coral" data-act="todo-del" data-id="${t.id}">Delete</button></div>
    </div>`;
  }

  async function patchTask(id, body) {
    const t = h.D.todos.find((x) => x.id === id);
    if (!t) return;
    Object.assign(t, body);
    render();
    await api('PATCH', `/api/todos/${id}`, body);
  }

  // ---------------------------------------------------------------------------
  // Journal
  // ---------------------------------------------------------------------------

  let daysTimer = null;
  async function loadDays() {
    const q = st.jQuery;
    st.jLoading = true;
    try { const r = await api('GET', `/api/journal/days?q=${encodeURIComponent(q)}`); if (q === st.jQuery) st.jDays = { q, days: r.days }; }
    catch (err) { st.jDays = { q, days: [], error: err.message }; }
    st.jLoading = false;
    if (st.view === 'journal') render();
  }
  function mark(text, q) {
    if (!q) return esc(text);
    const lower = text.toLowerCase(), needle = q.toLowerCase();
    let out = '', i = 0;
    for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, i)) { out += `${esc(text.slice(i, at))}<mark>${esc(text.slice(at, at + needle.length))}</mark>`; i = at + needle.length; }
    return out + esc(text.slice(i));
  }

  function journal() {
    const D = h.D, q = st.jQuery, days = st.jDays?.days || [];
    if (!st.jDays && !st.jLoading) loadDays();
    if (!days.some((d) => d.date === st.jSel)) st.jSel = days[0]?.date || null;
    const KIND = { reflection: ['Reflection', 'violet'], note: ['Voice note', 'pink'], daynote: ['Day note', 'blue'] };
    const matches = days.reduce((n, d) => n + d.matches, 0);
    patch('v-days', `<label class="w-search">${icon('search')}<input data-k="jsearch" data-input="j-search" placeholder="Search notes and days" autocomplete="off" value="${esc(q)}"></label>
      <div class="w-chips sm">${D.settings.tags.map((c) => `<button class="${q.toLowerCase() === c.toLowerCase() ? 'on' : ''}" data-ws="j-chip" data-q="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="w-jline">${!st.jDays ? 'Loading…' : q ? `${matches} match${matches === 1 ? '' : 'es'} across ${days.length} day${days.length === 1 ? '' : 's'}` : `${days.length} day${days.length === 1 ? '' : 's'} · newest first`}</div>
      <div class="w-scroll" data-s="days">${days.map((d) => `<button class="w-day ${d.date === st.jSel ? 'on' : ''}" data-ws="j-day" data-date="${d.date}">
        <div><b>${esc(d.label)}</b><span>${q && d.matches ? `${d.matches} match${d.matches === 1 ? '' : 'es'}` : `${d.entries.length} entr${d.entries.length === 1 ? 'y' : 'ies'}`}</span></div>
        <p>${mark(d.summary || d.note || d.entries[0]?.text || 'Nothing written this day.', q)}</p></button>`).join('') || `<div class="w-empty center">${q ? `Nothing matches “${esc(q)}”.` : 'Nothing recorded yet.'}</div>`}</div>`);

    const d = days.find((x) => x.date === st.jSel);
    if (!d) return patch('v-day', '<div class="w-empty center">Pick a day.</div>');
    const isToday = d.label === 'Today', r = D.recap;
    const summary = isToday ? (D.recapRunning ? 'Claude is writing up your day…' : r?.headline || '') : d.summary;
    const voice = d.entries.filter((e) => e.kind !== 'daynote'), notes = d.entries.filter((e) => e.kind === 'daynote');
    patch('v-day', `<div class="w-jd" data-s="jd">
      <div class="w-jd-h"><h2>${esc(isToday ? `Today, ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : d.label)}</h2>
        <span>${esc([`${d.entries.length} entr${d.entries.length === 1 ? 'y' : 'ies'}`, d.focusMinutes ? `${d.focusMinutes} min focus` : '', d.tasksDone ? `${d.tasksDone} task${d.tasksDone === 1 ? '' : 's'} done` : ''].filter(Boolean).join(' · '))}</span>
        <span class="grow"></span>${isToday ? `<button class="w-btn journal" data-ws="record">${icon('journal')}Record</button>` : ''}</div>
      ${summary || isToday ? `<section class="w-sum journal"><div class="w-kick pink">Day summary · Claude</div>
        ${summary ? `<p class="big">${mark(summary, q)}</p>` : `<p class="dim">${D.aiEnabled ? `Your recap arrives at ${esc(clock12(D.settings.recapAt))}, from your notes, tasks and focus time.` : 'Add ANTHROPIC_API_KEY to the Pi to get a recap of your day.'}</p>`}
        ${isToday && D.aiEnabled && !D.recapRunning ? `<button class="w-btn sm" data-act="recap-run">${r?.headline ? 'Redo' : 'Make it now'}</button>` : ''}</section>` : ''}
      ${isToday ? noteCard(true) : d.note ? `<section class="w-card w-pastnote"><div class="w-kick">Note</div><p>${mark(d.note, q)}</p></section>` : ''}
      ${notes.length ? `<section class="w-card w-entries"><div class="w-ch"><b>Notes from the desk</b></div>${notes.map((e) => `<div class="w-entry"><div><span>${hm(e.at)}</span></div><div><p>${mark(e.text, q)}</p></div></div>`).join('')}</section>` : ''}
      <section class="w-card w-entries"><div class="w-ch"><b>Voice notes</b>${isToday ? `<span class="w-dot ${D.voiceReady ? 'on' : ''}"><i></i>${D.voiceReady ? 'Ring connected' : 'Ring not set up'}</span>` : ''}</div>
        ${voice.map((e) => `<div class="w-entry"><div><span>${hm(e.at)}</span><em class="${(KIND[e.kind] || KIND.note)[1]}">${(KIND[e.kind] || KIND.note)[0]}</em></div>
          <div><p><b>${mark(e.text, q)}</b></p>${e.said && e.said !== e.text ? `<p class="said">“${mark(e.said, q)}”</p>` : ''}
            ${(e.done || []).map((x) => `<div class="w-did mint">${icon('check')}Done: ${mark(x, q)}</div>`).join('')}${(e.tasks || []).map((x) => `<div class="w-did amber">${icon('plus')}${mark(x, q)}</div>`).join('')}</div></div>`).join('')
          || `<div class="w-empty">${isToday ? 'Nothing yet today. Press R to record a note, or speak into the ring.' : 'No voice notes that day.'}</div>`}</section>
    </div>`);
  }

  let noteTimer = null;
  function saveNote(el) {
    clearTimeout(noteTimer);
    const meta = $('[data-note-meta]');
    if (meta) meta.textContent = 'Saving…';
    noteTimer = setTimeout(async () => {
      const text = el.value;
      try {
        await api('POST', '/api/journal/note', { text });
        h.D.dayNote = text; st.jDays = null;
        // Carry the saved text into the cached HTML so the next refresh doesn't swap the box under the caret.
        if (el.isConnected && el.value === text) { delete el.dataset.dirty; el.textContent = text; for (const k of ['v-needs', 'v-day']) { const r = root.querySelector(`[data-r="${k}"]`); if (r?.contains(el)) cache[k] = r.innerHTML; } }
        const m = $('[data-note-meta]'); if (m) m.textContent = noteMeta(text);
      } catch (err) { const m = $('[data-note-meta]'); if (m) m.textContent = `Not saved: ${err.message}`; }
    }, 700);
  }

  // ---------------------------------------------------------------------------
  // Calendar
  // ---------------------------------------------------------------------------

  function calendar() {
    const START = 8, END = 23, ROW = 40, now = Date.now();
    const all = events();
    const sel = all.find((e) => e.id === st.calSel);
    const days = Array.from({ length: 7 }, (_, o) => {
      const from = dayStart(o), to = dayStart(o + 1), d = new Date(from);
      const list = all.filter((e) => e.start < to && e.end >= from && (e.allDay ? e.start >= from : true));
      const cols = [];
      // Timed events that fall inside the hours the grid shows (a late night that ended at 3 AM doesn't belong at the top of the next morning).
      const allDay = list.filter((e) => e.allDay);
      const placed = list.filter((e) => !e.allDay && e.end > from + START * 3600e3 && e.start < from + (END + 1) * 3600e3).sort((a, b) => a.start - b.start).map((e) => {
        let c = cols.findIndex((end) => end <= e.start);
        if (c === -1) { c = cols.length; cols.push(0); }
        cols[c] = Math.max(e.end, e.start + 30 * 60e3);
        return { e, c };
      });
      const hourOf = (ms) => Math.min(END + 1, Math.max(START, (ms - from) / 3600e3));
      return `<div class="w-cal-col ${o === 0 ? 'today' : ''}">
        <div class="w-cal-dh"><span>${d.toLocaleDateString('en-US', { weekday: 'short' })}</span><b>${d.getDate()}</b>
          ${allDay.slice(0, 1).map((e) => `<button class="w-allday ${e.id === st.calSel ? 'sel' : ''}" data-ws="cal-select" data-id="${esc(e.id || '')}" title="${esc(allDay.map((x) => x.title).join(' · '))}">${esc(e.title)}${allDay.length > 1 ? ` +${allDay.length - 1}` : ''}</button>`).join('')}</div>
        <div class="w-cal-day" style="height:${(END - START + 1) * ROW}px">
          ${placed.map(({ e, c }) => { const top = (hourOf(e.start) - START) * ROW, hgt = Math.max(20, (hourOf(e.end) - hourOf(e.start)) * ROW - 2);
            return `<button class="w-ev ${e.id === st.calSel ? 'sel' : ''} ${e.end < now ? 'past' : ''}" data-ws="cal-select" data-id="${esc(e.id || '')}" style="top:${top.toFixed(1)}px;height:${hgt.toFixed(1)}px;left:calc(${((c / cols.length) * 100).toFixed(2)}% + 3px);width:calc(${(100 / cols.length).toFixed(2)}% - 6px)"><b>${esc(e.title)}</b><span>${hm(e.start)}</span></button>`; }).join('')}
          ${o === 0 && (now - from) / 3600e3 >= START && (now - from) / 3600e3 <= END + 1 ? `<div class="w-cal-now" style="top:${(((now - from) / 3600e3 - START) * ROW).toFixed(1)}px"><i></i></div>` : ''}
        </div></div>`;
    }).join('');
    const hours = Array.from({ length: END - START + 1 }, (_, i) => START + i);
    const REPLY = { yes: 'Going', no: 'Not going', maybe: 'Maybe', none: 'Not answered' };
    patch('v-cal', `<div class="w-cal-bar">${sel ? `${tile('schedule', 'var(--g-cal)')}<div class="grow"><b>${esc(sel.title)}</b>
          <span>${esc([new Date(sel.start).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }), sel.allDay ? 'All day' : `${hm(sel.start)} – ${hm(sel.end)}`, sel.location, sel.calendar, sel.organizer && !sel.organizedByMe ? `from ${sel.organizer}` : '', sel.myReply ? `you: ${REPLY[sel.myReply]}` : ''].filter(Boolean).join(' · '))}</span>
          ${sel.description ? `<p>${esc(sel.description.slice(0, 400))}</p>` : ''}</div><button class="w-ibtn" data-ws="cal-select" data-id="" aria-label="Close">${icon('x')}</button>`
        : `<span class="dim">Your calendars are connected read-only, so events are added and changed in Google Calendar. Click an event for its details.</span>`}</div>
      <section class="w-card w-cal"><div class="w-cal-scroll" data-s="cal">
        <div class="w-cal-grid"><div class="w-cal-gutter"><div class="w-cal-dh"></div>${hours.map((hr) => `<div style="height:${ROW}px"><span>${hr % 12 || 12} ${hr < 12 ? 'AM' : 'PM'}</span></div>`).join('')}</div>${days}</div>
      </div></section>`);
  }

  // ---------------------------------------------------------------------------
  // PayIt
  // ---------------------------------------------------------------------------

  // PayIt Plus: merchants paying for the plan, and what they paid this month (store prices, before Apple's cut).
  function subs(p) {
    const x = p.subscriptions;
    if (!x) return p.subscriptionsError ? `<section class="w-card w-subs"><div class="w-ch"><b>PayIt Plus</b></div><div class="w-empty">${esc(p.subscriptionsError)}</div></section>` : '';
    const extra = [x.inTrial ? `${x.inTrial} in trial` : '', x.billingIssues ? `${x.billingIssues} billing issue${x.billingIssues > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
    return `<section class="w-card w-subs"><div class="w-ch"><b>PayIt Plus</b><span>${extra}</span></div>
      <div class="w-subs-row"><div><b>${x.paying}</b><span>paying subscribers</span></div>
        <div><b class="mint">${money(x.monthCents)}</b><span>from ${x.paidThisMonth} payment${x.paidThisMonth === 1 ? '' : 's'} this month · before Apple's cut</span></div></div></section>`;
  }

  function payit() {
    const s = h.D.payit;
    if (!s?.data) return patch('v-pay', `<div class="w-empty center">${s?.configured === false ? 'PayIt isn\'t set up on the hub yet.' : esc(s?.error || 'Loading…')}</div>`);
    const p = s.data, t = p.today;
    const delta = p.yesterdaySameTimeCents ? Math.round(((t.grossCents - p.yesterdaySameTimeCents) / p.yesterdaySameTimeCents) * 100) : null;
    const hours = p.hourly.slice(0, new Date().getHours() + 1);
    const hl = (x) => `${x % 12 || 12}${x < 12 ? 'a' : 'p'}`;
    const providers = Object.entries(t.byProvider).sort((a, b) => b[1] - a[1]), provMax = Math.max(1, ...providers.map(([, v]) => v));
    const provName = { stripe: 'Card (Stripe)', cash: 'Cash', ath_movil: 'ATH Móvil' };
    const card = t.grossCents ? Math.round(((t.byProvider.stripe || 0) / t.grossCents) * 100) : 0;
    const bad = p.systems.filter((x) => x.status !== 'up'), down = bad.filter((x) => x.status === 'down').length;
    const ticks = [...new Set([0, Math.round((hours.length - 1) / 3), Math.round(((hours.length - 1) * 2) / 3), hours.length - 1])];
    patch('v-pay', `<div class="w-kpis">
        <section class="w-kpi hero"><div class="w-kick">Gross today</div><div><b>${money(t.grossCents)}</b>${delta !== null ? `<em class="${delta >= 0 ? '' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}%</em>` : ''}</div>
          <span>${p.yesterdaySameTimeCents ? `vs. ${money(p.yesterdaySameTimeCents)} by now` : 'no sales yesterday by now'}${p.profit ? ` · kept ${money(p.profit.todayCents, true)}` : ''}</span></section>
        <section class="w-kpi"><div class="w-kick">Sales</div><div><b>${t.count}</b></div><span>${t.newBusinesses ? `${t.newBusinesses} new business${t.newBusinesses > 1 ? 'es' : ''} today` : 'today'}</span></section>
        <section class="w-kpi"><div class="w-kick">Avg ticket</div><div><b>${money(t.avgTicketCents, true)}</b></div><span>Card ${card}% of volume</span></section>
        <section class="w-kpi"><div class="w-kick">Merchants</div><div><b>${t.activeMerchants}</b></div><span>active today</span></section>
        <section class="w-kpi ${t.declined ? 'warn' : ''}"><div class="w-kick">Declined</div><div><b>${t.declined}</b></div><span>${t.refunded} refunded</span></section>
      </div>
      ${subs(p)}
      <div class="w-pay2">
        <section class="w-card"><div class="w-ch"><b>By hour</b></div>${h.barChart('hourly', hours, (x) => `${hl(x)}–${hl((x + 1) % 24)}`, 5)}<div class="bar-axis">${ticks.map((x) => `<span>${hl(x)}</span>`).join('')}</div></section>
        <section class="w-card"><div class="w-ch"><b>Latest transactions</b></div>
          ${(p.recent || []).slice(0, 8).map((x) => `<div class="w-txn ${esc(x.status)}"><div class="grow"><b>${esc(provName[x.provider] || x.provider)}</b><span>${ago(x.at) === 'now' ? 'just now' : `${ago(x.at)} ago`} · ${hm(Date.parse(x.at))}</span></div>${x.status === 'completed' ? '' : `<em>${esc(x.status)}</em>`}<strong>${money(x.cents, true)}</strong></div>`).join('')
            || '<div class="w-empty">No payments this week yet.</div>'}</section>
      </div>
      <div class="w-pay2">
        <section class="w-card"><div class="w-ch"><b>Last 7 days</b><span>${money(p.week.reduce((a, d) => a + d.cents, 0))}${p.profit ? ` · kept ${money(p.profit.weekCents, true)}` : ''}</span></div>
          ${h.barChart('week', p.week.map((d) => d.cents), (i) => (i === p.week.length - 1 ? 'Today' : new Date(p.week[i].date).toLocaleDateString('en-US', { weekday: 'long' })), 8)}
          <div class="bar-axis even">${p.week.map((d) => `<span>${new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' })}</span>`).join('')}</div></section>
        <section class="w-card"><div class="w-ch"><b>By payment method</b></div>
          ${providers.map(([k, v]) => `<div class="w-method"><span>${esc(provName[k] || k)}</span><i><u style="width:${((v / provMax) * 100).toFixed(1)}%"></u></i><b>${money(v)}</b></div>`).join('') || '<div class="w-empty">No sales yet today.</div>'}
          <p class="w-foot-note">${p.excludedProviders?.length ? `${esc(p.excludedProviders.map((k) => provName[k] || k).join(' and '))} sales aren't counted. ` : ''}The hub shows totals and the latest payments (amount, method, status). Who paid, payouts and refunds stay in the PayIt admin panel.</p></section>
      </div>
      <section class="w-card w-fold ${st.sysOpen ? 'open' : ''}"><button class="w-ch w-fold-h" data-ws="sys-fold"><b>Systems</b><span class="w-dot ${down ? 'bad' : bad.length ? 'warn' : 'on'}"><i></i>${down ? `${down} down` : bad.length ? `${bad.length} degraded` : 'all up'}</span>${h.icon('chev')}</button>
        ${st.sysOpen ? p.systems.map((x) => `<div class="w-sys"><i class="${esc(x.status)}"></i><div class="grow"><b>${esc(x.system.replace(/_/g, ' '))}</b><span>${x.detail ? esc(x.detail) : ago(x.checked_at) === 'now' ? 'checked just now' : `checked ${ago(x.checked_at)} ago`}</span></div><em class="${esc(x.status)}">${esc(x.status)}</em></div>`).join('')
          || '<div class="w-empty">No checks in the last 3 hours.</div>' : ''}</section>`);
  }

  // ---------------------------------------------------------------------------
  // Focus
  // ---------------------------------------------------------------------------

  function focus() {
    const D = h.D, desk = st.focusWhere === 'desk';
    const active = localActive(), isFocus = T.phase === 'focus';
    const mins = h.phaseMinutes(T.phase), max = h.dialMax(T.phase);
    const dt = deskTimer();
    const dMins = st.deskMinutes || D.settings.focusMinutes;
    let stage;
    if (!desk) {
      stage = `<div class="w-dial ${isFocus ? '' : 'break'}" data-dial>${h.ring(290, 12, active ? 1 - h.tLeft() / h.tTotal() : mins / max, isFocus ? 'url(#g-focus)' : 'url(#g-cal)', !active, true)}
          <div><span class="w-kick">${esc(isFocus ? `Session ${T.cycle + 1}` : h.PHASES[T.phase])}</span><b ${active ? 'data-timer' : ''}>${h.fmtLeft(active ? h.tLeft() : mins * 60e3)}</b>
            <span class="${active && !T.running ? 'amber' : ''}">${T.running ? `Ends ${hm(T.endsAt)}` : active ? 'Paused' : `Ends ${hm(Date.now() + mins * 60e3)}`}</span></div></div>
        ${active ? `<div class="w-fbtns">${T.running ? '<button class="w-btn lg" data-act="t-pause">Pause</button>' : '<button class="w-btn lg primary" data-act="t-start">Resume</button>'}
            <button class="w-btn lg" data-act="t-adj" data-min="5">+5 min</button><button class="w-btn lg" data-act="t-skip">End</button></div>`
          : `<div class="w-presets">${h.dialPresets(T.phase).map((m) => `<button class="${m === mins ? 'on' : ''}" data-act="t-set" data-min="${m}">${m}</button>`).join('')}</div>
            <button class="w-begin" data-act="t-start">${isFocus ? 'Begin' : 'Start break'}</button>
            <div class="w-phases">${Object.entries(h.PHASES).map(([k, v]) => `<button class="${T.phase === k ? 'on' : ''}" data-act="t-phase" data-phase="${k}">${v}</button>`).join('')}</div>`}`;
    } else if (!D.desk?.online) {
      stage = '<div class="w-empty center">The desk screen isn\'t answering right now, so a session can\'t be started on it from here.</div>';
    } else if (dt) {
      stage = `<div class="w-dial">${h.ring(290, 12, deskLeft(dt) / (dt.total || 1), 'url(#g-focus)', true, false)}
          <div><span class="w-kick">On the desk · ${esc(h.PHASES[dt.phase] || 'Focus')}</span><b data-desk-timer>${h.fmtLeft(deskLeft(dt))}</b><span class="${dt.running ? '' : 'amber'}">${dt.running ? `Ends ${hm(dt.endsAt)}` : 'Paused'}</span></div></div>
        <div class="w-fbtns">${dt.running ? '<button class="w-btn lg" data-ws="desk-timer" data-action="pause">Pause</button>' : '<button class="w-btn lg primary" data-ws="desk-timer" data-action="resume">Resume</button>'}
          <button class="w-btn lg" data-ws="desk-timer" data-action="end">End</button></div>
        ${dt.label ? `<p class="w-foot-note center">${esc(dt.label)}</p>` : ''}`;
    } else {
      stage = `<div class="w-dial">${h.ring(290, 12, dMins / 90, 'url(#g-focus)', true, true)}
          <div><span class="w-kick">On the desk</span><b>${h.fmtLeft(dMins * 60e3)}</b><span>${esc(T.label || 'Nothing in particular')}</span></div></div>
        <div class="w-presets">${[15, 25, 45, 60, 90].map((m) => `<button class="${m === dMins ? 'on' : ''}" data-ws="desk-min" data-min="${m}">${m}</button>`).join('')}</div>
        <button class="w-begin" data-ws="desk-begin">Begin on the desk</button>
        <p class="w-foot-note center">The desk screen switches to its focus lock and counts down there.</p>`;
    }
    patch('v-timer', `<section class="w-card w-focus"><div class="w-seg"><button class="${desk ? '' : 'on'}" data-ws="focus-where" data-where="here">This computer</button><button class="${desk ? 'on' : ''}" data-ws="focus-where" data-where="desk">On the desk</button></div>${stage}</section>`);

    const open = openTodos().slice(0, 7), sessions = (D.focus.today || []).slice().reverse();
    const week = D.focus.week, wmax = Math.max(1, ...week.map((d) => d.minutes));
    patch('v-fside', `<section class="w-card w-work"><div class="w-kick">Working on</div>
        <button class="${T.label ? '' : 'on'}" data-act="t-label" data-label=""><i></i><span>Nothing in particular</span></button>
        ${open.map((t) => { const subs = t.subtasks || []; return `<button class="${T.label === t.text ? 'on' : ''}" data-act="t-label" data-label="${esc(t.text)}"><i></i><span>${esc(t.text)}</span><em>${esc(subs.length ? `${subs.filter((x) => x.done).length}/${subs.length}` : dueLabel(t)?.[0] || t.tag || '')}</em></button>`; }).join('')}</section>
      <section class="w-card w-sessions"><div class="w-ch"><b>Sessions today</b><span>${D.focus.todayMinutes} min · ${D.focus.todaySessions} session${D.focus.todaySessions === 1 ? '' : 's'}</span></div>
        ${sessions.map((f) => `<div><span>${hm(f.at - f.minutes * 60e3)}</span><b>${f.minutes} min</b><p>${esc(f.label || 'Nothing in particular')}</p><em>${f.where || ''}</em></div>`).join('') || '<div class="w-empty">No sessions yet today.</div>'}</section>
      <section class="w-card w-week"><div class="w-ch"><b>This week</b><span>${week.reduce((a, d) => a + d.minutes, 0)} min</span></div>
        <div class="w-wbars">${week.map((d, i) => `<div title="${d.minutes} min"><i class="${i === week.length - 1 ? 'on' : ''}" style="height:${Math.max(3, (d.minutes / wmax) * 100).toFixed(1)}%"></i><span>${new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' })}</span></div>`).join('')}</div></section>`);
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  function settings() {
    const D = h.D, s = D.settings, sys = D.system;
    const row = (label, hint, control) => `<div class="w-set"><div class="grow"><b>${label}</b>${hint ? `<span>${hint}</span>` : ''}</div>${control}</div>`;
    const toggle = (k) => `<button class="toggle sm ${s[k] ? 'on' : ''}" data-act="set-toggle" data-k="${k}" aria-pressed="${Boolean(s[k])}"></button>`;
    const step = (k, shown) => `<div class="w-stepper"><button data-act="set-step" data-k="${k}" data-d="-1">−</button><b>${esc(shown)}</b><button data-act="set-step" data-k="${k}" data-d="1">+</button></div>`;
    const key = (...k) => `<span class="w-keys">${k.map((x) => `<kbd>${x}</kbd>`).join('')}</span>`;
    const stat = (text, ok = true) => `<span class="w-stat ${ok ? '' : 'off'}">${text}</span>`;
    const card = (title, rows) => `<section class="w-card w-setcard"><div class="w-kick">${title}</div>${rows.filter(Boolean).join('')}</section>`;
    const accounts = D.mail?.data?.accounts || [];
    patch('v-set', `<div class="w-setgrid">
      ${card('Your desk', [
        row(esc(sys.host), '', stat(`${sys.tempC != null ? `${sys.tempC.toFixed(0)}°C · ` : ''}up ${sys.uptimeH}h · ${D.desk?.online ? (D.mode === 'day' ? 'awake' : 'asleep') : 'screen offline'}`, Boolean(D.desk?.online))),
        row('Desk text size', 'Bigger text for reading from your chair', `<div class="w-seg sm">${[100, 115, 130, 140].map((v) => `<button class="${(s.textSize || 115) === v ? 'on' : ''}" data-ws="text-size" data-v="${v}">${v}%</button>`).join('')}</div>`),
        row('Brightness', `${s.dayBrightness}%`, `<input type="range" min="10" max="100" value="${s.dayBrightness}" style="--pct:${(((s.dayBrightness - 10) / 90) * 100).toFixed(1)}%" data-act="set-range" data-k="dayBrightness">`),
        row('Wind down', 'The desk dims and puts mail and PayIt away', toggle('windDown')),
        row('Wind down starts', '', step('windDownAt', clock12(s.windDownAt))),
        row('Sleep at', s.autoSleep ? '' : 'Automatic sleep is off', step('sleepAt', clock12(s.sleepAt))),
        row('Wake at', '', step('wakeAt', clock12(s.wakeAt))),
        row('Morning brief', 'Sunrise screen with your day', toggle('morningBrief')),
        row('Return to Home', 'When the desk is left on another page', step('homeAfter', s.homeAfter ? `after ${s.homeAfter} min` : 'Never')),
        row('Desk screen', D.mode === 'day' ? 'Awake' : 'Asleep', `<button class="w-btn" data-act="mode" data-mode="${D.mode === 'day' ? 'sleep' : 'day'}">${D.mode === 'day' ? 'Put to sleep' : 'Wake'}</button>`),
        D.canRestart ? row('Restart the Pi', 'Back in about a minute', '<button class="w-btn danger" data-act="restart-pi">Restart</button>') : '',
      ])}
      ${card('This computer', [
        row('Show voice-note results here', 'What the ring heard and what the hub did with it', `<button class="toggle sm ${h.ringOff() ? '' : 'on'}" data-act="ring-toggle"></button>`),
        row('Recording', window.SpeechRecognition || window.webkitSpeechRecognition ? 'Press R anywhere. Speech is turned into text by this browser.' : 'This browser can\'t turn speech into text; R opens a box to type the note instead.', stat(window.SpeechRecognition || window.webkitSpeechRecognition ? 'Ready' : 'Typing only', Boolean(window.SpeechRecognition || window.webkitSpeechRecognition))),
        row('Install as an app', 'In Chrome or Edge: the install icon at the right of the address bar', stat(matchMedia('(display-mode: standalone)').matches ? 'Installed' : 'In a browser tab')),
        D.signedIn ? row('Signed in on this computer', '', '<button class="w-btn" data-act="logout">Sign out</button>') : '',
      ])}
      ${card('Mail, Claude and focus', [
        row('Email digest at', "Claude's summary of the last 24 hours", step('digestAt', clock12(s.digestAt))),
        row('Day recap at', 'From your notes, tasks and focus time', step('recapAt', clock12(s.recapAt))),
        row('Tasks from email', 'Checked hourly; you approve new ones', toggle('emailTasks')),
        row('Focus length', '', step('focusMinutes', `${s.focusMinutes} min`)),
        row('Short break', '', step('shortBreak', `${s.shortBreak} min`)),
        row('Long break', '', step('longBreak', `${s.longBreak} min`)),
      ])}
      ${card('Keyboard', [
        row('Command palette', '', key('⌘K', '/')), row('Record a voice note', '', key('R')), row('New task', '', key('N')), row('Switch view', '', key('1', '–', '8')),
        row('Inbox: move · draft · done · task', '', key('J', 'K', 'D', 'E', 'T')), row('Tasks: move · complete selected', '', key('J', 'K', 'X')), row('Close or leave a field', '', key('Esc')),
      ])}
      ${card('Connected', [
        row('Calendar', 'Read-only feeds', stat(D.calendar?.configured === false ? 'Not set up' : D.calendar?.error ? 'Error' : 'Connected', D.calendar?.configured !== false && !D.calendar?.error)),
        ...accounts.map((a) => row(`${esc(a.name)} mail`, 'Read-only', stat(a.needsSignIn ? 'Not signed in' : a.error ? 'Error' : 'Connected', !a.needsSignIn && !a.error))),
        row('PayIt', 'Totals and system checks', stat(D.payit?.configured === false ? 'Not set up' : D.payit?.error ? 'Error' : 'Connected', D.payit?.configured !== false && !D.payit?.error)),
        row('Claude', 'Summaries, digest, recap, drafts', stat(D.aiEnabled ? 'Connected' : 'No API key', Boolean(D.aiEnabled))),
        row('Ring', 'Voice notes', stat(D.voiceReady ? 'Paired' : 'Not set up', Boolean(D.voiceReady))),
      ])}
    </div>`);
  }

  // ---------------------------------------------------------------------------
  // Views: static shells with regions, and what fills them
  // ---------------------------------------------------------------------------

  const SHELL = {
    today: '<div class="w-today"><div class="w-col left" data-r="v-left" data-s="left"></div><div class="w-col mid" data-r="v-ttasks" data-s="mid"></div><div class="w-col right" data-s="right"><div data-r="v-needs"></div><div data-r="v-note"></div></div></div>',
    inbox: '<div class="w-inbox"><div class="w-folders" data-r="v-folders"></div><div class="w-listcol" data-r="v-list"></div><div class="w-readcol" data-r="v-reader"></div></div>',
    tasks: '<div class="w-tasks"><div class="w-taskcol" data-r="v-tasks"></div><div class="w-edcol" data-r="v-editor"></div></div>',
    journal: '<div class="w-journal"><div class="w-daycol" data-r="v-days"></div><div class="w-jcol" data-r="v-day"></div></div>',
    calendar: '<div class="w-calview" data-r="v-cal"></div>',
    payit: '<div class="w-payview" data-r="v-pay" data-s="pay"></div>',
    focus: '<div class="w-focusview"><div data-r="v-timer"></div><div class="w-fside" data-r="v-fside" data-s="fside"></div></div>',
    settings: '<div class="w-setview" data-r="v-set"></div>',
  };
  const VIEW = {
    today() { patch('v-left', todayLeft()); patch('v-ttasks', todayTasks()); patch('v-needs', todayNeeds()); patch('v-note', noteCard()); },
    inbox, tasks, journal, calendar, payit, focus, settings,
  };

  // ---------------------------------------------------------------------------
  // Overlays: alerts, the command palette, the recorder
  // ---------------------------------------------------------------------------

  function commands(q) {
    const D = h.D, out = [], text = q.trim();
    const cmd = (ic, bg, label, hint, run) => out.push({ ic, bg, label, hint, run });
    if (text) {
      const t = parseTask(text);
      if (t.text) cmd('plus', 'var(--g-tasks)', `Add task “${t.text}”`, [t.tag, t.due ? dueLabel(t)?.[0] : ''].filter(Boolean).join(' · ') || 'task', () => addTask(text));
      cmd('journal', 'var(--g-journal)', 'Add to today\'s note', 'journal', async () => { const next = `${h.D.dayNote ? `${h.D.dayNote.replace(/\s+$/, '')}\n` : ''}${text}`; await api('POST', '/api/journal/note', { text: next }); h.D.dayNote = next; st.jDays = null; delete cache['v-note']; h.toast({ level: 'info', source: 'journal', title: 'Added to today\'s note' }); render(); });
      cmd('search', 'var(--g-journal)', `Search journal for “${text}”`, 'journal', () => { st.jQuery = text; st.jDays = null; go('journal'); });
      cmd('search', 'var(--g-mail)', `Search inbox for “${text}”`, 'inbox', () => { st.mailQuery = text; st.mailFolder = 'all'; go('inbox'); });
      for (const t2 of openTodos().filter((x) => x.text.toLowerCase().includes(text.toLowerCase())).slice(0, 3)) cmd('tasks', 'var(--g-tasks)', t2.text, 'open task', () => { st.taskFilter = 'open'; st.taskQuery = ''; st.taskSel = t2.id; go('tasks'); });
    }
    const fixed = [];
    const add = (ic, bg, label, hint, run) => fixed.push({ ic, bg, label, hint, run });
    add('journal', 'var(--g-journal)', 'Record a voice note', 'R', () => startRec());
    add('focus', 'var(--g-focus)', `Start focus · ${D.settings.focusMinutes} min here`, 'focus', () => { st.focusWhere = 'here'; go('focus'); if (!localActive()) { if (T.phase !== 'focus') h.timerReset('focus'); h.timerStart(); } });
    add('focus', 'var(--g-focus)', `Start focus · ${D.settings.focusMinutes} min on the desk`, 'desk', () => deskFocus(D.settings.focusMinutes, T.label));
    for (const [k, label, ic] of DESK_VIEWS) add(ic, 'var(--g-cal)', `Show ${label} on the desk`, 'desk', () => deskView(k));
    add('moon', 'var(--g-cal)', D.mode === 'day' ? 'Put the desk to sleep' : 'Wake the desk', 'desk', async () => { await api('POST', '/api/mode', { mode: D.mode === 'day' ? 'sleep' : 'day' }); h.load(); });
    add('reset', 'var(--g-home)', 'Refresh mail, PayIt, calendar and weather', 'hub', async () => { await api('POST', '/api/refresh'); setTimeout(h.load, 3000); h.toast({ level: 'info', source: 'system', title: 'Refreshing…' }); });
    NAV.forEach(([k, label, ic, bg], i) => add(ic, bg, `Go to ${label}`, String(i + 1), () => go(k)));
    const needle = text.toLowerCase();
    return [...out, ...fixed.filter((c) => !needle || c.label.toLowerCase().includes(needle))].slice(0, 11);
  }

  function overlays() {
    const D = h.D;
    let html = '';
    if (st.alertsOpen) {
      const alerts = D.alerts || [];
      html += `<div class="w-scrim clear" data-ws="close-over"></div><section class="w-alerts"><div class="w-ch"><b>Alerts</b><span>${alerts.length ? `${alerts.length} open` : ''}</span></div>
        ${alerts.map((a) => `<div class="w-alert">${tile(h.SRC_ICON[a.source] || 'bell', a.level === 'error' ? 'var(--g-bad)' : a.level === 'warn' ? 'var(--g-focus)' : 'var(--g-cal)', 'lg')}
          <div class="grow"><b>${esc(a.title.charAt(0).toUpperCase() + a.title.slice(1))}</b>${a.body ? `<p>${esc(a.body)}</p>` : ''}</div><button class="w-ibtn" data-act="dismiss" data-id="${esc(a.id)}" aria-label="Dismiss">${icon('x')}</button></div>`).join('')
          || '<div class="w-empty center">Nothing needs your attention.</div>'}</section>`;
    }
    if (st.palette) {
      const list = commands(st.palette.q);
      st.palette.idx = Math.min(st.palette.idx, Math.max(0, list.length - 1));
      html += `<div class="w-scrim" data-ws="close-over"></div><section class="w-palette">
        <label>${icon('search')}<input data-k="palette" data-input="palette" placeholder="Type a command, a task to add, or something to find" autocomplete="off" value="${esc(st.palette.q)}"><kbd>esc</kbd></label>
        <div>${list.map((c, i) => `<button class="${i === st.palette.idx ? 'on' : ''}" data-ws="palette-run" data-i="${i}">${tile(c.ic, c.bg)}<span>${esc(c.label)}</span><em>${esc(c.hint)}</em></button>`).join('')}</div>
        <p>↑↓ choose · ↵ run · #tag and !today !tomorrow !fri work when adding a task</p></section>`;
    }
    if (st.rec) {
      html += `<section class="w-recorder">
        <div class="w-rec-h"><i></i><b>${st.rec.typed ? 'Type a note' : 'Recording'}</b><span data-rec-time>0:00</span><span class="grow"></span><span class="dim">${st.rec.typed ? 'saved like a voice note' : 'from this computer'}</span></div>
        ${st.rec.typed ? '' : '<canvas width="1060" height="112"></canvas>'}
        ${st.rec.typed ? `<p class="w-rec-note">${esc(st.rec.why || '')}</p><textarea data-k="rec-typed" placeholder="What's on your mind? Say what you need to do and it lands in Tasks."></textarea>`
          : '<div class="w-rec-t"><span data-rec-text></span><i></i></div>'}
        <div class="w-rec-f"><button class="w-btn" data-ws="rec-cancel">Cancel<kbd>esc</kbd></button><span class="grow"></span><button class="w-btn journal" data-ws="rec-save">Stop and save<kbd>↵</kbd></button></div>
      </section>`;
    }
    return html;
  }

  function openPalette() {
    st.palette = { q: '', idx: 0 }; st.alertsOpen = false;
    render();
    $('[data-k="palette"]')?.focus();
  }
  function runPalette(i) {
    const c = commands(st.palette.q)[i];
    st.palette = null;
    render();
    Promise.resolve(c?.run()).catch((err) => h.toast({ level: 'error', source: 'system', title: 'That didn\'t work', body: err.message }));
  }

  // ---- Recording on this computer: the mic for the waveform, the browser's speech recognition for the words.
  let recParts = null;
  async function startRec() {
    if (st.rec) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    st.palette = null;
    if (!SR) { st.rec = { at: Date.now(), typed: true, why: 'This browser can\'t turn speech into text, so type the note instead.' }; render(); $('[data-k="rec-typed"]')?.focus(); recLoop(); return; }
    st.rec = { at: Date.now(), final: '', interim: '' };
    render();
    recParts = { levels: [], stream: null, ctx: null, sr: null };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!st.rec) { stream.getTracks().forEach((t) => t.stop()); return; }
      const ctx = new AudioContext(), analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      Object.assign(recParts, { stream, ctx, analyser, data: new Float32Array(analyser.fftSize) });
    } catch (err) {
      stopRec();
      st.rec = { at: Date.now(), typed: true, why: `The microphone isn't available (${err.name === 'NotAllowedError' ? 'permission was declined' : err.message}), so type the note instead.` };
      render(); $('[data-k="rec-typed"]')?.focus(); recLoop(); return;
    }
    const sr = new SR();
    sr.continuous = true; sr.interimResults = true; sr.lang = navigator.language || 'en-US';
    sr.onresult = (e) => {
      if (!st.rec) return;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) st.rec.final += `${r[0].transcript.trim()} `; else interim += r[0].transcript; }
      st.rec.interim = interim;
      const el = $('[data-rec-text]'); if (el) el.textContent = `${st.rec.final}${interim}`;
    };
    sr.onerror = (e) => { if (st.rec && e.error !== 'no-speech' && e.error !== 'aborted') { const el = $('[data-rec-text]'); if (el && !st.rec.final) el.textContent = `Speech-to-text stopped (${e.error}). Stop and save keeps what was heard.`; } };
    sr.onend = () => { if (st.rec && recParts?.sr === sr) { try { sr.start(); } catch {} } };
    recParts.sr = sr;
    try { sr.start(); } catch {}
    recLoop();
  }
  function recLoop() {
    if (!st.rec) return;
    requestAnimationFrame(recLoop);
    const secs = Math.floor((Date.now() - st.rec.at) / 1000), t = $('[data-rec-time]');
    if (t) t.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const cv = $('.w-recorder canvas');
    if (!cv || !recParts?.analyser) return;
    const now = performance.now();
    if (now - (recParts.last || 0) > 70) {
      recParts.last = now;
      recParts.analyser.getFloatTimeDomainData(recParts.data);
      let sum = 0; for (const v of recParts.data) sum += v * v;
      recParts.levels.push(Math.min(1, Math.sqrt(sum / recParts.data.length) * 6));
      if (recParts.levels.length > 58) recParts.levels.shift();
    }
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, n = 58, bw = W / n;
    g.clearRect(0, 0, W, H);
    const grad = g.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, '#FF9DB0'); grad.addColorStop(1, '#FF9354');
    const off = n - recParts.levels.length;
    for (let i = 0; i < n; i++) {
      const v = i >= off ? recParts.levels[i - off] : 0, bh = Math.max(6, v * (H - 8));
      g.fillStyle = i === n - 1 && recParts.levels.length ? '#fff' : i >= off ? grad : '#262B33';
      g.beginPath(); g.roundRect(i * bw + bw * 0.22, (H - bh) / 2, bw * 0.56, bh, bw * 0.28); g.fill();
    }
  }
  function stopRec() {
    if (recParts) {
      const p = recParts; recParts = null;
      try { p.sr && (p.sr.onend = null, p.sr.stop()); } catch {}
      p.stream?.getTracks().forEach((t) => t.stop());
      p.ctx?.close().catch(() => {});
    }
  }
  async function saveRec() {
    if (!st.rec) return;
    const text = (st.rec.typed ? $('[data-k="rec-typed"]')?.value || '' : `${st.rec.final}${st.rec.interim}`).trim();
    stopRec(); st.rec = null; render();
    if (!text) { h.toast({ level: 'info', source: 'journal', title: 'Nothing to save', body: 'No words were picked up.' }); return; }
    try {
      const res = await fetch('/api/voice', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-source': 'computer' }, body: JSON.stringify({ text }) });
      if (!res.ok) throw new Error(`the hub answered ${res.status}`);
      st.jDays = null;
    } catch (err) { h.toast({ level: 'error', source: 'journal', title: 'The note wasn\'t saved', body: err.message }); }
  }
  function cancelRec() { stopRec(); st.rec = null; render(); }

  // ---------------------------------------------------------------------------
  // Steering the desk screen
  // ---------------------------------------------------------------------------

  const deskOffline = () => { if (h.D.desk?.online) return false; h.toast({ level: 'warn', source: 'system', title: 'The desk screen isn\'t answering', body: 'It may be asleep or restarting.' }); return true; };
  async function deskView(view) {
    if (deskOffline()) return;
    await api('POST', '/api/desk/view', { view });
    h.toast({ level: 'info', source: 'system', title: `Desk shows ${view}` });
  }
  async function deskFocus(minutes, label) {
    if (deskOffline()) return;
    await api('POST', '/api/desk/focus', { minutes, label: label || '' });
    st.focusWhere = 'desk';
    h.toast({ level: 'info', source: 'focus', title: `Focus started on the desk · ${minutes} min`, body: label || '' });
    go('focus');
  }

  // ---------------------------------------------------------------------------
  // Interactions
  // ---------------------------------------------------------------------------

  root.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-ws]');
    if (!el) return;
    const a = el.dataset.ws, id = el.dataset.id;
    try {
      switch (a) {
        case 'go': go(el.dataset.view); break;
        case 'palette': openPalette(); break;
        case 'palette-run': runPalette(Number(el.dataset.i)); break;
        case 'close-over': st.palette = null; st.alertsOpen = false; render(); break;
        case 'sys-fold': st.sysOpen = !st.sysOpen; render(); break;
        case 'alerts': st.alertsOpen = !st.alertsOpen; st.palette = null; render(); break;
        case 'record': startRec(); break;
        case 'rec-save': saveRec(); break;
        case 'rec-cancel': cancelRec(); break;
        case 'desk-view': await deskView(el.dataset.view); break;
        case 'desk-min': st.deskMinutes = Number(el.dataset.min); render(); break;
        case 'desk-begin': await deskFocus(st.deskMinutes || h.D.settings.focusMinutes, T.label); break;
        case 'desk-timer': if (!deskOffline()) await api('POST', '/api/desk/timer', { action: el.dataset.action }); break;
        case 'focus-desk': st.focusWhere = 'desk'; go('focus'); break;
        case 'focus-where': st.focusWhere = el.dataset.where; render(); break;
        case 'focus-task': { const t = h.D.todos.find((x) => x.id === id); if (!t) break; T.label = t.text; h.saveT(); st.focusWhere = 'here'; go('focus'); if (!localActive()) { if (T.phase !== 'focus') h.timerReset('focus'); h.timerStart(); } break; }
        case 'focus-task-desk': { const t = h.D.todos.find((x) => x.id === id); if (t) await deskFocus(h.D.settings.focusMinutes, t.text); break; }
        case 'event': st.calSel = id || null; go('calendar'); break;
        case 'cal-select': st.calSel = id || null; render(); break;
        case 'need-dismiss': st.dismissed[id] = Date.now(); for (const [k, at] of Object.entries(st.dismissed)) if (at < Date.now() - 14 * 86400e3) delete st.dismissed[k]; localStorage.setItem('wsDismissed', JSON.stringify(st.dismissed)); render(); break;
        case 'task-select': st.taskSel = id; if (st.view !== 'tasks') { st.taskFilter = 'open'; st.taskQuery = ''; go('tasks'); } else render(); break;
        case 'task-filter': st.taskFilter = el.dataset.f; render(); break;
        case 'task-tag': await patchTask(id, { tag: el.dataset.tag || null }); break;
        case 'task-due': await patchTask(id, { due: el.dataset.due ? Number(el.dataset.due) : null }); break;
        case 'mail-folder': st.mailFolder = el.dataset.f; render(); break;
        case 'mail-select': selectMail(id); render(); break;
        case 'mail-open': st.mailFolder = 'all'; st.mailQuery = ''; selectMail(id); go('inbox'); break;
        case 'mail-draft': await draftReply(id); break;
        case 'mail-task': await mailTask(id); break;
        case 'mail-done': await mailDone(id); break;
        case 'draft-discard': st.draft = null; render(); break;
        case 'draft-copy': await navigator.clipboard.writeText($(`[data-k="draft:${CSS.escape(id)}"]`)?.value || ''); h.toast({ level: 'info', source: 'mail', title: 'Draft copied' }); break;
        case 'draft-mail': {
          const m = mailAll().find((x) => x.id === id), msg = st.msgs.get(id)?.message, body = $(`[data-k="draft:${CSS.escape(id)}"]`)?.value || '';
          const subject = msg?.subject || m?.subject || '';
          location.href = `mailto:${encodeURIComponent(msg?.fromAddress || '')}?subject=${encodeURIComponent(/^re:/i.test(subject) ? subject : `Re: ${subject}`)}&body=${encodeURIComponent(body)}`;
          break;
        }
        case 'j-day': st.jSel = el.dataset.date; render(); break;
        case 'j-chip': st.jQuery = st.jQuery.toLowerCase() === el.dataset.q.toLowerCase() ? '' : el.dataset.q; { const i = $('[data-k="jsearch"]'); if (i) { i.value = st.jQuery; delete i.dataset.dirty; } } st.jDays = null; loadDays(); render(); break;
        case 'text-size': h.patchSettings({ textSize: Number(el.dataset.v) }); break;
      }
    } catch (err) { h.toast({ level: 'error', source: 'system', title: 'That didn\'t work', body: err.message }); }
  });

  // Typing: remember what's unsaved, filter as you type, autosave notes.
  root.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.dataset?.k) return;
    el.dataset.dirty = '1';
    if (el.classList.contains('w-ed-title')) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
    switch (el.dataset.input) {
      case 'mail-search': st.mailQuery = el.value; render(); break;
      case 'task-filter': st.taskQuery = el.value; render(); break;
      case 'palette': st.palette.q = el.value; st.palette.idx = 0; render(); break;
      case 'j-search': st.jQuery = el.value.trim(); clearTimeout(daysTimer); daysTimer = setTimeout(loadDays, 250); break;
    }
    if (el.dataset.k === 'daynote') saveNote(el);
    if (el.dataset.k.startsWith('notes:')) { clearTimeout(el._t); el._t = setTimeout(() => { const t = h.D.todos.find((x) => x.id === el.dataset.id); if (t) t.notes = el.value; api('PATCH', `/api/todos/${el.dataset.id}`, { notes: el.value }).catch(() => {}); }, 600); }
  });
  root.addEventListener('focusout', (e) => {
    const el = e.target;
    if (el.classList?.contains('w-ed-title') && el.dataset.dirty) { delete el.dataset.dirty; const text = el.value.replace(/\s+/g, ' ').trim(); if (text) patchTask(el.dataset.id, { text }); }
  });
  root.addEventListener('keydown', async (e) => {
    const el = e.target;
    if (e.key !== 'Enter' || e.shiftKey || !el.dataset?.enter || e.isComposing) return;
    e.preventDefault();
    const value = el.value.trim();
    if (el.dataset.enter === 'task-title') { el.blur(); return; }
    if (!value) return;
    el.value = ''; delete el.dataset.dirty;
    if (el.dataset.enter === 'add-task') await addTask(value);
    if (el.dataset.enter === 'add-step') {
      const t = h.D.todos.find((x) => x.id === el.dataset.id);
      if (t) { await api('PATCH', `/api/todos/${t.id}`, { subtasks: [...(t.subtasks || []), { text: value, done: false }] }); await h.load(); $(`[data-k="step:${CSS.escape(t.id)}"]`)?.focus(); }
    }
  });

  /** Keyboard shortcuts. Called for every keydown while the workstation is showing. */
  function key(e) {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (st.palette) { st.palette = null; render(); } else openPalette(); return; }
    if (st.palette) {
      const n = commands(st.palette.q).length;
      if (e.key === 'ArrowDown') { e.preventDefault(); st.palette.idx = (st.palette.idx + 1) % Math.max(1, n); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); st.palette.idx = (st.palette.idx - 1 + n) % Math.max(1, n); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); runPalette(st.palette.idx); }
      else if (e.key === 'Escape') { st.palette = null; render(); }
      return;
    }
    if (st.rec) {
      if (e.key === 'Escape') cancelRec();
      else if (e.key === 'Enter' && (!typing || e.metaKey || e.ctrlKey)) { e.preventDefault(); saveRec(); }
      return;
    }
    if (e.key === 'Escape') { if (typing) e.target.blur(); if (st.alertsOpen) { st.alertsOpen = false; render(); } return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === '/') { e.preventDefault(); openPalette(); return; }
    if (k === 'r') { e.preventDefault(); startRec(); return; }
    if (k === 'n') { e.preventDefault(); if (!['today', 'tasks'].includes(st.view)) go('today'); $('[data-k="newtask"]')?.focus(); return; }
    if (/^[1-8]$/.test(k)) { go(NAV[Number(k) - 1][0]); return; }
    const move = (list, cur, set) => { const i = list.findIndex((x) => x.id === cur), next = list[Math.min(list.length - 1, Math.max(0, i + (k === 'j' ? 1 : -1)))]; if (next) { set(next.id); render(); root.querySelector('.sel')?.scrollIntoView({ block: 'nearest' }); } };
    if (st.view === 'inbox') {
      if (k === 'j' || k === 'k') move(mailList(), st.mailSel, selectMail);
      else if (st.mailSel && k === 'd') draftReply(st.mailSel);
      else if (st.mailSel && k === 'e') mailDone(st.mailSel);
      else if (st.mailSel && k === 't') mailTask(st.mailSel);
    } else if (st.view === 'tasks') {
      if (k === 'j' || k === 'k') move(taskList(), st.taskSel, (id) => (st.taskSel = id));
      else if (k === 'x' && st.taskSel) root.querySelector(`.w-task.sel [data-act="todo-toggle"]`)?.click();
    }
  }

  /** Once a second: clocks and the desk's countdown (the local timer is updated by the hub's own tick). */
  function tick() {
    const now = new Date(), short = `${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}`;
    for (const el of $$('[data-clock]')) el.textContent = `${short} ${now.getHours() < 12 ? 'AM' : 'PM'}`;
    for (const el of $$('[data-clock-short]')) el.textContent = short;
    const dt = h.D && deskTimer();
    if (dt) for (const el of $$('[data-desk-timer]')) el.textContent = h.fmtLeft(deskLeft(dt));
  }

  /** A live event from the hub that this screen may care about. */
  function onEvent(ev) {
    if (ev.type === 'journal.entry' && ev.stage === 'done') st.jDays = null;
  }

  return { render, key, tick, onEvent, go };
}
