import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AvatarFigure, VIEW_AVATAR } from './AvatarFigure';
import { SLOTS, slotIds, type SlotId } from './catalog';
import { SLIM_BODY } from './parts/face';
import {
  DEFAULT_RECIPE,
  normalizeRecipe,
  parseRecipe,
  randomRecipe,
  serializeRecipe,
  type Recipe,
} from './recipe';
import { SPECIALS, specialOf } from './specials';

describe('specials', () => {
  it('are nine, with unique ids', () => {
    expect(SPECIALS).toHaveLength(9);
    expect(new Set(SPECIALS.map((s) => s.id)).size).toBe(9);
  });

  it('only use items and colours the catalog has', () => {
    for (const s of SPECIALS) {
      // Normalizing drops anything unknown, so a valid recipe comes back unchanged.
      expect(normalizeRecipe(s.recipe), s.id).toEqual(s.recipe);
      expect(s.recipe.line).toBe('fine');
      expect(s.recipe.style).toBe('character');
    }
  });

  it('fit what the server accepts (AVATAR_PLAN.md §2)', () => {
    for (const s of SPECIALS) {
      const raw = serializeRecipe(s.recipe);
      expect(raw.length, s.id).toBeLessThanOrEqual(1024);
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      expect(Object.keys(parsed).length).toBeLessThanOrEqual(32);
      for (const [k, v] of Object.entries(parsed)) {
        expect(k).toMatch(/^[a-zA-Z]{1,16}$/);
        if (typeof v === 'string') expect(v).toMatch(/^[a-z0-9-]{1,24}$/);
      }
    }
  });

  it('are recognised until something is changed', () => {
    const beanie = SPECIALS[0]!;
    expect(specialOf(beanie.recipe)?.id).toBe(beanie.id);
    expect(specialOf({ ...beanie.recipe, hairColor: 'pink' })).toBeUndefined();
    expect(specialOf(DEFAULT_RECIPE as Recipe)).toBeUndefined();
  });
});

describe('new slots', () => {
  it('fill in for recipes saved before they existed', () => {
    const old = parseRecipe(JSON.stringify({ v: 1, style: 'character', hair: 'bob' }));
    expect(old.line).toBe('bold');
    expect(old.clip).toBe('none');
    expect(old.earringColor).toBe('gold');
    expect(old.topAccent).toBe('jade');
    expect(old.build).toBe('classic');
  });

  it('gives the specials the slim build, and Randomize keeps the build and line weight', () => {
    expect(SPECIALS.every((s) => s.recipe.build === 'slim')).toBe(true);
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const r = randomRecipe(SPECIALS[0]!.recipe, rand);
    expect(r.build).toBe('slim');
    expect(r.line).toBe('fine');
  });

  it('lowers the body only on the slim build', () => {
    const slim = render(<AvatarFigure recipe={SPECIALS[3]!.recipe} viewBox={VIEW_AVATAR} />);
    expect(slim.container.querySelector(`[transform="${SLIM_BODY}"]`)).not.toBeNull();
    const classic = render(
      <AvatarFigure recipe={{ ...SPECIALS[3]!.recipe, build: 'classic' }} viewBox={VIEW_AVATAR} />,
    );
    expect(classic.container.querySelector(`[transform="${SLIM_BODY}"]`)).toBeNull();
  });
});

describe('line weight', () => {
  const widths = (container: HTMLElement) =>
    [...container.querySelectorAll<SVGElement>('[stroke-width="6"]')].map(
      (e) => e.style.strokeWidth,
    );

  it('draws fine lines thinner and bold lines as drawn', () => {
    const fine = render(<AvatarFigure recipe={SPECIALS[1]!.recipe} viewBox={VIEW_AVATAR} />);
    expect(widths(fine.container).length).toBeGreaterThan(0);
    expect(new Set(widths(fine.container))).toEqual(new Set(['2.4px']));

    const bold = render(
      <AvatarFigure recipe={{ ...SPECIALS[1]!.recipe, line: 'bold' }} viewBox={VIEW_AVATAR} />,
    );
    expect(new Set(widths(bold.container))).toEqual(new Set(['']));
  });

  it('goes back to bold when switched', () => {
    const view = render(<AvatarFigure recipe={SPECIALS[2]!.recipe} viewBox={VIEW_AVATAR} />);
    view.rerender(
      <AvatarFigure recipe={{ ...SPECIALS[2]!.recipe, line: 'bold' }} viewBox={VIEW_AVATAR} />,
    );
    expect(new Set(widths(view.container))).toEqual(new Set(['']));
  });
});

describe('every item on every special', () => {
  it('draws without errors, for every slot', () => {
    const slots = (Object.keys(SLOTS) as SlotId[]).filter((s) => SLOTS[s].kind === 'items');
    let drawn = 0;
    for (const sp of [...SPECIALS, { id: 'classic', recipe: DEFAULT_RECIPE as Recipe }]) {
      for (const slot of slots) {
        for (const id of slotIds(slot)) {
          const { container, unmount } = render(
            <AvatarFigure recipe={{ ...sp.recipe, [slot]: id }} viewBox={VIEW_AVATAR} />,
          );
          expect(container.querySelector('svg'), `${sp.id} ${slot}=${id}`).not.toBeNull();
          unmount();
          drawn++;
        }
      }
    }
    expect(drawn).toBeGreaterThan(1500);
    // About 2,500 renders: give it room when the whole suite runs in parallel.
  }, 30_000);
});
