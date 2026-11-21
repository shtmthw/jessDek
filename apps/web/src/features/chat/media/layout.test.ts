import { albumLayout, layoutFor, MAX_H, MAX_W, MIN_W, singleLayout } from './layout';

describe('singleLayout', () => {
  it('clamps extreme ratios', () => {
    expect(singleLayout(100, 1000).ratio).toBe(0.5);
    expect(singleLayout(4000, 100).ratio).toBe(2.4);
    expect(singleLayout(1200, 800).ratio).toBeCloseTo(1.5);
  });

  it('never exceeds the max box, whatever the photo', () => {
    for (const [w, h] of [
      [4000, 3000],
      [3000, 4000],
      [10000, 100],
      [100, 10000],
      [1, 1],
      [2048, 2048],
    ] as const) {
      const l = singleLayout(w, h);
      expect(l.boxW).toBeLessThanOrEqual(MAX_W);
      expect(l.boxW).toBeGreaterThanOrEqual(MIN_W);
      expect(l.boxW / l.ratio).toBeLessThanOrEqual(Math.max(MAX_H, MIN_W / l.ratio) + 0.001);
    }
  });

  it('never upscales past the natural width (but keeps a readable minimum)', () => {
    expect(singleLayout(250, 250).boxW).toBe(250);
    expect(singleLayout(50, 50).boxW).toBe(MIN_W);
  });

  it('caps the width at 72vw and sets the aspect ratio', () => {
    const l = singleLayout(1200, 800);
    expect(l.style).toEqual({ width: 'min(340px, 72vw)', aspectRatio: '1.5' });
    expect(singleLayout(1000, 2000).style.width).toBe('min(210px, 72vw)');
  });
});

describe('albumLayout', () => {
  it('uses the planned grids', () => {
    expect(albumLayout(2)).toMatchObject({ shown: 2, extra: 0, grid: 'grid-cols-2' });
    expect(albumLayout(2).style.aspectRatio).toBe('2 / 1.2');
    expect(albumLayout(3)).toMatchObject({ shown: 3, grid: 'grid-cols-[2fr_1fr] grid-rows-2' });
    expect(albumLayout(3).tiles[0]).toBe('row-span-2');
    expect(albumLayout(3).style.aspectRatio).toBe('1.2');
    expect(albumLayout(4)).toMatchObject({ shown: 4, extra: 0, grid: 'grid-cols-2 grid-rows-2' });
  });

  it('shows four tiles and counts the rest for 5 to 10 items', () => {
    for (let n = 5; n <= 10; n++) {
      const l = albumLayout(n);
      expect(l.shown).toBe(4);
      expect(l.extra).toBe(n - 4);
      expect(l.tiles).toHaveLength(4);
      expect(l.style.width).toBe('min(320px, 72vw)');
    }
  });
});

describe('layoutFor', () => {
  it('picks single or album by count, for 1 to 10 items', () => {
    const item = { width: 800, height: 600 };
    expect(layoutFor([item]).kind).toBe('single');
    for (let n = 2; n <= 10; n++) expect(layoutFor(Array(n).fill(item)).kind).toBe('album');
  });
});
