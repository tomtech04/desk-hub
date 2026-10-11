// The dot-matrix numerals. Each digit is drawn as strokes directly on the dot grid
// (straight runs joined by round corners, with flat ends), so a number has exactly
// the same shape every time, every digit takes a slot of the same width, and
// nothing shifts when the time changes. No DOM here: this only works out which
// cells to light.

/**
 * A path of straight runs. `pts` are [x, y, radius?] vertices: a radius rounds
 * that corner, none leaves it square. Returns the runs (with how far each end
 * reaches past its point) and the sample points of the rounded corners.
 */
function trace(pts, half, closed = false) {
  const n = pts.length, runs = [], arcs = [];
  const corners = pts.map((p, i) => {
    const prev = pts[(i - 1 + n) % n], next = pts[(i + 1) % n], r = p[2] || 0;
    const free = !closed && (i === 0 || i === n - 1);
    if (!r || free) return { a: p, b: p, free };
    const d1 = Math.hypot(prev[0] - p[0], prev[1] - p[1]), d2 = Math.hypot(next[0] - p[0], next[1] - p[1]);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const a = [p[0] + ((prev[0] - p[0]) / d1) * rr, p[1] + ((prev[1] - p[1]) / d1) * rr];
    const b = [p[0] + ((next[0] - p[0]) / d2) * rr, p[1] + ((next[1] - p[1]) / d2) * rr];
    return { a, b, c: [a[0] + b[0] - p[0], a[1] + b[1] - p[1]], r: rr };
  });
  for (let i = 0; i < n; i++) {
    const k = corners[i];
    if (k.c) { // a quarter turn around the corner's centre
      const a0 = Math.atan2(k.a[1] - k.c[1], k.a[0] - k.c[0]);
      let da = Math.atan2(k.b[1] - k.c[1], k.b[0] - k.c[0]) - a0;
      if (da > Math.PI) da -= 2 * Math.PI; else if (da < -Math.PI) da += 2 * Math.PI;
      for (let s = 0; s <= 16; s++) arcs.push([k.c[0] + Math.cos(a0 + (da * s) / 16) * k.r, k.c[1] + Math.sin(a0 + (da * s) / 16) * k.r]);
    }
    if (i < n - 1 || closed) {
      const to = corners[(i + 1) % n];
      // A run reaches half a stroke past a free end or a square corner, so ends are flat and square corners are filled.
      // (Two round corners can use up the whole run between them; then there's nothing straight to draw.)
      if (Math.hypot(to.a[0] - k.b[0], to.a[1] - k.b[1]) > 1e-6) runs.push({ a: k.b, b: to.a, extA: k.c ? 0 : half, extB: to.c ? 0 : half });
    }
  }
  return { runs, arcs };
}

/** The strokes of one digit in a box `w` × `h` cells with strokes `t` cells thick. */
function strokes(ch, w, h, t, round) {
  const half = (t - 1) / 2;
  const L = half, R = w - 1 - half, T = half, B = h - 1 - half, M = (T + B) / 2, C = (L + R) / 2;
  const q = round || half + 1;     // the round outer corners
  const s = Math.max(1, half);     // a tighter turn, for inside corners
  const path = (pts, closed) => trace(pts, half, closed);
  switch (ch) {
    case '0': return [path([[L, T, q], [R, T, q], [R, B, q], [L, B, q]], true)];
    case '2': return [path([[L, T], [R, T, q], [R, M, q], [L, M, q], [L, B], [R, B]])];
    case '3': return [path([[L, T], [R, T, q], [R, B, q], [L, B]]), path([[Math.ceil(C) - 1, M], [R, M]])];
    case '4': return [path([[L, T], [L, M, s], [R, M]]), path([[R, T], [R, B]])];
    case '5': return [path([[R, T], [L, T], [L, M], [R, M, q], [R, B, q], [L, B]])];
    case '6': return [path([[R, T], [L, T, q], [L, B, q], [R, B, q], [R, M, q], [L, M]])];
    case '7': return [path([[L, T], [R, T, q], [R, B]])];
    case '8': return [path([[L, T, q], [R, T, q], [R, B, q], [L, B, q]], true), path([[L, M], [R, M]])];
    case '9': return [path([[L, B], [R, B, q], [R, T, q], [L, T, q], [L, M, q], [R, M]])];
    default: return [];
  }
}

const cache = new Map();

/** The lit cells of a character: [[col, row], …] inside its own box (digits are `w` wide; ':' is `colon` wide). */
export function glyph(ch, { w, h, t, colon, round = 0 }) {
  const key = `${ch}|${w}|${h}|${t}|${colon}|${round}`;
  if (cache.has(key)) return cache.get(key);
  const cells = [];
  if (ch === ':') {
    // Two square dots, set in from the top and the bottom by the same amount.
    const top = Math.round(h * 0.3 - colon / 2), bottom = h - top - colon;
    for (const y0 of [top, bottom]) for (let x = 0; x < colon; x++) for (let y = 0; y < colon; y++) cells.push([x, y0 + y]);
  } else if (ch === '1') {
    // A stem in the middle of the slot, a small flag stepping down to its left, and a foot
    // as wide as the two together, so a 1 fills its slot like every other digit.
    const flag = Math.max(1, t - 1), left = Math.floor((w - t) / 2);
    for (let y = 0; y < h; y++) for (let x = 0; x < t; x++) cells.push([left + x, y]);
    for (let k = 1; k <= flag; k++) for (let x = 1; x <= k; x++) cells.push([left - x, k]);
    for (let y = h - t; y < h; y++) for (let x = 1; x <= flag; x++) cells.push([left - x, y], [left + t - 1 + x, y]);
  } else {
    const half = (t - 1) / 2, reach = half + 0.2;
    const paths = strokes(ch, w, h, t, round);
    const onRun = (x, y, { a, b, extA, extB }) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
      const along = (x - a[0]) * ux + (y - a[1]) * uy, across = Math.abs((x - a[0]) * -uy + (y - a[1]) * ux);
      return across <= reach && along >= -extA - 0.01 && along <= len + extB + 0.01;
    };
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
      if (paths.some((p) => p.runs.some((r) => onRun(x, y, r)) || p.arcs.some(([px, py]) => Math.hypot(px - x, py - y) <= reach))) cells.push([x, y]);
    }
  }
  cache.set(key, cells);
  return cells;
}

/**
 * Lay a time such as "9:41" out on a grid `cols` × `rows`: every digit in a slot of
 * the same width, centred or from the left. Returns the lit cells with the index of
 * the character each belongs to: [{ c, r, slot }, …].
 */
export function layout(text, font, { cols, rows, align = 'left' }) {
  const chars = [...text];
  const widths = chars.map((ch) => (ch === ':' ? font.colon : font.w));
  const total = widths.reduce((a, b) => a + b, 0) + font.gap * (chars.length - 1);
  let col = align === 'center' ? Math.round((cols - total) / 2) : 1;
  const row0 = Math.round((rows - font.h) / 2);
  const cells = [];
  chars.forEach((ch, slot) => {
    for (const [x, y] of glyph(ch, font)) cells.push({ c: col + x, r: row0 + y, slot });
    col += widths[slot] + font.gap;
  });
  return cells;
}
