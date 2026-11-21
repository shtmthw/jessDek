import { memo, useId, type ReactNode } from 'react';
import { heartPath, starPath } from '../avatar/art';

/** Repeating background patterns. Each tile is drawn in one colour; the card sets its opacity. */
export interface Tile {
  w: number;
  h?: number;
  draw: (c: string) => ReactNode;
  /** Rotate the whole pattern (degrees). */
  angle?: number;
}

const stroke = (c: string, w = 2) =>
  ({
    stroke: c,
    strokeWidth: w,
    fill: 'none',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }) as const;

// Fixed "random" layouts, so a pattern looks the same every time it's drawn.
const CONFETTI: Array<[number, number, number, 'r' | 'c']> = [
  [8, 10, 20, 'r'],
  [30, 6, -35, 'c'],
  [50, 16, 60, 'r'],
  [16, 34, -10, 'c'],
  [40, 38, 35, 'r'],
  [56, 46, 0, 'c'],
  [6, 54, 70, 'r'],
  [28, 56, -55, 'r'],
  [46, 4, 10, 'c'],
];
const SPRINKLES: Array<[number, number, number]> = [
  [6, 8, 30],
  [22, 4, -40],
  [34, 14, 75],
  [10, 24, -15],
  [28, 30, 50],
  [4, 38, 80],
  [18, 40, -60],
  [36, 36, 15],
];

/** The repeating tiles, by pattern id (chat wallpapers reuse them; see theme/doodles.tsx). */
export const TILES: Record<string, Tile> = {
  dots: {
    w: 20,
    draw: (c) => (
      <g fill={c}>
        <circle cx={5} cy={5} r={2.4} />
        <circle cx={15} cy={15} r={2.4} />
      </g>
    ),
  },
  grid: { w: 20, draw: (c) => <path d="M20 0 V20 M0 20 H20" {...stroke(c, 1.2)} /> },
  stripes: { w: 16, angle: 45, draw: (c) => <rect width={6} height={16} fill={c} /> },
  checkers: {
    w: 24,
    draw: (c) => (
      <g fill={c}>
        <rect width={12} height={12} />
        <rect x={12} y={12} width={12} height={12} />
      </g>
    ),
  },
  waves: { w: 28, h: 14, draw: (c) => <path d="M0 7 Q7 1 14 7 T28 7" {...stroke(c, 2)} /> },
  zigzag: { w: 20, h: 12, draw: (c) => <path d="M0 9 L5 3 L10 9 L15 3 L20 9" {...stroke(c, 2)} /> },
  stars: {
    w: 36,
    draw: (c) => (
      <g fill={c}>
        <path d={starPath(9, 9.5, 5)} />
        <path d={starPath(27, 27.5, 5)} />
      </g>
    ),
  },
  hearts: {
    w: 36,
    draw: (c) => (
      <g fill={c}>
        <path d={heartPath(9, 9, 4.4)} />
        <path d={heartPath(27, 27, 4.4)} />
      </g>
    ),
  },
  confetti: {
    w: 60,
    draw: (c) => (
      <g fill={c}>
        {CONFETTI.map(([x, y, a, kind], i) =>
          kind === 'r' ? (
            <rect
              key={i}
              x={x}
              y={y}
              width={7}
              height={3.4}
              rx={1}
              transform={`rotate(${a} ${x + 3.5} ${y + 1.7})`}
            />
          ) : (
            <circle key={i} cx={x} cy={y} r={2.2} />
          ),
        )}
      </g>
    ),
  },
  sprinkles: {
    w: 44,
    draw: (c) => (
      <g {...stroke(c, 2.6)}>
        {SPRINKLES.map(([x, y, a], i) => (
          <path key={i} d={`M${x} ${y} h6`} transform={`rotate(${a} ${x + 3} ${y})`} />
        ))}
      </g>
    ),
  },
  crosses: { w: 22, draw: (c) => <path d="M11 7 V15 M7 11 H15" {...stroke(c, 2)} /> },
  bubbles: {
    w: 48,
    draw: (c) => (
      <g {...stroke(c, 1.6)}>
        <circle cx={12} cy={12} r={7} />
        <circle cx={34} cy={30} r={10} />
        <circle cx={10} cy={38} r={4} />
        <circle cx={38} cy={8} r={3} />
      </g>
    ),
  },
  diamonds: { w: 24, draw: (c) => <path d="M12 3 L21 12 L12 21 L3 12 Z" {...stroke(c, 1.5)} /> },
  clouds: {
    w: 64,
    h: 48,
    draw: (c) => (
      <g fill={c}>
        <path d="M8 20 C4 20 3 15 7 13 C7 8 13 6 16 9 C18 4 26 5 27 10 C31 10 33 14 31 17 C33 20 30 21 28 20 Z" />
        <path d="M38 44 C34 44 33 39 37 37 C37 32 43 30 46 33 C48 28 56 29 57 34 C61 34 63 38 61 41 C63 44 60 45 58 44 Z" />
      </g>
    ),
  },
};

/** Fills its (positioned) parent with the pattern. */
export const Pattern = memo(function Pattern({
  id,
  color,
  opacity,
}: {
  id: string;
  color: string;
  opacity: number;
}) {
  const uid = `pt${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const tile = TILES[id];
  if (!tile) return null;
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 size-full" style={{ opacity }}>
      <defs>
        <pattern
          id={uid}
          width={tile.w}
          height={tile.h ?? tile.w}
          patternUnits="userSpaceOnUse"
          patternTransform={tile.angle ? `rotate(${tile.angle})` : undefined}
        >
          {tile.draw(color)}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${uid})`} />
    </svg>
  );
});
