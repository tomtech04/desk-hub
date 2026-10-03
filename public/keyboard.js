// A touch keyboard for the kiosk. Chromium in kiosk mode has no reliable
// system keyboard on the Pi, so the hub brings its own. A physical or
// Bluetooth keyboard works too, since keydown is handled as well.

const ROWS = {
  lower: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'],
  upper: ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'],
  sym: ['1234567890', '-/:;()$&@"', '.,?!\'#%+='],
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * openKeyboard({ title, value, options: [{ key, choices: [[value, label]], value }], onDone(text, opts) })
 * `options` render as chip rows above the keys (tag, due date, ...).
 */
export function openKeyboard(opts) {
  return window.HUB_REMOTE ? openNative(opts) : openOnScreen(opts);
}

/** Phones and laptops: a real text field, so the device's own keyboard is used. */
function openNative({ title, value = '', options = [], onDone }) {
  const el = document.getElementById('keyboard');
  const opts = Object.fromEntries(options.map((o) => [o.key, o.value ?? null]));
  el.classList.add('native');
  const chips = () => options.map((o) => `<div class="chips">${o.choices.map(([v, label]) => `<button type="button" class="chip ${opts[o.key] === v ? 'on' : ''}" data-opt="${o.key}" data-v="${esc(JSON.stringify(v))}">${esc(label)}</button>`).join('')}</div>`).join('');
  el.innerHTML = `<form class="top">
      <h1 style="font-size:22px">${esc(title)}</h1>
      <input class="field" name="text" maxlength="200" placeholder="Type here…" autocomplete="off" enterkeyhint="done" value="${esc(value)}">
      <div class="opts">${chips()}</div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-k="cancel">Cancel</button><button class="btn primary" type="submit">Save</button></div>
    </form>`;
  const input = el.querySelector('input');
  const close = (save) => {
    el.hidden = true; el.classList.remove('native'); el.onclick = null; el.innerHTML = '';
    if (save) onDone?.(input.value.trim(), opts);
  };
  el.querySelector('form').onsubmit = (e) => { e.preventDefault(); close(true); };
  el.onclick = (e) => {
    const b = e.target.closest('button');
    if (b?.dataset.opt) { opts[b.dataset.opt] = JSON.parse(b.dataset.v); el.querySelector('.opts').innerHTML = chips(); }
    else if (b?.dataset.k === 'cancel' || e.target === el) close(false);
  };
  input.onkeydown = (e) => { if (e.key === 'Escape') close(false); };
  el.hidden = false;
  input.focus();
}

function openOnScreen({ title, value = '', options = [], onDone }) {
  const el = document.getElementById('keyboard');
  let text = value;
  let layer = text ? 'lower' : 'upper'; // auto-capitalize the first letter
  const opts = Object.fromEntries(options.map((o) => [o.key, o.value ?? null]));

  function draw() {
    const rows = ROWS[layer];
    el.innerHTML = `<div class="top">
        <div class="row" style="justify-content:space-between"><h1 style="font-size:24px">${esc(title)}</h1>
          <button class="btn small ghost" data-k="cancel">Cancel</button></div>
        <div class="field">${text ? esc(text) : '<span class="ph">Type here…</span>'}<span class="caret"></span></div>
        ${options.map((o) => `<div class="chips">${o.choices.map(([v, label]) => `<button class="chip ${opts[o.key] === v ? 'on' : ''}" data-opt="${o.key}" data-v="${esc(JSON.stringify(v))}">${esc(label)}</button>`).join('')}</div>`).join('')}
      </div>
      <div class="keys">
        <div class="krow">${[...rows[0]].map((c) => `<button data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <div class="krow">${[...rows[1]].map((c) => `<button data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <div class="krow"><button class="wide" data-k="shift">${layer === 'sym' ? 'ABC' : layer === 'upper' ? '⇧ on' : '⇧'}</button>
          ${[...rows[2]].map((c) => `<button data-c="${esc(c)}">${esc(c)}</button>`).join('')}
          <button class="wide" data-k="back">⌫</button></div>
        <div class="krow"><button class="wide" data-k="sym">${layer === 'sym' ? 'abc' : '123'}</button>
          <button class="space" data-c=" ">space</button>
          <button class="wide done" data-k="done">Save</button></div>
      </div>`;
  }

  function type(c) {
    text = (text + c).slice(0, 200);
    if (layer === 'upper') layer = 'lower';
    draw();
  }

  function close(save) {
    el.hidden = true;
    el.onpointerdown = null;
    document.removeEventListener('keydown', onKey, true);
    if (save) onDone?.(text.trim(), opts);
  }

  function onKey(e) {
    e.preventDefault();
    if (e.key === 'Enter') close(true);
    else if (e.key === 'Escape') close(false);
    else if (e.key === 'Backspace') { text = text.slice(0, -1); draw(); }
    else if (e.key.length === 1) { text = (text + e.key).slice(0, 200); layer = 'lower'; draw(); }
  }

  // pointerdown (not click) so fast typing on a touchscreen doesn't drop keys.
  el.onpointerdown = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    e.preventDefault();
    if (b.dataset.c !== undefined) return type(b.dataset.c);
    if (b.dataset.opt) { opts[b.dataset.opt] = JSON.parse(b.dataset.v); return draw(); }
    switch (b.dataset.k) {
      case 'shift': layer = layer === 'sym' ? 'lower' : layer === 'upper' ? 'lower' : 'upper'; break;
      case 'sym': layer = layer === 'sym' ? 'lower' : 'sym'; break;
      case 'back': text = text.slice(0, -1); break;
      case 'done': return close(true);
      case 'cancel': return close(false);
    }
    draw();
  };
  document.addEventListener('keydown', onKey, true);
  draw();
  el.hidden = false;
}
