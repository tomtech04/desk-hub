// The wind-down sky: drifting, twinkling stars, the odd shooting star, and the
// time drawn as a constellation whose stars slide into the next number.
// One canvas behind the UI; the clock is drawn wherever #constel sits.

const TL = [0, 0], TR = [1, 0], ML = [0, 1], MR = [1, 1], BL = [0, 2], BR = [1, 2];
// Each digit is one stroke through the corners of a 1×2 box.
const DIGITS = {
  0: [TL, TR, BR, BL, TL],
  1: [[0.25, 0.45], [0.7, 0], [0.7, 1], [0.7, 2]],
  2: [TL, TR, MR, ML, BL, BR],
  3: [TL, TR, MR, [0.3, 1], MR, BR, BL],
  4: [TL, ML, MR, TR, MR, BR],
  5: [TR, TL, ML, MR, BR, BL],
  6: [TR, TL, ML, BL, BR, MR, ML],
  7: [TL, TR, [0.6, 1], [0.4, 2]],
  8: [ML, TL, TR, MR, ML, BL, BR, MR],
  9: [MR, ML, TL, TR, MR, BR, BL],
};
const PER = 150; // flowing dots per digit
// The clock's colours run teal → blue → violet → rose from left to right, drifting slowly.
const hueAt = (f, sec) => 172 + f * 150 + Math.sin(sec * 0.12) * 16;
const N = 8; // stars per digit; shorter strokes park the spare stars on their last point
const MORPH_MS = 2800;
const FRAME_MS = 33;

const rand = (a, b) => a + Math.random() * (b - a);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function shape(ch, slot, pad = true) {
  const pts = DIGITS[ch].slice();
  while (pad && pts.length < N) pts.push(pts.at(-1));
  // A little fixed wobble per star so it reads as a constellation, not a display.
  return pts.map(([x, y], i) => {
    const s = Math.sin((slot + 1) * 12.9898 + i * 78.233) * 43758.5453, j = s - Math.floor(s);
    const s2 = Math.sin((slot + 3) * 39.346 + i * 11.135) * 24634.6345, k = s2 - Math.floor(s2);
    return [x + (j - 0.5) * 0.09, y + (k - 0.5) * 0.09];
  });
}

// The stroke of a digit as something dots can travel along.
function pathOf(ch, slot) {
  const pts = shape(ch, slot, false), cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, total: cum.at(-1) };
}
// Where a dot sits at u (0..1) along the stroke, pushed `off` to the side of it.
function along(path, u, off) {
  const d = u * path.total;
  let i = 1;
  while (i < path.cum.length - 1 && path.cum[i] < d) i++;
  const a = path.pts[i - 1], b = path.pts[i], len = path.cum[i] - path.cum[i - 1] || 1, t = (d - path.cum[i - 1]) / len;
  const dx = (b[0] - a[0]) / len, dy = (b[1] - a[1]) / len;
  return [a[0] + (b[0] - a[0]) * t - dy * off, a[1] + (b[1] - a[1]) * t + dx * off];
}
const spread = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.1; // bunched toward the stroke
function makeDots() {
  return Array.from({ length: PER }, () => ({
    u: Math.random(), dir: Math.random() < 0.5 ? 1 : -1, sp: rand(0.012, 0.04), off: spread(), x: NaN, y: 0, vx: 0, vy: 0,
    size: rand(2.6, 4.4), hue: rand(-14, 14), ph: rand(0, 6.28), ws: rand(0.25, 0.7),
  }));
}

let canvas, ctx, raf = 0, last = 0, on = false;
let field = [], shooting = null, nextShot = 0;
let shown = '', slots = []; // slots are indexed from the right, so the minutes stay put

function makeField() {
  field = Array.from({ length: 170 }, () => ({
    x: Math.random(), y: Math.random(), r: Math.random() < 0.15 ? rand(1.6, 2.6) : rand(0.7, 1.4),
    a: rand(0.45, 1), ph: rand(0, 6.28), sp: rand(0.4, 1.6), drift: rand(0.2, 1),
  }));
}

function setTime(text, now) {
  if (text === shown) return;
  const digits = text.replace(':', '').split('').reverse();
  slots = digits.map((ch, i) => {
    const old = slots[i];
    const to = shape(ch, i);
    if (!old) return { ch, from: to.map(() => [rand(-1.5, 2.5), rand(-1, 3)]), to, t0: now, fresh: true, path: pathOf(ch, i), dots: makeDots() };
    if (old.ch === ch) return old;
    // The number changed: the dots drift over to the new stroke.
    for (const p of old.dots) { p.vx += rand(-3, 3); p.vy += rand(-3, 3); p.u = Math.random(); }
    return { ch, from: current(old, now), to, t0: now, path: pathOf(ch, i), dots: old.dots };
  });
  shown = text;
}

function current(s, now) {
  const t = Math.min(1, (now - s.t0) / MORPH_MS), e = ease(t);
  return s.to.map(([x, y], i) => [s.from[i][0] + (x - s.from[i][0]) * e, s.from[i][1] + (y - s.from[i][1]) * e]);
}

function drawClock(now, dtSec) {
  const el = document.getElementById('constel');
  if (!el) { shown = ''; slots = []; return; }
  const d = new Date();
  setTime(`${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`, now);
  const box = el.getBoundingClientRect();
  if (!box.width) return;
  const dh = box.height * 0.8, dw = dh * 0.5, gap = dw * 0.5, colon = dw * 0.5;
  const top = box.top + box.height * 0.1;
  let x = box.left + 16;
  const n = slots.length;
  const sec = now / 1000;
  const span = n * (dw + gap) + colon;
  const band = (alpha, light) => {
    const g = ctx.createLinearGradient(x, 0, x + span, 0);
    for (const f of [0, 0.33, 0.66, 1]) g.addColorStop(f, `hsla(${hueAt(f, sec).toFixed(0)},90%,${light}%,${alpha})`);
    return g;
  };
  const glow = band(0.3, 62), core = band(0.95, 80), x0 = x;
  for (let pos = 0; pos < n; pos++) {
    const s = slots[n - 1 - pos];
    if (pos === n - 2) { // the colon sits before the last two digits
      for (const cy of [0.62, 1.38]) star(x + colon * 0.3, top + cy * dh / 2, 4.2, 0.8 + 0.2 * Math.sin(sec * 0.8));
      x += colon;
    }
    const t = Math.min(1, (now - s.t0) / MORPH_MS);
    const pts = current(s, now).map(([px, py]) => [x + px * dw, top + py * dh / 2]);
    // Lines thin out while the stars travel, then draw back in.
    const settle = s.fresh ? t * t : 1 - Math.sin(t * Math.PI) * 0.75;
    // A soft wide stroke under a bright one, so the lines read from across the room.
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.globalAlpha = settle;
    ctx.strokeStyle = glow; ctx.lineWidth = dw * 0.34; ctx.stroke();
    ctx.strokeStyle = core; ctx.lineWidth = 3.2; ctx.stroke();
    ctx.globalAlpha = 1;
    // The dots: each runs back and forth along the stroke and is pulled to its place by a
    // soft spring, so the digit shimmers when still and pours into the next one when it changes.
    ctx.globalCompositeOperation = 'lighter';
    for (const p of s.dots) {
      p.u += p.dir * p.sp * dtSec;
      if (p.u > 1) { p.u = 1; p.dir = -1; } else if (p.u < 0) { p.u = 0; p.dir = 1; }
      const [ux, uy] = along(s.path, p.u, p.off + Math.sin(sec * p.ws + p.ph) * 0.02);
      const tx = x + ux * dw, ty = top + uy * dw;
      if (Number.isNaN(p.x)) { p.x = tx + rand(-260, 260); p.y = ty + rand(-200, 200); }
      p.vx = (p.vx + (tx - p.x) * 0.02) * 0.87; p.vy = (p.vy + (ty - p.y) * 0.02) * 0.87;
      p.x += p.vx; p.y += p.vy;
      const speed = Math.min(1, (Math.abs(p.vx) + Math.abs(p.vy)) / 10);
      const a = 0.6 + 0.3 * Math.sin(sec * p.ws + p.ph);
      const size = p.size + speed;
      ctx.fillStyle = `hsla(${(hueAt((p.x - x0) / span, sec) + p.hue).toFixed(0)},95%,78%,${a.toFixed(2)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, size / 2, 0, 6.2832); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    pts.forEach(([px, py], i) => {
      const tw = 0.5 + 0.5 * Math.sin(sec * 0.6 + i * 1.9 + pos * 2.3);
      star(px, py, 2.6 + (i % 3) * 0.5 + tw * 0.8 + (1 - settle) * 1.5, 0.85 + 0.15 * tw);
    });
    x += dw + gap;
  }
  ctx.font = `600 ${Math.round(dh * 0.2)}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(214,224,255,.6)';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(d.getHours() < 12 ? 'AM' : 'PM', x - gap * 0.4, top + dh + 4);
}

function star(x, y, r, a) {
  ctx.fillStyle = `rgba(150,185,255,${(a * 0.16).toFixed(3)})`;
  ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, 6.2832); ctx.fill();
  ctx.fillStyle = `rgba(190,212,255,${(a * 0.3).toFixed(3)})`;
  ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, 6.2832); ctx.fill();
  ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
}

function frame(now) {
  if (!on) return;
  raf = requestAnimationFrame(frame);
  if (now - last < FRAME_MS) return;
  const dt = Math.min(100, now - last || FRAME_MS);
  last = now;
  const W = innerWidth, H = innerHeight;
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  ctx.clearRect(0, 0, W, H);
  const sec = now / 1000;
  for (const s of field) {
    s.x -= dt * 0.0000022 * s.drift; if (s.x < 0) s.x += 1;
    const a = s.a * (0.55 + 0.45 * Math.sin(sec * s.sp + s.ph));
    ctx.fillStyle = `rgba(226,234,255,${a.toFixed(3)})`;
    if (s.r < 1.4) ctx.fillRect(s.x * W, s.y * H, s.r * 1.6, s.r * 1.6);
    else { ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 6.2832); ctx.fill(); }
  }
  if (!shooting && now > nextShot) {
    shooting = { x: rand(0.25, 1) * W, y: rand(0, 0.35) * H, t0: now, len: rand(140, 240) };
    nextShot = now + rand(9000, 22000);
  }
  if (shooting) {
    const t = (now - shooting.t0) / 900;
    if (t >= 1) shooting = null;
    else {
      const hx = shooting.x - t * 420, hy = shooting.y + t * 250;
      const tx = hx + shooting.len * 0.86, ty = hy - shooting.len * 0.51;
      const g = ctx.createLinearGradient(hx, hy, tx, ty);
      g.addColorStop(0, `rgba(255,255,255,${(Math.sin(t * Math.PI) * 0.9).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
    }
  }
  drawClock(now, dt / 1000);
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
    makeField();
  }
  canvas.hidden = !on;
  cancelAnimationFrame(raf);
  if (on) { shown = ''; slots = []; last = 0; nextShot = performance.now() + 5000; raf = requestAnimationFrame(frame); }
}
