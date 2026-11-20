import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AvatarFigure, liftFor, lineScale, VIEW_AVATAR } from './AvatarFigure';
import { SLOTS, slotIds, type SlotId } from './catalog';
import { HAIRS } from './parts/hair';
import { HATS } from './parts/hats';
import { CLASSIC_BODY, SLIM_BODY } from './parts/face';
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
    expect(old.clip).toBe('none');
    expect(old.earringColor).toBe('gold');
    expect(old.topAccent).toBe('jade');
    expect(old.build).toBe('classic');
  });

  it('gives the specials the slim build, and Randomize keeps the build', () => {
    expect(SPECIALS.every((s) => s.recipe.build === 'slim')).toBe(true);
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const r = randomRecipe(SPECIALS[0]!.recipe, rand);
    expect(r.build).toBe('slim');
  });

  it('lowers the body under the long neck on both builds, and narrows it only when slim', () => {
    const slim = render(<AvatarFigure recipe={SPECIALS[3]!.recipe} viewBox={VIEW_AVATAR} />);
    expect(slim.container.querySelector(`[transform="${SLIM_BODY}"]`)).not.toBeNull();
    expect(slim.container.querySelector(`[transform="${CLASSIC_BODY}"]`)).toBeNull();
    const classic = render(
      <AvatarFigure recipe={{ ...SPECIALS[3]!.recipe, build: 'classic' }} viewBox={VIEW_AVATAR} />,
    );
    expect(classic.container.querySelector(`[transform="${SLIM_BODY}"]`)).toBeNull();
    expect(classic.container.querySelector(`[transform="${CLASSIC_BODY}"]`)).not.toBeNull();
  });

  it('gives the default character the specials’ slender neck', () => {
    // The slender neck's outline starts under the chin at (91.5, 124).
    const neckOf = (recipe: Recipe) => {
      const { container } = render(<AvatarFigure recipe={recipe} viewBox={VIEW_AVATAR} />);
      return container.querySelector('path[d^="M91.5 124"]');
    };
    expect(neckOf(DEFAULT_RECIPE as Recipe)).not.toBeNull();
    expect(neckOf(SPECIALS[0]!.recipe)).not.toBeNull();
  });
});

describe('framing', () => {
  const none = { label: '' };

  it('lifts the figure so the lowered shoulders stay in frame', () => {
    expect(liftFor(none, none)).toBe(7);
    expect(liftFor(HAIRS.short, HATS.none)).toBe(7);
  });

  it('lifts less, or not at all, under tall hair and headwear', () => {
    expect(liftFor(HAIRS.bun, HATS.none)).toBe(1);
    expect(liftFor(HAIRS.short, HATS['top-hat'])).toBe(0);
    expect(liftFor(HAIRS.short, HATS.party)).toBe(0);
    // The taller of the two decides.
    expect(liftFor(HAIRS.bun, HATS['top-hat'])).toBe(0);
    expect(liftFor(HAIRS.short, HATS.horns)).toBe(6);
  });

  it('never moves a tall item above the room it had before the lift', () => {
    for (const hair of Object.values(HAIRS) as Array<{ top?: number }>) {
      for (const hat of Object.values(HATS) as Array<{ top?: number }>) {
        const lift = liftFor({ label: '', ...hair }, { label: '', ...hat });
        const top = Math.min(hair.top ?? Infinity, hat.top ?? Infinity);
        if (top !== Infinity) expect(top - lift).toBeGreaterThanOrEqual(Math.min(top, 12));
      }
    }
  });
});

describe('line weight', () => {
  const widths = (container: HTMLElement) =>
    [...container.querySelectorAll<SVGElement>('[stroke-width="6"]')].map(
      (e) => e.style.strokeWidth,
    );

  it('draws every avatar with fine lines, the old bold look included', () => {
    for (const recipe of [SPECIALS[1]!.recipe, DEFAULT_RECIPE as Recipe]) {
      const { container, unmount } = render(<AvatarFigure recipe={recipe} viewBox={VIEW_AVATAR} />);
      expect(widths(container).length).toBeGreaterThan(0);
      expect(new Set(widths(container))).toEqual(new Set(['2.4px']));
      unmount();
    }
    // A recipe saved with the bold option it used to have draws fine too.
    const old = parseRecipe(JSON.stringify({ v: 1, style: 'character', line: 'bold' }));
    const { container } = render(<AvatarFigure recipe={old} viewBox={VIEW_AVATAR} />);
    expect(new Set(widths(container))).toEqual(new Set(['2.4px']));
  });

  it('thins less at small sizes, so outlines stay visible', () => {
    expect(lineScale(256, 200)).toBe(0.4);
    expect(lineScale(0, 180)).toBe(0.4);
    expect(lineScale(40, 180)).toBeCloseTo(0.675);
    expect(lineScale(16, 160)).toBe(1);
    for (const px of [16, 24, 28, 40, 64, 128, 256]) {
      const onScreen = (6 * lineScale(px, 180) * px) / 180;
      expect(onScreen).toBeGreaterThanOrEqual(Math.min(0.9, (6 * px) / 180) - 1e-9);
    }
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
