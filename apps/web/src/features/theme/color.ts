import { luminance, mix } from '../avatar/color';

export { luminance, mix };

export const INK = '#18181b';
export const WHITE = '#ffffff';

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * `fg`, moved towards black or white (whichever `bg` contrasts with more) in small steps until it
 * reads on `bg` at `ratio`. Colours that already pass come back unchanged.
 */
export function ensureContrast(fg: string, bg: string, ratio = 4.5): string {
  if (contrast(fg, bg) >= ratio) return fg;
  const toward = luminance(bg) > 0.18 ? '#000000' : WHITE;
  for (let t = 0.05; t <= 1; t += 0.05) {
    const c = mix(fg, toward, t);
    if (contrast(c, bg) >= ratio) return c;
  }
  return toward;
}

/** Ink or white, whichever reads better on `bg`. */
export const textOn = (bg: string) => (contrast(WHITE, bg) >= contrast(INK, bg) ? WHITE : INK);

/** The average of a few colours (a gradient's stand-in for contrast checks). */
export function average(colors: readonly string[]): string {
  let out = colors[0]!;
  colors.slice(1).forEach((c, i) => (out = mix(out, c, 1 / (i + 2))));
  return out;
}
