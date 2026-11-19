import { luminance, mix } from '../avatar/color';
import { BACKGROUNDS, colorHex, CORNERS, FONTS, type Background, type Font } from './catalog';
import type { CardRecipe } from './recipe';

/** The card's layout box. Every card is laid out at this size and scaled to fit. */
export const CARD_W = 320;
export const CARD_H = 540;
export const PAD = 20;

const DARK_INK = '#18181b';
const LIGHT_INK = '#fafafa';

/** Every colour and measure a card needs, resolved once from its recipe. */
export interface CardTheme {
  bg: Background;
  /** Text colour. */
  ink: string;
  /** Light text on a dark card. */
  dark: boolean;
  accent: string;
  /** The accent, nudged until it reads as text on the background. */
  accentText: string;
  /** Text on an accent-filled surface. */
  onAccent: string;
  /** A soft accent wash for chips and buttons. */
  accentWash: string;
  /** Border, avatar ring and dividers. */
  line: string;
  font: Font;
  radius: number;
}

const byId = <T extends { id: string }>(list: readonly T[], id: string) =>
  list.find((x) => x.id === id) ?? list[0]!;

export function cardTheme(card: CardRecipe): CardTheme {
  const bg = byId(BACKGROUNDS, card.bg);
  const accent = colorHex(card.accent, '#6366f1');
  const ink = card.ink === 'auto' ? (bg.dark ? LIGHT_INK : DARK_INK) : colorHex(card.ink);
  const dark = luminance(ink) > 0.5;
  const accentLum = luminance(accent);
  const accentText = dark
    ? accentLum < 0.2
      ? mix(accent, '#ffffff', 0.5)
      : accent
    : accentLum > 0.3
      ? mix(accent, DARK_INK, 0.45)
      : accent;
  const line =
    card.borderColor === 'accent'
      ? accent
      : card.borderColor === 'ink'
        ? ink
        : colorHex(card.borderColor, ink);
  return {
    bg,
    ink,
    dark,
    accent,
    accentText,
    onAccent: accentLum > 0.42 ? DARK_INK : '#ffffff',
    accentWash: bg.dark
      ? `color-mix(in srgb, ${accent} 30%, transparent)`
      : mix(accent, bg.base, 0.74),
    line,
    font: byId(FONTS, card.font),
    radius: byId(CORNERS, card.corners).radius,
  };
}

/**
 * A font size that keeps `text` on one line within `width`, from `base` down to `min`.
 * An estimate from the font's average glyph width; the text still wraps if it's off.
 */
export function fitSize(text: string, width: number, base: number, font: Font, min = base * 0.6) {
  const em = [...text].length * font.advance;
  if (em === 0) return base;
  return Math.max(min, Math.min(base, width / em));
}
