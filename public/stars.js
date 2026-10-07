// The wind-down sky: a dot grid across the whole screen, with the time lit up on it
// like a dot-matrix board. The lit points sit exactly on the grid; when the minute
// changes they travel along the grid's rows and columns to the next number.
// One canvas behind the UI; the faint grid itself is a CSS background on it (see
// #stars in app.css, which must use the same pitch), so only lit points are drawn.

const G = 10;          // grid pitch in px
const ROWS = 15;       // digit height in grid cells
const SC = 6;          // glyph sampling: px per cell
const MOVE_MS = 1100;
const FRAME_MS = 33;
const FONT = 'Inter, system-ui, sans-serif';

const rand = (a, b) => a + Math.random() * (b - a);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const fontKey = () => (document.fonts?.check?.('700 20px Inter') ? '+' : '-');

// Which grid cells a character lights: the hub's own bold numerals, sampled onto the grid.
const glyphs = new Map();
let sampler;
function glyph(ch) {
  const key = ch + fontKey();
  if (glyphs.has(key)) return glyphs.get(key);
  if (ch === ':') return { cols: 4, cells: [5, 6, 11, 12].flatMap((r) => [[1, r], [2, r]]) };
  sampler ||= document.createElement('canvas');
  const g = sampler.getContext('2d', { willReadFrequently: true });
  const font = `700 ${(ROWS / 0.727) * SC}px ${FONT}`; // digits are cap-height tall, so they fill ROWS
  g.font = font;
  const cols = Math.round(g.measureText('0').width / SC);
  sampler.width = cols * SC; sampler.height = ROWS * SC;
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = '#fff';
  g.fillText(ch, sampler.width / 2, ROWS * SC);
  const px = g.getImageData(0, 0, sampler.width, sampler.height).data;
  const cells = [];
  for (let c = 0; c < cols; c++) for (let r = 0; r < ROWS; r++) {
    let sum = 0;
    for (let y = 0; y < SC; y++) for (let x = 0; x < SC; x++) sum += px[((r * SC + y) * sampler.width + c * SC + x) * 4 + 3];
    if (sum / (SC * SC) > 115) cells.push([c, r]);
  }
  const out = { cols, cells };
  glyphs.set(key, out);
  return out;
}

let canvas, ctx, raf = 0, last = 0, on = false;
let shown = '', slots = []; // slots are indexed from the right, so the minutes stay put
let sparks = [], runner = null, nextRun = 0;

// A point holds a cell it came from and a cell it's going to (both relative to its digit).
const point = (from, to, t0, opts = {}) => ({ fx: from[0], fy: from[1], tx: to[0], ty: to[1], t0, hFirst: Math.random() < 0.5, ...opts });

function setTime(text, now) {
  const key = text + fontKey();
  if (key === shown) return;
  const order = (a, b) => a[0] - b[0] || a[1] - b[1];
  slots = text.split('').reverse().map((ch, i) => {
    const old = slots[i];
    const target = glyph(ch);
    if (!old) // switching on: a sweep from the left, each point fading up in place
      return { ch, cols: target.cols, points: target.cells.map((c) => point(c, c, now + c[0] * 30 + rand(0, 200), { born: true })) };
    if (old.ch === ch && old.cols === target.cols) return old;
    // Pair old points with new cells in the same reading order, so the moves stay short.
    const from = old.points.filter((p) => !p.dying).map((p) => [p.tx, p.ty]).sort(order);
    const to = target.cells.slice().sort(order);
    const points = [];
    if (from.length <= to.length) { // fewer points than cells: some split in two
      to.forEach((b, k) => points.push(point(from.length ? from[Math.floor((k / to.length) * from.length)] : b, b, now + rand(0, 420))));
    } else { // more points than cells: the spares travel in beside a neighbour and switch off
      const kept = new Set(to.map((_, k) => Math.floor((k / to.length) * from.length)));
      let k = 0;
      from.forEach((a, j) => {
        if (kept.has(j)) points.push(point(a, to[k++], now + rand(0, 420)));
        else points.push(point(a, to[Math.min(to.length - 1, k)], now + rand(0, 420), { dying: true }));
      });
    }
    return { ch, cols: target.cols, points };
  });
  shown = key;
}

// Where a point is now: along the row, then the column (or the other way), never diagonally.
function place(p, now) {
  const t = ease(clamp01((now - p.t0) / MOVE_MS));
  const dx = p.tx - p.fx, dy = p.ty - p.fy, ax = Math.abs(dx), ay = Math.abs(dy);
  const d = t * (ax + ay);
  const mx = p.hFirst ? Math.min(d, ax) : Math.max(0, d - ay);
  const my = p.hFirst ? Math.max(0, d - ax) : Math.min(d, ay);
  return [p.fx + Math.sign(dx) * mx, p.fy + Math.sign(dy) * my, t];
}

function dot(x, y, a, r) {
  ctx.fillStyle = `rgba(120,170,255,${(a * 0.2).toFixed(3)})`;
  ctx.beginPath(); ctx.arc(x, y, r * 2.3, 0, 6.2832); ctx.fill();
  ctx.fillStyle = `rgba(240,246,255,${a.toFixed(3)})`;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
}
const cx = (cell) => cell * G + G / 2; // centre of a grid cell, matching the CSS grid

function drawClock(now) {
  const el = document.getElementById('constel');
  if (!el) { shown = ''; slots = []; return; }
  const d = new Date();
  setTime(`${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`, now);
  const box = el.getBoundingClientRect();
  if (!box.width) return;
  const col0 = Math.round((box.left + 12) / G), row0 = Math.round((box.top + (box.height - ROWS * G) / 2) / G);
  const sec = now / 1000;
  let col = col0;
  for (let i = slots.length - 1; i >= 0; i--) {
    const s = slots[i];
    for (const p of s.points) {
      const [gx, gy, t] = place(p, now);
      let a = p.born ? clamp01((now - p.t0) / 600) : p.dying ? 1 - t : 1;
      if (a <= 0) continue;
      const moving = t > 0 && t < 1 && !p.born;
      // Still points breathe very slightly, in a slow wave across the number.
      if (!moving) a *= 0.86 + 0.14 * Math.sin(sec * 0.7 + (col + gx) * 0.22 + gy * 0.15);
      dot(cx(col + gx), cx(row0 + gy), a, G * (moving ? 0.42 : 0.36));
    }
    if (s.points.some((p) => p.dying) && s.points.every((p) => now - p.t0 > MOVE_MS)) s.points = s.points.filter((p) => !p.dying);
    col += s.cols + (s.ch === ':' ? 0 : 1);
  }
  ctx.font = `700 26px ${FONT}`;
  ctx.fillStyle = 'rgba(214,224,255,.62)';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(d.getHours() < 12 ? 'AM' : 'PM', cx(col) + 2, (row0 + ROWS) * G);
}

// Background life, all on the grid: single points that glow and fade, and now and
// then a point that runs along a row or column leaving a short trail.
function drawField(now, W, H) {
  const cols = Math.floor(W / G), rows = Math.floor(H / G);
  while (sparks.length < 70) sparks.push({ c: 0, r: 0, t0: 0, life: 0 });
  for (const s of sparks) {
    if (now > s.t0 + s.life) Object.assign(s, { c: Math.floor(rand(0, cols)), r: Math.floor(rand(0, rows)), t0: now + rand(0, 4000), life: rand(3500, 8000), big: Math.random() < 0.2 });
    const age = (now - s.t0) / s.life;
    if (age <= 0) continue;
    ctx.fillStyle = `rgba(200,220,255,${(Math.sin(age * Math.PI) * (s.big ? 0.85 : 0.5)).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(cx(s.c), cx(s.r), s.big ? 2.1 : 1.5, 0, 6.2832); ctx.fill();
  }
  if (!runner && now > nextRun) {
    const horiz = Math.random() < 0.6;
    runner = { horiz, back: Math.random() < 0.5, line: Math.floor(rand(2, (horiz ? rows : cols) - 2)), len: horiz ? cols : rows, t0: now };
    nextRun = now + rand(7000, 16000);
  }
  if (runner) {
    const head = ((now - runner.t0) / 1000) * 46;
    if (head > runner.len + 16) runner = null;
    else for (let k = 0; k < 16; k++) {
      const at = Math.floor(head) - k;
      if (at < 0 || at >= runner.len) continue;
      const pos = runner.back ? runner.len - 1 - at : at;
      ctx.fillStyle = `rgba(210,228,255,${((1 - k / 16) * 0.8).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(cx(runner.horiz ? pos : runner.line), cx(runner.horiz ? runner.line : pos), k ? 1.6 : 2.4, 0, 6.2832); ctx.fill();
    }
  }
}

function frame(now) {
  if (!on) return;
  raf = requestAnimationFrame(frame);
  if (now - last < FRAME_MS) return;
  last = now;
  const W = innerWidth, H = innerHeight;
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  ctx.clearRect(0, 0, W, H);
  drawField(now, W, H);
  drawClock(now);
}

/** Turn the night sky on or off. Safe to call on every render. */
export function nightSky(want) {
  if (want === on) return;
  on = want;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'stars';
    document.getElementById('wall').after(canvas);
    ctx = canvas.getContext('2d');
  }
  canvas.hidden = !on;
  cancelAnimationFrame(raf);
  if (on) { shown = ''; slots = []; last = 0; nextRun = performance.now() + 4000; raf = requestAnimationFrame(frame); }
}
