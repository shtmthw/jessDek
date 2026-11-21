import { ITEM_COLORS } from '../avatar/palettes';

/**
 * Everything a card's look can be. Recipes store the `id`s; labels are for the studio. Order is
 * display order. Unknown ids in a recipe fall back to the default (see recipe.ts), so entries can be
 * added freely, and renamed or removed with care.
 */

export interface Option {
  id: string;
  label: string;
}

const item = (id: string) => ITEM_COLORS.find((c) => c.id === id)!.color;

/** Colours for text, accents, borders and stickers. The item colours of the avatar kit, plus ink and white. */
export const COLORS = [
  { id: 'ink', label: 'Ink', color: '#18181b' },
  { id: 'white', label: 'White', color: '#ffffff' },
  { id: 'indigo', label: 'Indigo', color: item('indigo') },
  { id: 'sky', label: 'Sky', color: item('sky') },
  { id: 'teal', label: 'Teal', color: item('teal') },
  { id: 'green', label: 'Green', color: item('green') },
  { id: 'yellow', label: 'Yellow', color: item('yellow') },
  { id: 'orange', label: 'Orange', color: item('orange') },
  { id: 'red', label: 'Red', color: item('red') },
  { id: 'rose', label: 'Rose', color: item('rose') },
  { id: 'lilac', label: 'Lilac', color: item('lilac') },
  { id: 'denim', label: 'Denim', color: item('denim') },
  { id: 'tan', label: 'Tan', color: item('tan') },
  { id: 'charcoal', label: 'Charcoal', color: item('charcoal') },
] as const satisfies ReadonlyArray<Option & { color: string }>;

export const colorHex = (id: string, fallback = '#18181b') =>
  COLORS.find((c) => c.id === id)?.color ?? fallback;

export interface Background extends Option {
  /** A CSS background: a colour or a gradient. */
  css: string;
  /** A colour that stands for it (swatches, theme-color, mixing). */
  base: string;
  /** Light text reads better on it. */
  dark: boolean;
  kind: 'solid' | 'gradient';
}

const solid = (id: string, label: string, color: string, dark = false): Background => ({
  id,
  label,
  css: color,
  base: color,
  dark,
  kind: 'solid',
});
const gradient = (
  id: string,
  label: string,
  stops: string[],
  angle: number,
  dark = false,
): Background => ({
  id,
  label,
  css: `linear-gradient(${angle}deg, ${stops.join(', ')})`,
  base: stops[Math.floor(stops.length / 2)]!,
  dark,
  kind: 'gradient',
});

export const BACKGROUNDS: readonly Background[] = [
  solid('paper', 'Paper', '#ffffff'),
  solid('cream', 'Cream', '#fbf6ea'),
  solid('sand', 'Sand', '#f1e3cc'),
  solid('blush', 'Blush', '#fde4e6'),
  solid('peach', 'Peach', '#ffdcc4'),
  solid('lemon', 'Lemon', '#fff1b3'),
  solid('mint', 'Mint', '#d4f3e2'),
  solid('sky', 'Sky', '#d6ecfd'),
  solid('periwinkle', 'Periwinkle', '#dde1ff'),
  solid('lavender', 'Lavender', '#ebe0ff'),
  solid('rose', 'Rose', '#f8a5c6'),
  solid('coral', 'Coral', '#ff8e7f'),
  solid('sage', 'Sage', '#bcd5b3'),
  solid('denim', 'Denim', '#45679e', true),
  solid('ink', 'Ink', '#18181b', true),
  solid('midnight', 'Midnight', '#1e1b4b', true),
  gradient('sunset', 'Sunset', ['#ffd5a1', '#ffa8a0', '#ff8fb6'], 160),
  gradient('ocean', 'Ocean', ['#8ad8ff', '#7c8cf8', '#6a5cf0'], 160, true),
  gradient('mint-fizz', 'Mint fizz', ['#e3fba5', '#9bf0c8', '#6ee0d6'], 160),
  gradient('aurora', 'Aurora', ['#3ad7a7', '#7f9cf5', '#c084fc'], 150, true),
  gradient('candy', 'Candy', ['#fcd2ea', '#e4c8fb', '#c9c2fd'], 160),
  gradient('dusk', 'Dusk', ['#4f46e5', '#9d4edd', '#ec4899'], 155, true),
  gradient('forest', 'Forest', ['#14532d', '#2f6b3a', '#5d8a3a'], 165, true),
  gradient('lemonade', 'Lemonade', ['#fff3a3', '#ffd6a5', '#ffadc0'], 165),
  gradient('peachy', 'Peachy', ['#ffe4c7', '#ffd2cf', '#ffc6dc'], 160),
  gradient('galaxy', 'Galaxy', ['#0b1026', '#2a1655', '#4c1d95'], 160, true),
  gradient('sherbet', 'Sherbet', ['#ffc58a', '#ffb1d6', '#ffe58f'], 135),
  gradient('mono', 'Mono', ['#fafafa', '#e9e9ec', '#d4d4d8'], 165),
];

export const PATTERNS: readonly Option[] = [
  { id: 'none', label: 'None' },
  { id: 'dots', label: 'Dots' },
  { id: 'grid', label: 'Grid' },
  { id: 'stripes', label: 'Stripes' },
  { id: 'checkers', label: 'Checkers' },
  { id: 'waves', label: 'Waves' },
  { id: 'zigzag', label: 'Zigzag' },
  { id: 'stars', label: 'Stars' },
  { id: 'hearts', label: 'Hearts' },
  { id: 'confetti', label: 'Confetti' },
  { id: 'sprinkles', label: 'Sprinkles' },
  { id: 'crosses', label: 'Crosses' },
  { id: 'bubbles', label: 'Bubbles' },
  { id: 'diamonds', label: 'Diamonds' },
  { id: 'clouds', label: 'Clouds' },
];

export const PATTERN_TONES: readonly Option[] = [
  { id: 'soft', label: 'Soft' },
  { id: 'bold', label: 'Bold' },
  { id: 'white', label: 'White' },
  { id: 'accent', label: 'Accent' },
];

/** Text colour: `auto` picks dark or light text for the background. */
export const INKS: readonly Option[] = [{ id: 'auto', label: 'Auto' }, ...COLORS];

export const ACCENTS: readonly Option[] = COLORS.filter((c) => c.id !== 'white');

export const BORDERS: readonly Option[] = [
  { id: 'none', label: 'None' },
  { id: 'thin', label: 'Thin' },
  { id: 'thick', label: 'Thick' },
  { id: 'double', label: 'Double' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'dotted', label: 'Dotted' },
  { id: 'sketch', label: 'Sketch' },
  { id: 'stitched', label: 'Stitched' },
  { id: 'ticket', label: 'Ticket' },
  { id: 'frame', label: 'Frame' },
  { id: 'glow', label: 'Glow' },
  { id: 'foil', label: 'Foil' },
];

/** The border's colour, also used for the avatar ring. `ink` follows the text colour, `accent` the accent. */
export const BORDER_COLORS: readonly Option[] = [
  { id: 'ink', label: 'Text color' },
  { id: 'accent', label: 'Accent' },
  ...COLORS.filter((c) => c.id !== 'ink'),
];

export const CORNERS = [
  { id: 'square', label: 'Square', radius: 6 },
  { id: 'soft', label: 'Soft', radius: 16 },
  { id: 'round', label: 'Round', radius: 26 },
  { id: 'extra', label: 'Extra round', radius: 40 },
] as const satisfies ReadonlyArray<Option & { radius: number }>;

export const FINISHES: readonly Option[] = [
  { id: 'matte', label: 'Matte' },
  { id: 'gloss', label: 'Gloss' },
  { id: 'holo', label: 'Holographic' },
  { id: 'glitter', label: 'Glitter' },
  { id: 'paper', label: 'Paper' },
];

export const FRAMES: readonly Option[] = [
  { id: 'none', label: 'Cut-out' },
  { id: 'circle', label: 'Circle' },
  { id: 'squircle', label: 'Squircle' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'arch', label: 'Arch' },
  { id: 'blob', label: 'Blob' },
  { id: 'hexagon', label: 'Hexagon' },
  { id: 'stamp', label: 'Stamp' },
];

export const RINGS: readonly Option[] = [
  { id: 'none', label: 'None' },
  { id: 'thin', label: 'Thin' },
  { id: 'thick', label: 'Thick' },
  { id: 'double', label: 'Double' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'rainbow', label: 'Rainbow' },
  { id: 'glow', label: 'Glow' },
];

export const LAYOUTS: readonly Option[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'centered', label: 'Centered' },
  { id: 'side', label: 'Side by side' },
  { id: 'banner', label: 'Banner' },
];

export const NAMES: readonly Option[] = [
  { id: 'username', label: '@username' },
  { id: 'both', label: 'Name + @username' },
];

export const ALIGNS: readonly Option[] = [
  { id: 'center', label: 'Center' },
  { id: 'left', label: 'Left' },
];

export const DIVIDERS: readonly Option[] = [
  { id: 'none', label: 'None' },
  { id: 'line', label: 'Line' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'dotted', label: 'Dotted' },
  { id: 'wavy', label: 'Wavy' },
  { id: 'zigzag', label: 'Zigzag' },
  { id: 'stars', label: 'Stars' },
  { id: 'sketch', label: 'Sketch' },
];

export const CHIPS: readonly Option[] = [
  { id: 'plain', label: 'Plain' },
  { id: 'pill', label: 'Pills' },
  { id: 'outline', label: 'Outline' },
  { id: 'tag', label: 'Hashtags' },
  { id: 'sticker', label: 'Stickers' },
];

export const BUTTONS: readonly Option[] = [
  { id: 'sketch', label: 'Sketch' },
  { id: 'solid', label: 'Solid' },
  { id: 'soft', label: 'Soft' },
  { id: 'outline', label: 'Outline' },
  { id: 'pill', label: 'Pill' },
];

export interface Font extends Option {
  /** CSS font-family. */
  family: string;
  /** Size multiplier, so every font fills about the same space. */
  scale: number;
  /** Weight for names and headings. */
  bold: number;
  /** Weight for body text. */
  regular: number;
  /** Line height for body text, in layout px. */
  leading: number;
  /** Average glyph width in em at scale 1, for fitting names on one line. */
  advance: number;
}

const SANS = 'ui-sans-serif, system-ui, sans-serif';
export const FONTS: readonly Font[] = [
  {
    id: 'clean',
    label: 'Clean',
    family: `'Figtree Variable', ${SANS}`,
    scale: 1,
    bold: 700,
    regular: 450,
    leading: 19,
    advance: 0.55,
  },
  {
    id: 'bubbly',
    label: 'Bubbly',
    family: `'Fredoka Variable', ${SANS}`,
    scale: 1,
    bold: 600,
    regular: 430,
    leading: 19,
    advance: 0.56,
  },
  {
    id: 'storybook',
    label: 'Storybook',
    family: `'Fraunces Variable', ui-serif, Georgia, serif`,
    scale: 0.97,
    bold: 650,
    regular: 420,
    leading: 19,
    advance: 0.56,
  },
  {
    id: 'typewriter',
    label: 'Typewriter',
    family: `'JetBrains Mono Variable', ui-monospace, monospace`,
    scale: 0.86,
    bold: 700,
    regular: 420,
    leading: 18.5,
    advance: 0.6,
  },
  {
    id: 'handwritten',
    label: 'Handwritten',
    family: `'Caveat Variable', cursive`,
    scale: 1.3,
    bold: 700,
    regular: 520,
    leading: 19.5,
    advance: 0.42,
  },
  {
    id: 'marker',
    label: 'Marker',
    family: `'Permanent Marker', cursive`,
    scale: 0.92,
    bold: 400,
    regular: 400,
    leading: 19.5,
    advance: 0.62,
  },
  {
    id: 'pixel',
    label: 'Pixel',
    family: `'Pixelify Sans Variable', ui-monospace, monospace`,
    scale: 0.98,
    bold: 650,
    regular: 450,
    leading: 19,
    advance: 0.6,
  },
];

/** Every style key a recipe has, with the ids it accepts. */
export const STYLE_OPTIONS = {
  layout: LAYOUTS,
  name: NAMES,
  align: ALIGNS,
  font: FONTS,
  bg: BACKGROUNDS,
  pattern: PATTERNS,
  patternTone: PATTERN_TONES,
  ink: INKS,
  accent: ACCENTS,
  border: BORDERS,
  borderColor: BORDER_COLORS,
  corners: CORNERS,
  finish: FINISHES,
  frame: FRAMES,
  ring: RINGS,
  divider: DIVIDERS,
  chips: CHIPS,
  button: BUTTONS,
} as const satisfies Record<string, readonly Option[]>;

export type StyleKey = keyof typeof STYLE_OPTIONS;

export const optionIds = (key: StyleKey): string[] =>
  (STYLE_OPTIONS[key] as readonly Option[]).map((o) => o.id);

export const optionLabel = (key: StyleKey, id: string) =>
  (STYLE_OPTIONS[key] as readonly Option[]).find((o) => o.id === id)?.label ?? id;
