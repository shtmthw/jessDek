import { describe, expect, it } from 'vitest';
import { interestWord, sharedInterests, suggestOpeners } from './openers';

const erin = {
  id: 'cmerin123',
  displayName: 'Erin Walsh',
  theirs: ['baking', 'cats', 'reading', 'yoga'],
  about: 'Bakes too much. Shares everything.',
};

describe('suggestOpeners', () => {
  it('starts with the interests you share, by name', () => {
    const out = suggestOpeners({ ...erin, mine: ['cats', 'baking', 'chess'] });
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out.length).toBeLessThanOrEqual(4);
    expect(out[0]).toMatch(/Erin/);
    expect(out[0]).toMatch(/bak/i); // baking comes first on her card
    expect(out.join(' ')).toMatch(/cat/i);
  });

  it('is the same every time for the same person', () => {
    const a = suggestOpeners({ ...erin, mine: ['cats'] });
    const b = suggestOpeners({ ...erin, mine: ['cats'] });
    expect(a).toEqual(b);
  });

  it('never leaves a placeholder, an empty line or a repeat', () => {
    const cases = [
      { mine: [] },
      { mine: ['cats'] },
      { mine: ['baking', 'cats', 'reading', 'yoga'] },
      { mine: [{ t: 'synths' }], theirs: [{ t: 'Synths', e: '🎹' }] },
    ];
    for (const extra of cases) {
      for (const id of ['a', 'b', 'c', 'dd', 'eee']) {
        const out = suggestOpeners({ ...erin, ...extra, id });
        expect(out.length).toBeGreaterThanOrEqual(3);
        expect(new Set(out).size).toBe(out.length);
        for (const line of out) {
          expect(line).not.toMatch(/[{}]/);
          expect(line.trim()).toBe(line);
          expect(line.length).toBeGreaterThan(10);
          expect(line.length).toBeLessThan(200);
        }
      }
    }
  });

  it('uses the words they wrote for custom interests, case-insensitively matched', () => {
    const out = suggestOpeners({
      id: 'x1',
      displayName: 'Dave',
      theirs: [{ t: 'Mechanical keebs', e: '⌨️' }],
      mine: [{ t: 'mechanical KEEBS' }],
    });
    expect(out[0]).toMatch(/Mechanical keebs/);
  });

  it('still says hi when nothing is shared', () => {
    const out = suggestOpeners({ id: 'z', displayName: 'Zed', theirs: ['golf'], mine: ['chess'] });
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out.every((l) => l.includes('Zed'))).toBe(true);
  });
});

describe('helpers', () => {
  it('sharedInterests keeps their order', () => {
    expect(sharedInterests(['yoga', 'cats', 'tea'], ['tea', 'yoga'])).toEqual(['yoga', 'tea']);
  });

  it('interestWord reads naturally', () => {
    expect(interestWord('board-games')).toBe('board games');
    expect(interestWord({ t: 'Trail maps' })).toBe('Trail maps');
  });
});
