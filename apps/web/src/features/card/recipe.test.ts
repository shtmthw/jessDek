import { describe, expect, it } from 'vitest';
import { searchInterests } from './interests';
import {
  ABOUT_MAX,
  DEFAULT_CARD,
  cleanAbout,
  cleanCustom,
  fitAbout,
  normalizeCard,
  parseCard,
  randomStyle,
  sameCard,
  serializeCard,
  STICKERS_MAX,
  type CardRecipe,
} from './recipe';

const card = (over: Partial<CardRecipe>): CardRecipe => ({ ...DEFAULT_CARD, ...over });

describe('parseCard', () => {
  it('gives the default card for null, garbage and non-objects', () => {
    expect(parseCard(null)).toEqual(DEFAULT_CARD);
    expect(parseCard('not json')).toEqual(DEFAULT_CARD);
    expect(parseCard('[1,2]')).toEqual(DEFAULT_CARD);
  });

  it('keeps known style values and drops unknown ones', () => {
    const c = parseCard(
      JSON.stringify({ bg: 'galaxy', border: 'laser', font: 'pixel', labels: false }),
    );
    expect(c.bg).toBe('galaxy');
    expect(c.border).toBe(DEFAULT_CARD.border);
    expect(c.font).toBe('pixel');
    expect(c.labels).toBe(false);
  });

  it('is cached per string', () => {
    const raw = JSON.stringify({ bg: 'mint' });
    expect(parseCard(raw)).toBe(parseCard(raw));
  });
});

describe('about', () => {
  it('normalizes line endings, control characters and trailing spaces', () => {
    expect(cleanAbout('  hi  \r\nthere\u0007 \r\n')).toBe('hi\nthere');
  });

  it('fits into four lines and 150 characters', () => {
    expect(fitAbout('a\nb\nc\nd\ne\nf')).toBe('a\nb\nc\nd e f');
    expect([...fitAbout('x'.repeat(400))]).toHaveLength(ABOUT_MAX);
    // Emoji count once.
    expect(fitAbout('🍕'.repeat(200))).toBe('🍕'.repeat(ABOUT_MAX));
  });
});

describe('interests', () => {
  it('keeps built-in ids and tidy custom ones, without duplicates, at most six', () => {
    const c = normalizeCard({
      interests: [
        'hiking',
        'not-a-thing',
        'hiking',
        { t: '  Bouldering   at night ', e: '🧗' },
        { t: 'bouldering AT NIGHT' },
        { t: 'Synths', e: 'abc' },
        { t: '' },
        'pizza',
        'games',
        'coffee',
        'tea',
      ],
    });
    expect(c.interests).toEqual([
      'hiking',
      { t: 'Bouldering at nigh', e: '🧗' },
      { t: 'Synths' },
      'pizza',
      'games',
      'coffee',
    ]);
  });

  it('trims custom names to one short line', () => {
    expect(cleanCustom('a\nb\tc')).toBe('a b c');
    expect([...cleanCustom('x'.repeat(40))]).toHaveLength(18);
  });

  it('searches labels first, then extra words', () => {
    expect(searchInterests('bik')[0]?.id).toBe('biking');
    expect(searchInterests('soccer').map((i) => i.id)).toContain('football');
    expect(searchInterests('')).toEqual([]);
  });
});

describe('stickers', () => {
  it('keeps valid stickers, clamped and rounded, at most eight', () => {
    const c = normalizeCard({
      stickers: [
        { k: 'star', x: 1.4, y: -0.2, s: 9, r: 270, c: 'yellow' },
        { e: '🍕', x: 0.12345, y: 0.5, s: 1, r: 0 },
        { k: 'nope', x: 0.5, y: 0.5, s: 1, r: 0 },
        { k: 'star', e: '🍕', x: 0.5, y: 0.5, s: 1, r: 0 },
        { e: 'hello', x: 0.5, y: 0.5, s: 1, r: 0 },
        ...Array.from({ length: 12 }, () => ({ k: 'heart', x: 0.5, y: 0.5, s: 1, r: 0 })),
      ],
    });
    expect(c.stickers[0]).toEqual({ k: 'star', x: 1, y: 0, s: 2.5, r: -90, c: 'yellow' });
    expect(c.stickers[1]).toEqual({ e: '🍕', x: 0.123, y: 0.5, s: 1, r: 0 });
    expect(c.stickers).toHaveLength(STICKERS_MAX);
  });
});

describe('serializeCard', () => {
  it('round-trips and gives equal strings for equal cards', () => {
    const c = card({ about: 'Hi!', interests: ['pizza', { t: 'Synths', e: '🎹' }], bg: 'sunset' });
    expect(parseCard(serializeCard(c))).toEqual(c);
    expect(sameCard(c, { ...c })).toBe(true);
    expect(sameCard(c, { ...c, bg: 'ocean' })).toBe(false);
  });

  it('stays well under the server limit at the maximum', () => {
    const c = card({
      about: '🍕'.repeat(ABOUT_MAX),
      interests: Array.from({ length: 6 }, (_, i) => ({ t: `${'x'.repeat(17)}${i}`, e: '👨‍👩‍👧‍👦' })),
      stickers: Array.from({ length: 8 }, () => ({
        e: '👨‍👩‍👧‍👦',
        x: 0.123,
        y: 0.456,
        s: 1.25,
        r: -123,
        c: 'yellow',
      })),
    });
    expect(serializeCard(c).length).toBeLessThan(4096);
  });
});

describe('randomStyle', () => {
  it('never touches the words, interests, stickers or name style', () => {
    const c = card({
      about: 'Hi',
      interests: ['pizza'],
      stickers: [{ k: 'star', x: 0.5, y: 0.5, s: 1, r: 0 }],
      name: 'both',
    });
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 20; i++) {
      const r = randomStyle(c, rand);
      expect(r.about).toBe('Hi');
      expect(r.interests).toBe(c.interests);
      expect(r.stickers).toBe(c.stickers);
      expect(r.name).toBe('both');
      expect(r.ink).toBe('auto');
      expect(normalizeCard(JSON.parse(serializeCard(r)))).toEqual(r);
    }
  });
});
