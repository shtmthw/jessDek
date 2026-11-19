import { useSearchParams } from 'react-router';
import { AvatarFigure, VIEW_AVATAR } from './AvatarFigure';
import { SLOTS, slotIds, slotLabel, type SlotId } from './catalog';
import { DEFAULT_RECIPE, type Recipe } from './recipe';
import { SPECIALS } from './specials';

/**
 * Dev only (/dev/specials?slot=hat&from=0&count=9): every special, plus the classic default,
 * wearing every item of one slot, so clashes between items and the new hair are easy to spot.
 */
export default function DevSpecials() {
  const [params] = useSearchParams();
  const slot = (params.get('slot') ?? 'hat') as SlotId;
  const from = Number(params.get('from') ?? 0);
  const count = Number(params.get('count') ?? 9);
  const ids = SLOTS[slot] ? slotIds(slot).slice(from, from + count) : [];
  const rows: Array<{ id: string; recipe: Recipe }> = [
    ...SPECIALS.map((s) => ({ id: s.id, recipe: s.recipe })),
    { id: 'classic', recipe: DEFAULT_RECIPE as Recipe },
  ];
  return (
    <div className="h-full overflow-auto bg-white p-4 text-zinc-900" data-matrix>
      <table className="border-separate border-spacing-1.5">
        <thead>
          <tr>
            <th />
            {ids.map((id) => (
              <th key={id} className="w-[118px] truncate text-center text-[11px] font-medium">
                {slotLabel(slot, id)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th className="pr-1 text-right text-[11px] font-medium">{row.id}</th>
              {ids.map((id) => (
                <td key={id}>
                  <div
                    className="size-[118px] overflow-hidden rounded-full"
                    style={{ backgroundColor: '#3fa56b' }}
                  >
                    <AvatarFigure
                      recipe={{ ...row.recipe, [slot]: id }}
                      viewBox={VIEW_AVATAR}
                      className="size-full"
                    />
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
