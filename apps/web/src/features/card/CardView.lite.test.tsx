import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CardView } from './CardView';
import { parseCard } from './recipe';

/**
 * The light card (DECK_QUALITY_PLAN.md): the same card, without the layers that cost the most to
 * build and draw.
 */

const user = {
  displayName: 'Rosa Kowalski',
  username: 'rosa',
  avatar: null,
  avatarColor: '#6366f1',
};

/** A card with every heavy layer: a pattern, a finish, border art, a glow ring and stickers. */
const rich = parseCard(
  JSON.stringify({
    v: 1,
    pattern: 'dots',
    finish: 'gloss',
    border: 'dashed',
    ring: 'glow',
    interests: [{ t: 'Pottery' }, { t: 'Night swims' }],
    about: 'Collector of small joys.',
    stickers: [
      { k: 'star', x: 0.85, y: 0.1, s: 1, r: 12 },
      { e: '🌙', x: 0.15, y: 0.9, s: 0.8, r: -8 },
    ],
  }),
);

const draw = (lite: boolean) =>
  render(<CardView card={rich} user={user} width={320} lite={lite} />).container;

const layers = (root: HTMLElement) =>
  [...root.querySelectorAll('[data-layer]')]
    .filter((el) => el.childElementCount > 0)
    .map((el) => el.getAttribute('data-layer'))
    .sort();

describe('CardView lite', () => {
  it('the recipe really has every heavy layer', () => {
    expect(rich.pattern).toBe('dots');
    expect(rich.finish).toBe('gloss');
    expect(rich.border).toBe('dashed');
    expect(rich.ring).toBe('glow');
    expect(rich.stickers).toHaveLength(2);
  });

  it('full: draws the pattern, finish, border art and stickers', () => {
    const root = draw(false);
    expect(root.querySelector('article')).toHaveAttribute('data-quality', 'full');
    expect(layers(root)).toEqual(['border', 'finish', 'pattern', 'stickers']);
  });

  it('light: none of them, and no blurred filters anywhere', () => {
    const root = draw(true);
    expect(root.querySelector('article')).toHaveAttribute('data-quality', 'light');
    expect(layers(root)).toEqual([]);
    const filtered = [...root.querySelectorAll<HTMLElement | SVGElement>('*')].filter(
      (el) => (el as HTMLElement).style?.filter || el.getAttribute('filter'),
    );
    expect(filtered).toHaveLength(0);
    // The card's own drop shadow is a box-shadow on the face, with the border as an inset ring.
    expect((root.firstElementChild as HTMLElement).style.filter).toBe('');
    expect(root.querySelector('article')!.style.boxShadow).toMatch(/^inset 0 0 0 2px/);
  });

  it('light keeps everything a person reads: name, interests, about, the message button', () => {
    const text = (root: HTMLElement) => root.querySelector('article')!.textContent;
    expect(text(draw(true))).toBe(text(draw(false)));
    expect(text(draw(true))).toContain('Pottery');
    expect(text(draw(true))).toContain('Collector of small joys.');
  });

  it('a plain card has no inset ring (it has no border to stand in for)', () => {
    const plain = parseCard(JSON.stringify({ v: 1, border: 'none' }));
    const root = render(<CardView card={plain} user={user} width={320} lite />).container;
    expect(root.querySelector('article')!.style.boxShadow).not.toMatch(/inset/);
  });
});
