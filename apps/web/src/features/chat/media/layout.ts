/**
 * Box sizes for media in a bubble. Every box is known from metadata alone, so nothing ever shifts
 * when a photo arrives (MEDIA_PLAN.md §8.3).
 */
export const MIN_W = 160;
export const MAX_W = 340;
export const MAX_H = 420;
export const ALBUM_W = 320;
export const MAX_ALBUM_TILES = 4;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export interface SingleLayout {
  kind: 'single';
  /** Pixel width of the box (before the 72vw cap). */
  boxW: number;
  ratio: number;
  style: { width: string; aspectRatio: string };
}

export interface AlbumLayout {
  kind: 'album';
  /** Tiles drawn; the rest are summarised as "+n" on the last one. */
  shown: number;
  extra: number;
  /** Tailwind classes for the grid container. */
  grid: string;
  /** Per-tile classes (the first tile of a 3-up spans both rows). */
  tiles: string[];
  style: { width: string; aspectRatio: string };
}

export type MediaLayout = SingleLayout | AlbumLayout;

export function singleLayout(width: number, height: number): SingleLayout {
  const ratio = clamp(width / Math.max(1, height), 0.5, 2.4);
  const boxW = Math.max(MIN_W, Math.min(MAX_W, MAX_H * ratio, width));
  return {
    kind: 'single',
    boxW,
    ratio,
    style: { width: `min(${Math.round(boxW)}px, 72vw)`, aspectRatio: String(ratio) },
  };
}

export function albumLayout(count: number): AlbumLayout {
  const shown = Math.min(count, MAX_ALBUM_TILES);
  const width = `min(${ALBUM_W}px, 72vw)`;
  if (shown <= 2) {
    return {
      kind: 'album',
      shown,
      extra: 0,
      grid: 'grid-cols-2',
      tiles: ['', ''].slice(0, shown),
      style: { width, aspectRatio: '2 / 1.2' },
    };
  }
  if (shown === 3) {
    return {
      kind: 'album',
      shown,
      extra: 0,
      grid: 'grid-cols-[2fr_1fr] grid-rows-2',
      tiles: ['row-span-2', '', ''],
      style: { width, aspectRatio: '1.2' },
    };
  }
  return {
    kind: 'album',
    shown,
    extra: count - MAX_ALBUM_TILES,
    grid: 'grid-cols-2 grid-rows-2',
    tiles: ['', '', '', ''],
    style: { width, aspectRatio: '1' },
  };
}

export const layoutFor = (items: ReadonlyArray<{ width: number; height: number }>): MediaLayout =>
  items.length === 1 ? singleLayout(items[0]!.width, items[0]!.height) : albumLayout(items.length);
