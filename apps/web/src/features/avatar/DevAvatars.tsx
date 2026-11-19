import { useMemo } from 'react';
import { Avatar } from '@/components/Avatar';
import { AvatarFigure, VIEW_AVATAR } from './AvatarFigure';
import { SLOTS, slotIds, slotLabel, type SlotId } from './catalog';
import { DEFAULT_RECIPE, randomRecipe, serializeRecipe, type Recipe } from './recipe';
import { SPECIALS } from './specials';
import { AvatarFigure as Figure, VIEW_FULL } from './AvatarFigure';

/** Repeatable "random" looks, so screenshots compare across runs. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const COLORS = [
  '#6366f1',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#0ea5e9',
  '#a855f7',
  '#22c55e',
  '#eab308',
];

/** Every avatar item in every slot, plus random looks at the sizes the app uses. Dev builds only. */
export default function DevAvatars() {
  const looks = useMemo(() => {
    const rand = seeded(7);
    return Array.from({ length: 16 }, () =>
      serializeRecipe(randomRecipe(DEFAULT_RECIPE as Recipe, rand)),
    );
  }, []);

  return (
    <div className="h-full overflow-y-auto px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Avatars</h1>

      <section className="mt-6" data-specials>
        <h2 className="mb-3 text-sm font-semibold">Specials</h2>
        <div className="flex flex-wrap gap-3">
          {SPECIALS.map((sp) => (
            <figure key={sp.id} className="w-[220px] text-center" data-special={sp.id}>
              <div className="size-[220px] overflow-hidden rounded-2xl bg-white ring-1 ring-black/10">
                <Figure recipe={sp.recipe} viewBox={VIEW_FULL} className="size-full" />
              </div>
              <div className="mt-2 flex items-center justify-center gap-2">
                {(['xs', 'sm', 'md', 'lg'] as const).map((size) => (
                  <Avatar
                    key={size}
                    name={sp.label}
                    color="#3fa56b"
                    avatar={serializeRecipe(sp.recipe)}
                    size={size}
                  />
                ))}
                <div
                  className="size-16 overflow-hidden rounded-full"
                  style={{ backgroundColor: '#3fa56b' }}
                >
                  <Figure
                    recipe={{ ...sp.recipe, line: 'bold' }}
                    viewBox={VIEW_AVATAR}
                    className="size-full"
                  />
                </div>
              </div>
              <figcaption className="mt-1 text-xs text-muted-foreground">{sp.label}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-sm font-semibold">Sizes</h2>
        {(['xs', 'sm', 'md', 'lg'] as const).map((size) => (
          <div key={size} className="flex flex-wrap items-center gap-2">
            {looks.map((avatar, i) => (
              <Avatar
                key={i}
                name="Dev Avatar"
                color={COLORS[i % COLORS.length]}
                avatar={avatar}
                size={size}
              />
            ))}
          </div>
        ))}
      </section>

      {(Object.keys(SLOTS) as SlotId[])
        .filter((slot) => SLOTS[slot].kind === 'items')
        .map((slot) => (
          <section key={slot} className="mt-8">
            <h2 className="mb-3 text-sm font-semibold">{slot}</h2>
            <div className="flex flex-wrap gap-3">
              {slotIds(slot).map((id) => (
                <figure key={id} className="w-24 text-center">
                  <div
                    className="size-24 overflow-hidden rounded-full"
                    style={{ backgroundColor: '#6366f1' }}
                  >
                    <AvatarFigure
                      recipe={{ ...(DEFAULT_RECIPE as Recipe), [slot]: id }}
                      viewBox={VIEW_AVATAR}
                      className="size-full"
                    />
                  </div>
                  <figcaption className="mt-1 truncate text-xs text-muted-foreground">
                    {slotLabel(slot, id)}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
