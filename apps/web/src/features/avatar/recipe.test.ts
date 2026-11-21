import { describe, expect, it } from 'vitest';
import { slotIds, SLOTS, type SlotId } from './catalog';
import {
  DEFAULT_RECIPE,
  normalizeRecipe,
  parseRecipe,
  randomRecipe,
  serializeRecipe,
} from './recipe';

describe('avatar recipes', () => {
  it('uses only ids the catalog has for the default', () => {
    for (const slot of Object.keys(SLOTS) as SlotId[]) {
      expect(slotIds(slot)).toContain(DEFAULT_RECIPE[slot]);
    }
  });

  it('keeps what it knows and falls back per slot for the rest', () => {
    const r = normalizeRecipe({
      hair: 'afro',
      hat: 'jetpack',
      skin: 42,
      extra: 'x',
      style: 'initials',
    });
    expect(r.hair).toBe('afro');
    expect(r.hat).toBe(DEFAULT_RECIPE.hat);
    expect(r.skin).toBe(DEFAULT_RECIPE.skin);
    expect(r.style).toBe('initials');
    expect('extra' in r).toBe(false);
  });

  it('round-trips through JSON with a stable key order', () => {
    const r = { ...DEFAULT_RECIPE, hair: 'bun', pet: 'frog' };
    const json = serializeRecipe(r);
    expect(parseRecipe(json)).toEqual(r);
    expect(serializeRecipe(parseRecipe(json))).toBe(json);
  });

  it('reads nothing and garbage as the default character', () => {
    expect(parseRecipe(null)).toEqual(DEFAULT_RECIPE);
    expect(parseRecipe('')).toEqual(DEFAULT_RECIPE);
    expect(parseRecipe('[1,2]')).toEqual(DEFAULT_RECIPE);
    expect(parseRecipe('{oops')).toEqual(DEFAULT_RECIPE);
  });

  it('stays small enough for the server’s 1 KiB limit, even with the longest ids', () => {
    const longest = Object.fromEntries(
      (Object.keys(SLOTS) as SlotId[]).map((slot) => [
        slot,
        slotIds(slot).reduce((a, b) => (b.length > a.length ? b : a)),
      ]),
    );
    expect(serializeRecipe({ ...DEFAULT_RECIPE, ...longest }).length).toBeLessThan(1024);
  });

  it('randomizes into valid looks and keeps the chosen style', () => {
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 50; i++) {
      const r = randomRecipe({ ...DEFAULT_RECIPE, style: 'initials' }, rand);
      expect(r.style).toBe('initials');
      expect(normalizeRecipe(r)).toEqual(r);
    }
  });
});
