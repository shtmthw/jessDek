// Round 4+: four new directions. Usage: node concepts2.mjs <outdir> [round]
import { mkdirSync } from 'node:fs';
import { word, sparkle, roundRect, ellipse, svg, render, xf, d, p, reseed, OUT, writeFileSync, G, INK, BRAND, BLUSH, PAPER, atWidth } from './gen.mjs';

const DIR = `${OUT}/../${process.argv[2] ?? 'out_v4'}`;
const R = +(process.argv[3] ?? 4); // round number, lets later rounds tweak
if (process.argv[1]?.endsWith('concepts2.mjs')) mkdirSync(DIR, { recursive: true });

const SKIN = '#FDE3D3', HAIR = '#24201F', LAV = '#EEF0FF', DARK = '#FAFAFA', DARKBG = '#09090B';
const SW = 6.2, GAP = 14, WOB = 0.9;
const st = (path, sw, color = INK, fill = 'none', extra = '') =>
  `<path d="${d(path)}" fill="${fill}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const fillP = (path, fill) => `<path d="${d(path)}" fill="${fill}"/>`;
const glyph = (ch, place, sw, color) => G[ch].paths.map((q) => st(place(q), sw, color)).join('');
const tile = (bg) => fillP(roundRect(0, 0, 512, 512, 112), bg);
const pt = (place, x, y) => place(p(`M${x} ${y}`))[0].slice(1);

/* ---------- D · Sticker: the wordmark on a die-cut speech-bubble sticker ---------- */
function bubble(x, y, w, h, r, tx) {
  const k = r * 0.5523, b = y + h;
  return p(`M${x + r} ${y} L${x + w - r} ${y} C${x + w - r + k} ${y} ${x + w} ${y + r - k} ${x + w} ${y + r} L${x + w} ${b - r} C${x + w} ${b - r + k} ${x + w - r + k} ${b} ${x + w - r} ${b} ` +
    `L${tx + 34} ${b} C${tx + 20} ${b} ${tx + 6} ${b + 10} ${tx - 6} ${b + 26} C${tx - 2} ${b + 12} ${tx - 4} ${b + 4} ${tx - 12} ${b} ` +
    `L${x + r} ${b} C${x + r - k} ${b} ${x} ${b - r + k} ${x} ${b - r} L${x} ${y + r} C${x} ${y + r - k} ${x + r - k} ${y} ${x + r} ${y} Z`);
}
function sticker({ inner, x, y, w, h, r, tx, rot = -2, off = 7, sw = 5, shadow = BRAND }) {
  reseed(41);
  const cx = x + w / 2, cy = y + h / 2;
  const shape = xf(bubble(x, y, w, h, r, tx), { rot, cx, cy, wob: 0.7 });
  return fillP(xf(shape, { dx: off, dy: off }), shadow) + st(shape, sw, INK, PAPER) + inner;
}
export function conceptD({ dark = false } = {}) {
  reseed(11);
  const w = word('jessDek', { x: R >= 6 ? 84 : 82, y: R >= 6 ? 50 : R >= 5 ? 44 : 38, sw: SW, gap: GAP, wob: WOB });
  const words = render(w.parts, ([x, y]) => sparkle(x + 1, y - 1, 13, BRAND, { rot: 10 }));
  const P = R >= 5 ? 1 : 0;
  const body = sticker({ inner: words, x: R >= 6 ? 40 : 36, y: P ? 22 : 26, w: w.width + (R >= 6 ? 88 : P ? 100 : 72), h: P ? 172 : 150, r: P ? 52 : 44, tx: P ? 120 : 110 }) +
    sparkle(w.width + (P ? 142 : 112), P ? 22 : 30, 15, dark ? '#818CF8' : BRAND, { rot: 12 }) + sparkle(w.width + (P ? 162 : 132), P ? 50 : 58, 7, dark ? '#818CF8' : BRAND);
  return svg(w.width + (P ? 190 : 160), P ? 246 : 224, body);
}
export function iconD() {
  reseed(5);
  const s = 2.2, ox = 256 - 52 * s - 6, oy = 250 - 72 * s;
  const place = (ch, dx) => (q) => xf(xf(q, { dx: -(G[ch].x0 ?? 0) + dx }), { s, dx: ox, dy: oy });
  const inner = glyph('j', place('j', 0), SW * s * 0.8, INK) + glyph('D', place('D', 38), SW * s * 0.8, INK) +
    sparkle(ox + 22 * s, oy + 21 * s, 26, BRAND, { rot: 10 });
  return svg(512, 512, tile(LAV) + sticker({ inner, x: 96, y: 112, w: 320, h: 260, r: 70, tx: 170, off: 12, sw: 11 }));
}

/* ---------- E · Peek: the default avatar peeks over the D ---------- */
function peeker(place, sw, { lineColor = INK } = {}) {
  // drawn in glyph space around the D's top bar (y = 15, x 203..254)
  const head = st(place(p('M207 15 C205 -10 215 -30 229 -30 C243 -30 253 -10 251 15 Z')), sw * 0.8, lineColor, SKIN);
  const hair = st(place(p('M206 -4 C205 -22 215 -34 229 -34 C244 -34 254 -22 252 -4 C247 -12 240 -16 232 -15 C226 -10 218 -8 211 -9 C209 -7 207 -6 206 -4 Z')), sw * 0.8, lineColor, HAIR);
  const [e1x, e1y] = pt(place, 221, 1), [e2x, e2y] = pt(place, 237, 1);
  const [b1x, b1y] = pt(place, 215, 8), [b2x, b2y] = pt(place, 243, 8);
  const sc = Math.hypot(...pt(place, 10, 0).map((v, i) => v - pt(place, 0, 0)[i])) / 10;
  const face = ellipse(b1x, b1y, 4 * sc, 2.2 * sc, BLUSH) + ellipse(b2x, b2y, 4 * sc, 2.2 * sc, BLUSH) +
    ellipse(e1x, e1y, 2.5 * sc, 3.1 * sc, INK) + ellipse(e2x, e2y, 2.5 * sc, 3.1 * sc, INK) +
    ellipse(e1x + 0.8 * sc, e1y - 1 * sc, 0.8 * sc, 0.8 * sc, PAPER) + ellipse(e2x + 0.8 * sc, e2y - 1 * sc, 0.8 * sc, 0.8 * sc, PAPER);
  const hand = (hx) => { const [hx2, hy2] = pt(place, hx, 15); return ellipse(hx2, hy2, 5.6 * sc, 4.2 * sc, SKIN, ` stroke="${lineColor}" stroke-width="${sw * 0.62}"`); };
  return { behind: head + hair + face, front: hand(214) + hand(244) };
}
export function conceptE({ ink = INK } = {}) {
  reseed(23);
  const w = word('jessDek', {
    x: 30, y: 44, sw: SW, gap: GAP, wob: WOB, color: ink,
    special: { D4: ({ place, sw, color }) => { const pk = peeker(place, sw, { lineColor: color }); return pk.behind + glyph('D', place, sw, color) + pk.front; } },
  });
  return svg(w.width + 60, 186, render(w.parts, ([x, y]) => ellipse(x, y + 4, 4.6, 4.6, ink)));
}
export function iconE() {
  const s = 5.4, ox = 256 - 229 * s, oy = 318 - 15 * s;
  const place = (q) => xf(q, { s, dx: ox, dy: oy });
  const pk = peeker(place, SW * 0.75 * s);
  const ledge = st(p(`M88 ${oy + 15 * s} L424 ${oy + 15 * s}`), SW * 0.75 * s, INK);
  return svg(512, 512, tile(LAV) + `<path d="M0 ${oy + 15 * s} L512 ${oy + 15 * s} L512 400 C512 461.86 461.86 512 400 512 L112 512 C50.14 512 0 461.86 0 400 Z" fill="${BRAND}"/>` + pk.behind + ledge + pk.front);
}

/* ---------- F · Monogram: j and D share one stem ---------- */
function monogram(place, sw, { ink = INK, fill = BRAND, spark = BRAND } = {}) {
  const bowl = place(p('M60 15 L80 15 C108 15 125 32 125 58 C125 84 108 101 80 101 L60 101 Z'));
  const stem = place(p('M60 15 L60 117 C60 131 52 137 41 134'));
  const [sx, sy] = pt(place, 60, -9);
  const sc = Math.hypot(...pt(place, 10, 0).map((v, i) => v - pt(place, 0, 0)[i])) / 10;
  return st(bowl, sw, ink, fill) + st(stem, sw, ink) + sparkle(sx, sy, 12 * sc, spark, { rot: 10 });
}
export function conceptF({ ink = INK, spark = BRAND } = {}) {
  reseed(31);
  const mono = monogram((q) => xf(q, { dx: -10, dy: 26, wob: 0.6 }), SW * 1.05, { ink, spark });
  const w = word('jessDek', { x: 160, y: 30, s: 0.78, sw: SW * 0.92, gap: GAP, wob: WOB, color: ink });
  const sep = '';
  return svg(160 + w.width + 30, 180, mono + sep + render(w.parts, ([x, y]) => ellipse(x, y + 3.5, 4, 4, ink)));
}
export function iconF() {
  reseed(31);
  const s = R >= 6 ? 2.45 : 3.3;
  return svg(512, 512, tile(LAV) + monogram((q) => xf(xf(q, { dx: R >= 6 ? -83 : -88, dy: R >= 6 ? -58 : -66, wob: 0.4 }), { s, dx: 256, dy: 262 }), SW * s * (R >= 6 ? 0.95 : 0.8)));
}

/* ---------- G · Swash: the j's tail loops into an underline that ends in a sparkle ---------- */
const SWASH = 'M22 43 L22 118 C22 133 12 139 4 135 C-4 131 -1 121 12 122 C70 127 140 134 210 132 C262 130 300 124 328 114';
export function conceptG({ ink = INK, spark = BRAND } = {}) {
  reseed(17);
  let tip;
  const w = word('jessDek', {
    x: 34, y: 18, sw: SW, gap: GAP, wob: WOB, color: ink,
    special: { j0: ({ place, sw, color }) => { const path = place(p(SWASH)); tip = path.at(-1).slice(-2); return st(path, sw, color); } },
  });
  const body = render(w.parts, ([x, y]) => ellipse(x, y + 4, 4.6, 4.6, ink)) + sparkle(tip[0] + (R >= 6 ? 12 : 15), tip[1] + (R >= 6 ? 4 : -7), 12, spark, { rot: 10 });
  return svg(w.width + 80, 180, body);
}
export function iconG() {
  reseed(17);
  const s = 3.1, ox = 256 - (R >= 6 ? 40 : 30) * s, oy = 256 - 88 * s;
  const path = xf(p('M22 43 L22 118 C22 133 12 139 4 135 C-4 131 -1 121 12 122 ' + (R >= 6 ? 'C40 125 66 116 80 92' : 'C36 124 54 122 72 114')), { s, dx: ox, dy: oy, wob: 0.3 });
  const [tx, ty] = path.at(-1).slice(-2);
  return svg(512, 512, tile(LAV) + st(path, 22, INK) + sparkle(ox + 22 * s, oy + 19 * s, 30, BRAND, { rot: 10 }) + sparkle(tx + 26, ty - 18, 20, BRAND, { rot: 10 }));
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
const all = {
  D: conceptD(), D_dark: conceptD({ dark: true }), D_icon: iconD(),
  E: conceptE(), E_dark: conceptE({ ink: DARK }), E_icon: iconE(),
  F: conceptF(), F_dark: conceptF({ ink: DARK, spark: '#818CF8' }), F_icon: iconF(),
  G: conceptG(), G_dark: conceptG({ ink: DARK, spark: '#818CF8' }), G_icon: iconG(),
};
for (const [k, v] of Object.entries(all)) {
  writeFileSync(`${DIR}/${k}.svg`, v);
  if (k.endsWith('icon')) { writeFileSync(`${DIR}/${k}@168.svg`, atWidth(v, 168)); writeFileSync(`${DIR}/${k}@48.svg`, atWidth(v, 48)); }
  else writeFileSync(`${DIR}/${k}@500.svg`, atWidth(v, 500));
}
console.log(DIR, Object.keys(all).join(' '));

}
