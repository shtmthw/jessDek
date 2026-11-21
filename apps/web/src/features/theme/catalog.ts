import { ITEM_COLORS } from '../avatar/palettes';

/**
 * Everything a chat theme can be made of. Recipes store the `id`s; labels are for the theme sheet.
 * Order is display order. Unknown ids in a recipe fall back to the first entry (see recipe.ts), so
 * entries can be added freely, and renamed or removed with care.
 */

export interface Option {
  id: string;
  label: string;
}

/** One mode's look of a wallpaper: a colour, or a gradient when there are several stops. */
export interface Fill {
  stops: readonly string[];
  /** Gradient angle in CSS degrees (180 = top to bottom). */
  angle?: number;
}

/**
 * An accent: your bubbles and the send button. `light`/`dark` are the bubble fills in each mode;
 * the text on them (white or ink) and a readable text version are worked out in resolve.ts.
 */
export interface Accent extends Option {
  light: string;
  dark: string;
}

export const ACCENTS: readonly Accent[] = [
  { id: 'indigo', label: 'Indigo', light: '#4f46e5', dark: '#5850ec' },
  { id: 'lilac', label: 'Lilac', light: '#7650e8', dark: '#7a58ee' },
  { id: 'sky', label: 'Sky', light: '#0a74c4', dark: '#0f76c6' },
  { id: 'teal', label: 'Teal', light: '#0b7d72', dark: '#0d8073' },
  { id: 'green', label: 'Green', light: '#1c7f45', dark: '#1d8147' },
  { id: 'lemon', label: 'Lemon', light: '#fcd34d', dark: '#f5c542' },
  { id: 'orange', label: 'Orange', light: '#c55315', dark: '#c75618' },
  { id: 'red', label: 'Red', light: '#d93636', dark: '#d83a3c' },
  { id: 'rose', label: 'Rose', light: '#d03a75', dark: '#d03b77' },
  { id: 'blush', label: 'Blush', light: '#f9b8cb', dark: '#f2a7bf' },
  { id: 'mint', label: 'Mint', light: '#a3e6c3', dark: '#8fdab3' },
  { id: 'denim', label: 'Denim', light: '#45679e', dark: '#4f72ab' },
  { id: 'cocoa', label: 'Cocoa', light: '#8f5a30', dark: '#9c653a' },
  { id: 'ink', label: 'Ink', light: '#27272a', dark: '#e4e4e7' },
];

export interface Wall extends Option {
  light: Fill;
  dark: Fill;
}

const flat = (light: string, dark: string) => ({
  light: { stops: [light] },
  dark: { stops: [dark] },
});
const grad = (light: string[], dark: string[], angle = 160) => ({
  light: { stops: light, angle },
  dark: { stops: dark, angle },
});

/** Wallpapers. Each has a hand-tuned dark twin: a deep, quiet version of the same hue. */
export const WALLS: readonly Wall[] = [
  { id: 'plain', label: 'Plain', ...flat('#ffffff', '#09090b') },
  { id: 'cream', label: 'Cream', ...flat('#fbf6ea', '#1f1b13') },
  { id: 'blush', label: 'Blush', ...flat('#fde6ea', '#2a1820') },
  { id: 'peach', label: 'Peach', ...flat('#ffe6d5', '#2a1c14') },
  { id: 'lemon', label: 'Lemon', ...flat('#fff5c4', '#25200f') },
  { id: 'mint', label: 'Mint', ...flat('#dbf5e7', '#11241b') },
  { id: 'sage', label: 'Sage', ...flat('#e4eddc', '#1a2218') },
  { id: 'sky', label: 'Sky', ...flat('#dcedfc', '#10202f') },
  { id: 'periwinkle', label: 'Periwinkle', ...flat('#e4e7ff', '#171a30') },
  { id: 'lavender', label: 'Lavender', ...flat('#efe7ff', '#20172e') },
  { id: 'sand', label: 'Sand', ...flat('#f2e6d2', '#241e16') },
  { id: 'mist', label: 'Mist', ...flat('#f1f1f3', '#16161a') },
  {
    id: 'sunset',
    label: 'Sunset',
    ...grad(['#ffe2c4', '#ffd5d3', '#ffd6e8'], ['#2c1b12', '#2e1820', '#291630']),
  },
  {
    id: 'ocean',
    label: 'Ocean',
    ...grad(['#d7f1ff', '#dbe0fe', '#e6ddff'], ['#0e2130', '#141b3d', '#1d1638']),
  },
  {
    id: 'candy',
    label: 'Candy',
    ...grad(['#fde3f1', '#f0e3fd', '#e2e2fe'], ['#2a1722', '#21182e', '#181b34']),
  },
  {
    id: 'aurora',
    label: 'Aurora',
    ...grad(['#d7f7ea', '#e0e8fd', '#f1e4fd'], ['#0e261f', '#121a33', '#211435'], 150),
  },
  {
    id: 'lemonade',
    label: 'Lemonade',
    ...grad(['#fff7c9', '#ffe8cf', '#ffdde5'], ['#25200f', '#2a1d13', '#2a161e'], 165),
  },
  {
    id: 'fizz',
    label: 'Mint fizz',
    ...grad(['#f0fcd2', '#d8f7e7', '#d3f3f2'], ['#1b240f', '#112219', '#0f2122']),
  },
  {
    id: 'galaxy',
    label: 'Galaxy',
    ...grad(['#e5e7ff', '#ece4ff', '#f6e4ff'], ['#0d1430', '#22164f', '#2f135c'], 165),
  },
];

export type DoodleKind = 'none' | 'pattern' | 'scatter';

export interface Doodle extends Option {
  kind: DoodleKind;
}

/**
 * The doodle layer over the wallpaper. `pattern`s reuse the card's repeating tiles; `scatter`s
 * re-draw card stickers as fine line art (see doodles.tsx).
 */
export const DOODLES: readonly Doodle[] = [
  { id: 'none', label: 'None', kind: 'none' },
  { id: 'doodles', label: 'Doodles', kind: 'scatter' },
  { id: 'snacks', label: 'Snacks', kind: 'scatter' },
  { id: 'nature', label: 'Nature', kind: 'scatter' },
  { id: 'space', label: 'Space', kind: 'scatter' },
  { id: 'pets', label: 'Pets', kind: 'scatter' },
  { id: 'music', label: 'Music', kind: 'scatter' },
  { id: 'games', label: 'Games', kind: 'scatter' },
  { id: 'hearts', label: 'Hearts', kind: 'pattern' },
  { id: 'stars', label: 'Stars', kind: 'pattern' },
  { id: 'dots', label: 'Dots', kind: 'pattern' },
  { id: 'clouds', label: 'Clouds', kind: 'pattern' },
  { id: 'waves', label: 'Waves', kind: 'pattern' },
  { id: 'sprinkles', label: 'Sprinkles', kind: 'pattern' },
  { id: 'confetti', label: 'Confetti', kind: 'pattern' },
  { id: 'bubbles', label: 'Bubbles', kind: 'pattern' },
  { id: 'grid', label: 'Grid', kind: 'pattern' },
];

export type BubbleStyle = 'solid' | 'soft' | 'outline';

export const BUBBLES: ReadonlyArray<Option & { id: BubbleStyle }> = [
  { id: 'solid', label: 'Solid' },
  { id: 'soft', label: 'Soft' },
  { id: 'outline', label: 'Outline' },
];

const item = (id: string) => ITEM_COLORS.find((c) => c.id === id)!.color;

/** Group members' colours: the avatar kit's item colours. Order is the automatic order. */
export const MEMBER_COLORS: ReadonlyArray<Option & { color: string }> = [
  { id: 'sky', label: 'Sky', color: item('sky') },
  { id: 'orange', label: 'Orange', color: item('orange') },
  { id: 'green', label: 'Green', color: item('green') },
  { id: 'rose', label: 'Rose', color: item('rose') },
  { id: 'lilac', label: 'Lilac', color: item('lilac') },
  { id: 'gold', label: 'Gold', color: item('gold') },
  { id: 'teal', label: 'Teal', color: item('teal') },
  { id: 'red', label: 'Red', color: item('red') },
  { id: 'denim', label: 'Denim', color: item('denim') },
  { id: 'tan', label: 'Tan', color: item('tan') },
];

export const byId = <T extends { id: string }>(list: readonly T[], id: string | undefined) =>
  list.find((x) => x.id === id) ?? list[0]!;
