import { affine, atWidth } from './gen.mjs';
import { word, sparkle, roundRect, ellipse, svg, render, xf, d, p, reseed, OUT, writeFileSync, INK, BRAND, BLUSH, PAPER } from './gen.mjs';

const R3 = process.argv[2] === 'out_v3';
const SW = R3 ? 6.2 : 8, GAP = R3 ? 14 : 11, WOB = R3 ? 0.9 : 0.6;
const stroke = (path, sw, color = INK, fill = 'none') =>
  `<path d="${d(path)}" fill="${fill}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;

// ===== A: "Ink" — pure wordmark, the j's dot is the avatar sparkle =====
export function conceptA({ ink = INK, accent = BRAND } = {}) {
  reseed(11);
  const w = word('jessDek', { x: 30, y: 20, color: ink, sw: SW, gap: GAP, wob: WOB });
  const body = render(w.parts, ([x, y]) => sparkle(x + 1, y - 1, 15, accent, { rot: 10 }));
  return svg(w.width + 60, 175, body);
}
export function iconA({ bg = R3 ? '#EEF0FF' : BRAND, ink = R3 ? INK : PAPER, accent = R3 ? BRAND : '#C7D2FE' } = {}) {
  reseed(3);
  const s = 3.0, ox = 256 - 15 * s, oy = 256 - 76 * s;
  const j = xf(xf(p('M22 46 L22 113 C22 127 15 133 4 130'), { rot: -2, cx: 14, cy: 80, wob: 0.3 }), { s, dx: ox, dy: oy });
  return svg(512, 512, `<path d="${d(roundRect(0, 0, 512, 512, 112))}" fill="${bg}"/>` + stroke(j, R3 ? 27 : 30, ink) + sparkle(ox + 23 * s, oy + 19 * s, R3 ? 50 : 46, accent, { rot: 10 }));
}

// ===== B: "Deck" — two hand-drawn cards, the front one has the avatar face =====
function deck(cx, cy, s, { ink = INK, back = BRAND, front = PAPER, sw = 7 } = {}) {
  reseed(5);
  const W = 62, H = 82, R = 12;
  const backCard = xf(roundRect(cx - W / 2, cy - H / 2, W, H, R), { rot: -12, cx, cy: cy + 30, dx: -10, wob: 0.5 });
  const frontCard = xf(roundRect(cx - W / 2, cy - H / 2, W, H, R), { rot: 7, cx, cy: cy + 30, dx: 8, wob: 0.5 });
  const sc = (path) => xf(path, { s, cx, cy });
  const fx = cx + 8 + Math.sin((7 * Math.PI) / 180) * 0, fy = cy + 2;
  const face = [
    ellipse(fx - 7, fy - 3, 3.6, 4.4, INK),
    ellipse(fx + 9, fy - 1, 3.6, 4.4, INK),
    ellipse(fx - 5.8, fy - 4.6, 1.2, 1.2, PAPER),
    ellipse(fx + 10.2, fy - 2.6, 1.2, 1.2, PAPER),
    ellipse(fx - 11, fy + 6, 4.4, 2.4, BLUSH),
    ellipse(fx + 13, fy + 8.2, 4.4, 2.4, BLUSH),
    stroke(xf(p(`M${fx - 1} ${fy + 7} C${fx + 1} ${fy + 9.5} ${fx + 3} ${fy + 9.5} ${fx + 5} ${fy + 7.6}`), { rot: 7, cx: fx, cy: fy }), 2.6, INK),
  ].join('');
  return affine(`${stroke(backCard, sw, ink, back)}${stroke(frontCard, sw, ink, front)}${face}`, s, cx - s * cx, cy - s * cy);
}
export function conceptB({ ink = INK } = {}) {
  reseed(21);
  const w = word('jessDek', { x: R3 ? 160 : 150, y: R3 ? 14 : 20, color: ink, s: R3 ? 0.8 : 0.86, sw: SW, gap: GAP, wob: WOB });
  const body = deck(70, 70, R3 ? 0.98 : 1.05, { ink, sw: R3 ? 5.6 : 7 }) + render(w.parts, ([x, y]) => ellipse(x, y + 4, 5.2, 5.2, ink));
  return svg(150 + w.width + 30, 160, body);
}
export function iconB() {
  return svg(512, 512, `<path d="${d(roundRect(0, 0, 512, 512, 112))}" fill="#EEF0FF"/>` + deck(R3 ? 258 : 252, R3 ? 238 : 226, R3 ? 3.3 : 3.9, { sw: R3 ? 5.5 : 6.5 }));
}

// ===== C: "Bubble" — the camel-case D is a speech bubble with doe eyes =====
function bubbleD({ place, sw, color }) {
  // D with a tail at the bottom left: reads as a chat bubble
  const outline = place(p('M203 15 L203 99 C203 106 200 111 196 115 C205 115 213 109 218 101 L222 101 C250 101 267 84 267 58 C267 32 250 15 222 15 Z'));
  const eyeL = place(p('M225 54 L225 54')), eyeR = place(p('M246 54 L246 54'));
  const blL = place(p('M219 68 L219 68')), blR = place(p('M252 68 L252 68'));
  const [ex1, ey1] = eyeL[0].slice(1), [ex2, ey2] = eyeR[0].slice(1);
  const s = Math.hypot(place(p('M0 0 L10 0'))[1][1] - place(p('M0 0 L10 0'))[0][1], place(p('M0 0 L10 0'))[1][2] - place(p('M0 0 L10 0'))[0][2]) / 10;
  return (
    `<path d="${d(outline)}" fill="${BRAND}" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round"/>` +
    ellipse(blL[0][1], blL[0][2], 5.5 * s, 3 * s, BLUSH) + ellipse(blR[0][1], blR[0][2], 5.5 * s, 3 * s, BLUSH) +
    ellipse(ex1, ey1, 6.2 * s, 7.4 * s, PAPER, ` stroke="${INK}" stroke-width="${2.6 * s}"`) + ellipse(ex2, ey2, 6.2 * s, 7.4 * s, PAPER, ` stroke="${INK}" stroke-width="${2.6 * s}"`) +
    ellipse(ex1 + 0.5 * s, ey1 + 1 * s, 3.6 * s, 4.2 * s, INK) + ellipse(ex2 + 0.5 * s, ey2 + 1 * s, 3.6 * s, 4.2 * s, INK) +
    ellipse(ex1 + 1.6 * s, ey1 - 1 * s, 1.2 * s, 1.2 * s, PAPER) + ellipse(ex2 + 1.6 * s, ey2 - 1 * s, 1.2 * s, 1.2 * s, PAPER)
  );
}
export function conceptC({ ink = INK } = {}) {
  reseed(31);
  const w = word('jessDek', { x: 30, y: 20, color: ink, sw: SW, gap: GAP, wob: WOB, special: { D4: bubbleD } });
  const body = render(w.parts, ([x, y]) => ellipse(x, y + 4, 6, 6, ink));
  return svg(w.width + 60, 175, body);
}
export function iconC() {
  reseed(31);
  const s = R3 ? 3.7 : 4.4;
  const place = (path) => xf(xf(path, { dx: -233 }), { s, dx: 256, dy: 256 - (R3 ? 64 : 60) * s });
  return svg(512, 512, `<path d="${d(roundRect(0, 0, 512, 512, 112))}" fill="#EEF0FF"/>` + bubbleD({ place, sw: (R3 ? 6.2 : 8) * s * 0.8, color: INK }));
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
const DARK = '#FAFAFA';
const all = { A_dark: conceptA({ ink: DARK, accent: '#818CF8' }), B_dark: conceptB({ ink: DARK }), C_dark: conceptC({ ink: DARK }), A: conceptA(), A_icon: iconA(), B: conceptB(), B_icon: iconB(), C: conceptC(), C_icon: iconC() };
const OUTDIR = process.argv[2] ? `${OUT}/../${process.argv[2]}` : OUT;
for (const [k, v] of Object.entries(all)) {
  writeFileSync(`${OUTDIR}/${k}.svg`, v);
  if (k.endsWith('icon')) { writeFileSync(`${OUTDIR}/${k}@168.svg`, atWidth(v, 168)); writeFileSync(`${OUTDIR}/${k}@48.svg`, atWidth(v, 48)); }
  else writeFileSync(`${OUTDIR}/${k}@500.svg`, atWidth(v, 500));
}
writeFileSync(`${OUT}/all.json`, JSON.stringify(all));
console.log(Object.keys(all).join(' '));

}
