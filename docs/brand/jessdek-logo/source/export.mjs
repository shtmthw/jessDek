// Builds the final, drop-in asset set for every concept.
//   node export.mjs <concepts-dir>
// Needs `resvg` on PATH for the PNGs (Arch: pacman -S resvg).
// For each concept it writes wordmark.svg, wordmark-dark.svg, icon.svg (512 rounded tile),
// icon-maskable.svg (full-bleed square, art in the 80 % safe zone) and png/ with
// icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png (180, full bleed).
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const OUT = resolve(process.argv[2] ?? 'concepts');
// The builders read their round from argv when the module loads: A–C use the round-3 look, D–G round 6.
process.argv[2] = 'out_v3';
process.argv[3] = '6';
const v1 = await import('./concepts.mjs');
const v2 = await import('./concepts2.mjs');

const DARK = '#FAFAFA';
const CONCEPTS = {
  'a-ink': { light: () => v1.conceptA(), dark: () => v1.conceptA({ ink: DARK, accent: '#818CF8' }), icon: v1.iconA },
  'b-deck': { light: () => v1.conceptB(), dark: () => v1.conceptB({ ink: DARK }), icon: v1.iconB },
  'c-bubble': { light: () => v1.conceptC(), dark: () => v1.conceptC({ ink: DARK }), icon: v1.iconC },
  'd-sticker': { light: () => v2.conceptD(), dark: () => v2.conceptD({ dark: true }), icon: v2.iconD },
  'e-peek': { light: () => v2.conceptE(), dark: () => v2.conceptE({ ink: DARK }), icon: v2.iconE, band: 318 },
  'f-monogram': { light: () => v2.conceptF(), dark: () => v2.conceptF({ ink: DARK, spark: '#818CF8' }), icon: v2.iconF },
  'g-swash': { light: () => v2.conceptG(), dark: () => v2.conceptG({ ink: DARK, spark: '#818CF8' }), icon: v2.iconG },
};

/** Full-bleed square version of a 512 tile icon with the art scaled into the centre (k = 0.8 for maskable). */
function fullBleed(iconSvg, k, band) {
  const inner = iconSvg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const [, tile, rest] = inner.match(/^(<path [^>]*\/>)([\s\S]*)$/);
  const bg = tile.match(/fill="([^"]+)"/)[1];
  let art = rest, under = '';
  if (band) {
    // E · Peek: the indigo band must still run to the edges, so draw it outside the scaled art.
    const [, bandEl, after] = rest.match(/^(<path [^>]*\/>)([\s\S]*)$/);
    const fill = bandEl.match(/fill="([^"]+)"/)[1];
    const y = 256 + k * (band - 256);
    under = `<rect x="0" y="${y.toFixed(2)}" width="512" height="${(512 - y).toFixed(2)}" fill="${fill}"/>`;
    art = after;
  }
  const t = (256 * (1 - k)).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="512" height="512" fill="${bg}"/>${under}<g transform="translate(${t} ${t}) scale(${k})">${art}</g></svg>`;
}

const png = (svgPath, outPath, w) => execFileSync('resvg', ['-w', String(w), svgPath, outPath]);

for (const [name, c] of Object.entries(CONCEPTS)) {
  const dir = join(OUT, name), pdir = join(dir, 'png');
  mkdirSync(pdir, { recursive: true });
  const icon = c.icon();
  const files = {
    'wordmark.svg': c.light(),
    'wordmark-dark.svg': c.dark(),
    'icon.svg': icon,
    'icon-maskable.svg': fullBleed(icon, 0.8, c.band),
    '.apple.svg': fullBleed(icon, 0.9, c.band),
  };
  for (const [f, s] of Object.entries(files)) writeFileSync(join(dir, f), s + '\n');
  png(join(dir, 'icon.svg'), join(pdir, 'icon-192.png'), 192);
  png(join(dir, 'icon.svg'), join(pdir, 'icon-512.png'), 512);
  png(join(dir, 'icon-maskable.svg'), join(pdir, 'icon-maskable-512.png'), 512);
  png(join(dir, '.apple.svg'), join(pdir, 'apple-touch-icon.png'), 180);
  png(join(dir, 'wordmark.svg'), join(pdir, 'wordmark@2x.png'), 1000);
  png(join(dir, 'wordmark-dark.svg'), join(pdir, 'wordmark-dark@2x.png'), 1000);
  execFileSync('rm', [join(dir, '.apple.svg')]);
  console.log('wrote', name);
}
