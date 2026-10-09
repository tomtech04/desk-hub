// Dot-matrix clocks: the time lit up on a grid of dots (Home's hero and the
// wind-down screen). Lit points sit exactly on the grid; when the minute changes
// they travel along the grid's rows, then its columns, to the next number.
//
// Views are re-rendered as HTML strings, so each clock keeps one canvas for its
// whole life and mountClocks() re-attaches it to its placeholder after a render.

const MOVE_MS = 1100;
const FRAME_MS = 33;
const FONT = "600 {px}px Geist, Inter, system-ui, sans-serif";

export const CLOCKS = {
  // Home hero: white on the blue card.
  day: { w: 380, h: 150, step: 8, font: 150, r: 2.8, align: 'left', grid: 'rgba(255,255,255,.13)', core: () => '255,255,255', glow: '200,230,255' },
  // Wind-down: warm, peach to coral across the width.
  wind: { w: 624, h: 220, step: 10, font: 200, r: 3.5, align: 'center', grid: 'rgba(217,145,74,.15)',
    core: (f) => `255,${Math.round(214 - 70 * f)},${Math.round(160 - 50 * f)}`, glow: '232,120,60' },
};

const rand = (a, b) => a + Math.random() * (b - a);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const fontReady = () => (document.fonts?.check?.('600 20px Geist') ? '+' : '-');
const timeText = () => { const d = new Date(); return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`; };

class DotClock {
  constructor(o) {
    this.o = o;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas = document.createElement('canvas');
    this.canvas.width = o.w * this.dpr; this.canvas.height = o.h * this.dpr;
    this.canvas.style.cssText = `width:${o.w}px;height:${o.h}px;max-width:100%;display:block`;
    this.ctx = this.canvas.getContext('2d');
    this.cols = Math.floor(o.w / o.step); this.rows = Math.floor(o.h / o.step);
    this.shown = ''; this.dots = []; this.sparks = []; this.runner = null;
    // The unlit grid never changes, so it's drawn once and stamped each frame.
    this.gridLayer = document.createElement('canvas');
    this.gridLayer.width = this.canvas.width; this.gridLayer.height = this.canvas.height;
    const g = this.gridLayer.getContext('2d');
    g.scale(this.dpr, this.dpr); g.fillStyle = o.grid;
    for (let c = 0; c < this.cols; c++) for (let r = 0; r < this.rows; r++) g.fillRect(c * o.step + o.step / 2 - 1, r * o.step + o.step / 2 - 1, 2, 2);
  }

  // Which grid cells the time lights, and which character each belongs to.
  sample(text) {
    const o = this.o, c = document.createElement('canvas');
    c.width = o.w; c.height = o.h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.font = FONT.replace('{px}', o.font);
    g.textBaseline = 'middle'; g.fillStyle = '#fff';
    const width = g.measureText(text).width;
    const x0 = o.align === 'center' ? (o.w - width) / 2 : o.step;
    g.fillText(text, x0, o.h / 2 + o.font * 0.03);
    const edges = [...text].map((_, i) => x0 + g.measureText(text.slice(0, i + 1)).width);
    const px = g.getImageData(0, 0, o.w, o.h).data;
    const cells = [];
    for (let col = 0; col < this.cols; col++) for (let row = 0; row < this.rows; row++) {
      const x = Math.floor(col * o.step + o.step / 2), y = Math.floor(row * o.step + o.step / 2);
      if (px[(y * o.w + x) * 4 + 3] > 120) cells.push({ c: col, r: row, slot: Math.max(0, edges.findIndex((e) => x < e)) });
    }
    return cells;
  }

  setTime(text, now) {
    const key = text + fontReady();
    if (key === this.shown) return;
    const cells = this.sample(text);
    const first = !this.shown, prev = this.shown.slice(0, -1);
    const sameShape = !first && prev.length === text.length && this.shown.slice(-1) === key.slice(-1);
    const old = this.dots.filter((d) => !d.dying);
    const move = (from, to, extra = {}) => ({ fc: from.c, fr: from.r, tc: to.c, tr: to.r, slot: to.slot, t0: now + rand(0, 420), hFirst: true, ...extra });
    const order = (a, b) => a.c - b.c || a.r - b.r;
    const pair = (was, will) => {
      const from = was.map((d) => ({ c: d.tc, r: d.tr })).sort(order), to = will.slice().sort(order), out = [];
      if (!from.length) return to.map((t) => move(t, t, { born: true }));
      if (from.length <= to.length) { // short of dots: some split off a neighbour and fade in
        const stay = new Set(from.map((_, k) => Math.floor((k / from.length) * to.length)));
        let k = 0;
        to.forEach((t, j) => { if (stay.has(j)) out.push(move(from[k++], t)); else out.push(move(from[Math.min(from.length - 1, k)], t, { born: true })); });
      } else { // dots to spare: the extras slide to a neighbour and fade out
        const keep = new Set(to.map((_, k) => Math.floor((k / to.length) * from.length)));
        let k = 0;
        from.forEach((f, j) => { if (keep.has(j)) out.push(move(f, to[k++])); else out.push(move(f, to[Math.min(to.length - 1, k)], { dying: true })); });
      }
      return out;
    };
    if (first) this.dots = cells.map((t) => ({ fc: t.c, fr: t.r, tc: t.c, tr: t.r, slot: t.slot, t0: now + t.c * 14 + rand(0, 200), born: true }));
    else if (sameShape) {
      // Same number of characters: digits that didn't change stay exactly where they are.
      this.dots = [...text].flatMap((ch, i) => {
        const was = old.filter((d) => d.slot === i);
        return ch === prev[i] ? was : pair(was, cells.filter((t) => t.slot === i));
      });
    } else this.dots = pair(old, cells);
    this.shown = key;
  }

  draw(now) {
    const { o, ctx } = this;
    this.setTime(timeText(), now);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.gridLayer, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const at = (cell) => cell * o.step + o.step / 2;

    // Ambient: a grid point that glows and fades, and now and then a runner along a row.
    if (Math.random() < 0.25 && this.sparks.length < 14) this.sparks.push({ c: Math.floor(rand(0, this.cols)), r: Math.floor(rand(0, this.rows)), t0: now });
    this.sparks = this.sparks.filter((s) => now - s.t0 < 1400);
    for (const s of this.sparks) {
      ctx.fillStyle = `rgba(${o.core(s.c / this.cols)},${(Math.sin(((now - s.t0) / 1400) * Math.PI) * 0.55).toFixed(3)})`;
      ctx.fillRect(at(s.c) - 1.5, at(s.r) - 1.5, 3, 3);
    }
    if (!this.runner && Math.random() < 0.006) this.runner = { r: Math.floor(rand(0, this.rows)), t0: now, back: Math.random() < 0.5 };
    if (this.runner) {
      const head = ((now - this.runner.t0) * 0.5) / o.step;
      if (head > this.cols + 9) this.runner = null;
      else for (let k = 0; k < 9; k++) {
        const col = Math.floor(head) - k;
        if (col < 0 || col >= this.cols) continue;
        const c = this.runner.back ? this.cols - 1 - col : col;
        ctx.fillStyle = `rgba(${o.core(c / this.cols)},${((1 - k / 9) * 0.7).toFixed(3)})`;
        ctx.fillRect(at(c) - 1.5, at(this.runner.r) - 1.5, 3, 3);
      }
    }

    let settled = true;
    for (const d of this.dots) {
      const t = ease(clamp01((now - d.t0) / MOVE_MS));
      if (t < 1) settled = false;
      // Along the row first, then along the column: never diagonally.
      const dx = d.tc - d.fc, dy = d.tr - d.fr, ax = Math.abs(dx), ay = Math.abs(dy), run = t * (ax + ay);
      const x = at(d.fc + Math.sign(dx) * Math.min(run, ax)), y = at(d.fr + Math.sign(dy) * Math.max(0, run - ax));
      let a = d.born ? clamp01((now - d.t0) / 600) : d.dying ? 1 - t : 1;
      if (a <= 0) continue;
      a *= 0.8 + 0.2 * Math.sin(now / 1000 - x * 0.012 + y * 0.02);
      const rgb = o.core(x / o.w);
      ctx.fillStyle = `rgba(${o.glow},${(a * 0.24).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, y, o.r * 1.8, 0, 6.2832); ctx.fill();
      ctx.fillStyle = `rgba(${rgb},${a.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, y, o.r, 0, 6.2832); ctx.fill();
    }
    if (settled && this.dots.some((d) => d.dying || d.born)) this.dots = this.dots.filter((d) => !d.dying).map((d) => ({ ...d, fc: d.tc, fr: d.tr, born: false }));
  }
}

const clocks = new Map();
let raf = 0, last = 0;

function frame(now) {
  raf = 0;
  const live = [...clocks.values()].filter((c) => c.canvas.isConnected);
  if (!live.length || document.hidden) return; // nothing on screen: stop until the next mount
  raf = requestAnimationFrame(frame);
  if (now - last < FRAME_MS) return;
  last = now;
  for (const c of live) c.draw(now);
}

/** Attach each clock's canvas to its <div data-dotclock="day|wind"> placeholder. Call after every render. */
export function mountClocks(root = document) {
  for (const el of root.querySelectorAll('[data-dotclock]')) {
    const kind = el.dataset.dotclock;
    if (!CLOCKS[kind]) continue;
    if (!clocks.has(kind)) clocks.set(kind, new DotClock(CLOCKS[kind]));
    const c = clocks.get(kind);
    if (c.canvas.parentNode !== el) el.replaceChildren(c.canvas);
  }
  if (!raf) raf = requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && !raf) raf = requestAnimationFrame(frame); });
