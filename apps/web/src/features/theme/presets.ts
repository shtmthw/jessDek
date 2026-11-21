import type { BubbleStyle } from './catalog';

/** A ready-made theme. Every field is a catalog id. */
export interface Preset {
  id: string;
  label: string;
  accent: string;
  wall: string;
  doodle: string;
  bubble: BubbleStyle;
}

/** Classic is the app's own look (no wallpaper, the app's colours): what a chat without a theme has. */
export const CLASSIC: Preset = {
  id: 'classic',
  label: 'Classic',
  accent: 'indigo',
  wall: 'plain',
  doodle: 'none',
  bubble: 'solid',
};

export const PRESETS: readonly Preset[] = [
  CLASSIC,
  {
    id: 'doodles',
    label: 'Doodles',
    accent: 'indigo',
    wall: 'mist',
    doodle: 'doodles',
    bubble: 'solid',
  },
  { id: 'blush', label: 'Blush', accent: 'rose', wall: 'blush', doodle: 'hearts', bubble: 'solid' },
  {
    id: 'matcha',
    label: 'Matcha',
    accent: 'green',
    wall: 'sage',
    doodle: 'nature',
    bubble: 'solid',
  },
  {
    id: 'lemonade',
    label: 'Lemonade',
    accent: 'orange',
    wall: 'lemonade',
    doodle: 'sprinkles',
    bubble: 'solid',
  },
  { id: 'ocean', label: 'Ocean', accent: 'sky', wall: 'ocean', doodle: 'waves', bubble: 'solid' },
  {
    id: 'lavender',
    label: 'Lavender',
    accent: 'lilac',
    wall: 'lavender',
    doodle: 'stars',
    bubble: 'solid',
  },
  { id: 'peach', label: 'Peach', accent: 'teal', wall: 'peach', doodle: 'dots', bubble: 'soft' },
  {
    id: 'candy',
    label: 'Candy',
    accent: 'blush',
    wall: 'candy',
    doodle: 'confetti',
    bubble: 'solid',
  },
  {
    id: 'snacks',
    label: 'Snacks',
    accent: 'orange',
    wall: 'cream',
    doodle: 'snacks',
    bubble: 'solid',
  },
  {
    id: 'space',
    label: 'Space',
    accent: 'indigo',
    wall: 'galaxy',
    doodle: 'space',
    bubble: 'solid',
  },
  { id: 'pets', label: 'Pets', accent: 'cocoa', wall: 'sand', doodle: 'pets', bubble: 'solid' },
  {
    id: 'sunset',
    label: 'Sunset',
    accent: 'red',
    wall: 'sunset',
    doodle: 'clouds',
    bubble: 'solid',
  },
  {
    id: 'notebook',
    label: 'Notebook',
    accent: 'ink',
    wall: 'cream',
    doodle: 'grid',
    bubble: 'outline',
  },
  {
    id: 'arcade',
    label: 'Arcade',
    accent: 'teal',
    wall: 'periwinkle',
    doodle: 'games',
    bubble: 'outline',
  },
  { id: 'soda', label: 'Soda', accent: 'mint', wall: 'fizz', doodle: 'bubbles', bubble: 'solid' },
  {
    id: 'mixtape',
    label: 'Mixtape',
    accent: 'lilac',
    wall: 'sky',
    doodle: 'music',
    bubble: 'soft',
  },
];

export const presetById = (id: string | undefined) => PRESETS.find((p) => p.id === id);
