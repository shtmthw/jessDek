// jessDek logo generator: hand-built monoline letters, baked transforms, seeded wobble.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(OUT, { recursive: true });

export const INK = '#18181B';
export const BRAND = '#4F46E5';
export const BLUSH = '#FFA3B1';
export const PAPER = '#FFFFFF';

// ---------- tiny path toolkit ----------
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const reseed = (s) => (seed = s);

/** path = [['M',x,y],['L',x,y],['C',x1,y1,x2,y2,x,y],['Z']] */
function xf(path, { dx = 0, dy = 0, rot = 0, cx = 0, cy = 0, s = 1, wob = 0 } = {}) {
  const r = (rot * Math.PI) / 180;
  const cos = Math.cos(r), sin = Math.sin(r);
  return path.map(([cmd, ...n]) => {
    const out = [cmd];
    for (let i = 0; i < n.length; i += 2) {
      let x = n[i] + (wob ? rnd() * wob : 0), y = n[i + 1] + (wob ? rnd() * wob : 0);
      x -= cx; y -= cy;
      const X = (x * cos - y * sin) * s + cx + dx;
      const Y = (x * sin + y * cos) * s + cy + dy;
      out.push(+X.toFixed(2), +Y.toFixed(2));
    }
    return out;
  });
}
const d = (path) => path.map(([c, ...n]) => c + n.join(' ')).join(' ');
const p = (str) => {
  // parse simple absolute "M x y L x y C ... Z" strings into arrays
  const toks = str.match(/[MLCZ]|-?\d*\.?\d+/g);
  const res = []; let cur;
  for (const t of toks) {
    if (/[MLCZ]/.test(t)) { cur = [t]; res.push(cur); } else cur.push(+t);
  }
  return res;
};

// ---------- glyphs (x-height 41..101, cap 13, baseline 101) ----------
const G = {
  j: { w: 24, paths: [p('M22 43 L22 113 C22 127 15 133 4 130')], dot: [22, 21] },
  e: { w: 52, paths: [p('M42 72 L87 71 C87 52 77 41 64 41 C49 41 40 54 40 71 C40 89 51 101 65 101 C74 101 80 98 85 92')], x0: 40 },
  s: { w: 42, paths: [p('M135 50 C131 44 125 41 118 41 C108 41 102 47 102 55 C102 64 109 67 119 70 C131 73 137 77 137 87 C137 96 130 101 119 101 C109 101 103 97 99 91')], x0: 98 },
  D: { w: 66, paths: [p('M203 15 L203 101 L222 101 C250 101 267 84 267 58 C267 32 250 15 222 15 Z')], x0: 202 },
  k: { w: 40, paths: [p('M346 9 L346 101'), p('M381 43 L347 75'), p('M360 63 L384 101')], x0: 346 },
};

/** lay out a word; each letter gets a tiny tilt + baseline bounce for the hand feel */
function word(letters, { x = 0, y = 0, gap = 11, wob = 0.6, sw = 8, color = INK, s = 1, jitter = true, special = {} } = {}) {
  const parts = []; let pen = x;
  const feel = [[-1.5, 0], [1.2, -0.5], [-1, 0.8], [1.6, -0.3], [-0.8, 0.6], [1, -0.6], [-1.2, 0.4]];
  letters.split('').forEach((ch, i) => {
    const g = G[ch];
    const x0 = g.x0 ?? 0;
    const [rot, bob] = jitter ? feel[i % feel.length] : [0, 0];
    const cx = x0 + g.w / 2, cy = 70;
    const dyy = y + bob * s;
    const place = (path) => xf(xf(xf(xf(path, { rot, cx, cy, wob }), { dx: -x0 }), { s }), { dx: pen, dy: dyy });
    if (special[ch + i]) {
      parts.push(special[ch + i]({ place, pen, y: dyy, s, sw, color, x0 }));
    } else {
      for (const path of g.paths) {
        parts.push(`<path d="${d(place(path))}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`);
      }
    }
    if (g.dot) parts.push({ dot: [pen + (g.dot[0] - x0) * s, dyy + g.dot[1] * s] });
    pen += g.w * s + gap * s;
  });
  return { parts, width: pen - x - gap * s };
}

function sparkle(cx, cy, r, fill, { stroke = null, sw = 0, rot = 0 } = {}) {
  const k = r * 0.18; // pinch
  const path = p(`M${cx} ${cy - r} C${cx + k} ${cy - k} ${cx + k} ${cy - k} ${cx + r} ${cy} C${cx + k} ${cy + k} ${cx + k} ${cy + k} ${cx} ${cy + r} C${cx - k} ${cy + k} ${cx - k} ${cy + k} ${cx - r} ${cy} C${cx - k} ${cy - k} ${cx - k} ${cy - k} ${cx} ${cy - r} Z`);
  return `<path d="${d(xf(path, { rot, cx, cy }))}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"` : ''}/>`;
}

function roundRect(x, y, w, h, r) {
  const k = r * 0.5523;
  return p(`M${x + r} ${y} L${x + w - r} ${y} C${x + w - r + k} ${y} ${x + w} ${y + r - k} ${x + w} ${y + r} L${x + w} ${y + h - r} C${x + w} ${y + h - r + k} ${x + w - r + k} ${y + h} ${x + w - r} ${y + h} L${x + r} ${y + h} C${x + r - k} ${y + h} ${x} ${y + h - r + k} ${x} ${y + h - r} L${x} ${y + r} C${x} ${y + r - k} ${x + r - k} ${y} ${x + r} ${y} Z`);
}
const ellipse = (cx, cy, rx, ry, fill, extra = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${extra}/>`;

const svg = (w, h, body, bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ''}${body}</svg>`;

function render(parts, dotFn) {
  return parts.map((q) => (typeof q === 'string' ? q : dotFn(q.dot))).join('');
}

export { word, sparkle, roundRect, ellipse, svg, render, xf, d, p, reseed, OUT, writeFileSync, G };

/** Bake an affine (uniform scale s, then translate tx,ty) into absolute-coordinate SVG markup. */
export function affine(markup, s, tx = 0, ty = 0) {
  const num = (v) => +(+v).toFixed(2);
  return markup
    .replace(/ d="([^"]+)"/g, (_, dd) => {
      let i = 0;
      const out = dd.replace(/-?\d*\.?\d+/g, (n) => num(i++ % 2 === 0 ? n * s + tx : n * s + ty));
      return ` d="${out}"`;
    })
    .replace(/ (cx|x)="(-?[\d.]+)"/g, (_, a, v) => ` ${a}="${num(v * s + tx)}"`)
    .replace(/ (cy|y)="(-?[\d.]+)"/g, (_, a, v) => ` ${a}="${num(v * s + ty)}"`)
    .replace(/ (rx|ry|r|stroke-width|width|height)="([\d.]+)"/g, (_, a, v) => ` ${a}="${num(v * s)}"`);
}
/** Rescale a whole generated SVG so it imports 1:1 at width w (Penpot ignores width/height attrs). */
export function atWidth(svgStr, w) {
  const [, W, H] = svgStr.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const k = w / +W;
  const inner = svgStr.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num2(W * k)} ${num2(H * k)}" width="${num2(W * k)}" height="${num2(H * k)}">${affine(inner, k)}</svg>`;
}
const num2 = (v) => +(+v).toFixed(2);
