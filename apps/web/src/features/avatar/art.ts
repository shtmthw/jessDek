import type { ReactNode, SVGProps } from 'react';

/**
 * Shared vocabulary for the avatar art. Everything is drawn on a 200 × 200 canvas: the head spans
 * roughly x 50–150 and y 50–148, the ears sit at the sides around y 106, the shoulders start near
 * y 150 and run off the bottom, and hats may reach up to y ≈ 6.
 */

/** The outline colour: the app's ink, a touch softer than pure black. */
export const INK = '#18181b';
/** Outline width for silhouettes (head, hair, clothes). About 1 px at a 40 px avatar. */
export const SW = 6;
/** Width for drawn details: mouths, brows, folds. */
export const DW = 4.4;

/** Resolved colours for one avatar, handed to every part. */
export interface Paint {
  skin: string;
  skinShade: string;
  blush: string;
  hair: string;
  hairShade: string;
  hairShine: string;
  /** Brows follow the hair, but never get lighter than a readable mid-tone. */
  brow: string;
  eye: string;
  hat: string;
  hatShade: string;
  hatTint: string;
  top: string;
  topShade: string;
  topTint: string;
  neck: string;
  neckShade: string;
  glasses: string;
  /** Hair clip. */
  clip: string;
  clipShade: string;
  /** Earrings. */
  earring: string;
  earringShade: string;
  /** The second colour of two-colour tops (the shirt under a blazer, a print, a patch, checks). */
  accent: string;
  accentShade: string;
  /** The slim build: skin-showing tops leave out the line at the base of the neck. */
  slim: boolean;
  /** Unique per rendered avatar, for clip path ids. */
  uid: string;
}

export type Draw = (p: Paint) => ReactNode;

/** A catalog entry: a label for the studio and the layers it draws. */
export interface Item {
  label: string;
  /** Drawn behind the body (long hair, hoods, tails). */
  back?: Draw;
  /**
   * Drawn over the clothes but behind the ears and face: hair tucked behind the ears that falls
   * in front of the shoulders, a braid over one shoulder.
   */
  mid?: Draw;
  /** Drawn in the item's normal slot. */
  front?: Draw;
}

export const outline = {
  stroke: INK,
  strokeWidth: SW,
  strokeLinejoin: 'round',
  strokeLinecap: 'round',
} as const satisfies SVGProps<SVGPathElement>;

export const detail = {
  stroke: INK,
  strokeWidth: DW,
  strokeLinejoin: 'round',
  strokeLinecap: 'round',
  fill: 'none',
} as const satisfies SVGProps<SVGPathElement>;

/** Mirror a drawing left ↔ right around the centre line. */
export const MIRROR = 'matrix(-1 0 0 1 200 0)';

/** A five-point star centred on (cx, cy). */
export const starPath = (cx: number, cy: number, r: number, inner = 0.48) => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * inner;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z`;
};

/** A heart centred on (cx, cy), about 2·s wide. */
export const heartPath = (cx: number, cy: number, s: number) =>
  `M${cx} ${cy + 0.85 * s} C${cx - 0.2 * s} ${cy + 0.6 * s} ${cx - 1.1 * s} ${cy + 0.1 * s} ${cx - 1.05 * s} ${cy - 0.42 * s} C${cx - 1 * s} ${cy - 0.95 * s} ${cx - 0.25 * s} ${cy - 1.05 * s} ${cx} ${cy - 0.5 * s} C${cx + 0.25 * s} ${cy - 1.05 * s} ${cx + 1 * s} ${cy - 0.95 * s} ${cx + 1.05 * s} ${cy - 0.42 * s} C${cx + 1.1 * s} ${cy + 0.1 * s} ${cx + 0.2 * s} ${cy + 0.6 * s} ${cx} ${cy + 0.85 * s} Z`;
