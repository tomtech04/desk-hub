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
const N = 8; // stars per digit; shorter strokes park the spare stars on their last point
const MORPH_MS = 1900;
const FRAME_MS = 33;

const rand = (a, b) => a + Math.random() * (b - a);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function shape(ch, slot) {
  const pts = DIGITS[ch].slice();
  while (pts.length < N) pts.push(pts.at(-1));
  // A little fixed wobble per star so it reads as a constellation, not a display.
  return pts.map(([x, y], i) => {
    const s = Math.sin((slot + 1) * 12.9898 + i * 78.233) * 43758.5453, j = s - Math.floor(s);
    const s2 = Math.sin((slot + 3) * 39.346 + i * 11.135) * 24634.6345, k = s2 - Math.floor(s2);
    return [x + (j - 0.5) * 0.09, y + (k - 0.5) * 0.09];
  });
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
    if (!old) return { ch, from: to.map(() => [rand(-1.5, 2.5), rand(-1, 3)]), to, t0: now, fresh: true };
    if (old.ch === ch) return old;
    return { ch, from: current(old, now), to, t0: now };
  });
  shown = text;
}

function current(s, now) {
  const t = Math.min(1, (now - s.t0) / MORPH_MS), e = ease(t);
  return s.to.map(([x, y], i) => [s.from[i][0] + (x - s.from[i][0]) * e, s.from[i][1] + (y - s.from[i][1]) * e]);
}

function drawClock(now) {
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
  for (let pos = 0; pos < n; pos++) {
    const s = slots[n - 1 - pos];
    if (pos === n - 2) { // the colon sits before the last two digits
      for (const cy of [0.62, 1.38]) star(x + colon * 0.3, top + cy * dh / 2, 4.2, 0.85 + 0.15 * Math.sin(sec * 2));
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
    ctx.strokeStyle = `rgba(150,185,255,${(0.2 * settle).toFixed(3)})`;
    ctx.lineWidth = 9; ctx.stroke();
    ctx.strokeStyle = `rgba(214,228,255,${(0.9 * settle).toFixed(3)})`;
    ctx.lineWidth = 3.4;
    ctx.stroke();
    pts.forEach(([px, py], i) => {
      const tw = 0.5 + 0.5 * Math.sin(sec * 1.4 + i * 1.9 + pos * 2.3);
      star(px, py, 4 + (i % 3) * 0.7 + tw * 0.9 + (1 - settle) * 1.5, 0.85 + 0.15 * tw);
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
    makeField();
  }
  canvas.hidden = !on;
  cancelAnimationFrame(raf);
  if (on) { shown = ''; slots = []; last = 0; nextShot = performance.now() + 5000; raf = requestAnimationFrame(frame); }
}
