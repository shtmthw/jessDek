import { expect, it } from 'vitest';
import { STICKER_IDS } from './stickerIds';
import { STICKERS } from './stickers';

it('lists every drawn sticker id, and only those', () => {
  expect([...STICKER_IDS]).toEqual(Object.keys(STICKERS));
});
