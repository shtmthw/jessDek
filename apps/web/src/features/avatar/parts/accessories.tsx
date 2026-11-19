import type { ReactNode } from 'react';
import { heartPath, INK, MIRROR, starPath, type Item, type Paint } from '../art';
import { GOLD } from './clothes';

// ---------------------------------------------------------------------------------------------
// Glasses. Lenses centred on the eyes at (76, 101) and (124, 101).
// ---------------------------------------------------------------------------------------------

const stroke = (color: string, width: number) =>
  ({
    fill: 'none',
    stroke: color,
    strokeWidth: width,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }) as const;

/** Frames keep the ink outline of everything else, with the frame colour inside it. */
const frame = (p: Paint, d: string) =>
  p.glasses === INK ? (
    <path d={d} {...stroke(INK, 4.2)} />
  ) : (
    <g>
      <path d={d} {...stroke(INK, 6.6)} />
      <path d={d} {...stroke(p.glasses, 3)} />
    </g>
  );

const glass = (d: string, fill = '#ffffff', opacity = 0.22) => (
  <path d={d} fill={fill} opacity={opacity} />
);

const TEMPLES = 'M62.5 97 L53 94.5 M137.5 97 L147 94.5';
const BRIDGE = 'M88.5 99 Q100 93 111.5 99';

/** Lenses on both eyes from a left-lens path builder. */
const lenses = (left: (cx: number) => string) => `${left(76)} ${left(124)}`;

const roundLens = (cx: number) =>
  `M${cx - 12.5} 101 a12.5 12.5 0 1 0 25 0 a12.5 12.5 0 1 0 -25 0 Z`;
const squareLens = (cx: number) =>
  `M${cx - 14} 95 Q${cx - 14} 89.5 ${cx - 8.5} 89.5 H${cx + 8.5} Q${cx + 14} 89.5 ${cx + 14} 95 V106 Q${cx + 14} 112 ${cx + 8.5} 112 H${cx - 8.5} Q${cx - 14} 112 ${cx - 14} 106 Z`;
const shadeLens = (cx: number) =>
  `M${cx - 14} 92 H${cx + 14} C${cx + 14} 104 ${cx + 9} 111 ${cx} 111 C${cx - 9} 111 ${cx - 14} 104 ${cx - 14} 92 Z`;
const CAT_LEFT =
  'M89 97 C89 106 83 111 76 111 C68.5 111 63 106 63 99 C63 95 61 91 56.5 87.5 C66 87.5 72 90 78 90 C85 90 89 92 89 97 Z';

const tint = (p: Paint, fallback: string) => (p.glasses === INK ? fallback : p.glasses);

export const GLASSES = {
  none: { label: 'None' },
  round: {
    label: 'Round',
    front: (p) => (
      <g>
        {glass(lenses(roundLens))}
        {frame(p, `${lenses(roundLens)} ${BRIDGE} ${TEMPLES}`)}
      </g>
    ),
  },
  square: {
    label: 'Square',
    front: (p) => (
      <g>
        {glass(lenses(squareLens))}
        {frame(p, `${lenses(squareLens)} M90 98 Q100 94 110 98 ${TEMPLES}`)}
      </g>
    ),
  },
  'cat-eye': {
    label: 'Cat-eye',
    front: (p) => {
      const one = (
        <g>
          {glass(CAT_LEFT)}
          {frame(p, `${CAT_LEFT} M62.5 96 L53 94.5`)}
        </g>
      );
      return (
        <g>
          {one}
          <g transform={MIRROR}>{one}</g>
          {frame(p, BRIDGE)}
        </g>
      );
    },
  },
  shades: {
    label: 'Shades',
    front: (p) => (
      <g>
        <path d={lenses(shadeLens)} fill="#27272a" />
        <path d="M66 96 L72 96 M114 96 L120 96" {...stroke('#71717a', 2.6)} />
        {frame(p, `${lenses(shadeLens)} M90 94 H110 ${TEMPLES}`)}
      </g>
    ),
  },
  heart: {
    label: 'Heart shades',
    front: (p) => (
      <g>
        <path
          d={`${heartPath(76, 102, 13)} ${heartPath(124, 102, 13)}`}
          fill={tint(p, '#f43f5e')}
          stroke={INK}
          strokeWidth={3.6}
          strokeLinejoin="round"
        />
        <path
          d="M70 96 Q72 94 75 95.5 M118 96 Q120 94 123 95.5"
          {...stroke('#ffffff', 2.4)}
          opacity={0.75}
        />
        <path d={`M89.5 97 Q100 93 110.5 97 ${TEMPLES}`} {...stroke(INK, 4)} />
      </g>
    ),
  },
  star: {
    label: 'Star shades',
    front: (p) => (
      <g>
        <path
          d={`${starPath(76, 102, 16, 0.55)} ${starPath(124, 102, 16, 0.55)}`}
          fill={tint(p, '#fbbf24')}
          stroke={INK}
          strokeWidth={3.4}
          strokeLinejoin="round"
        />
        <path d={`M88.5 98 Q100 94 111.5 98 ${TEMPLES}`} {...stroke(INK, 4)} />
      </g>
    ),
  },
  '3d': {
    label: '3D glasses',
    front: () => (
      <g>
        <path d={squareLens(76)} fill="#ef4444" opacity={0.75} />
        <path d={squareLens(124)} fill="#22d3ee" opacity={0.75} />
        <path d={`${lenses(squareLens)} M90 98 H110 ${TEMPLES}`} {...stroke(INK, 7.6)} />
        <path d={`${lenses(squareLens)} M90 98 H110 ${TEMPLES}`} {...stroke('#ffffff', 3.4)} />
      </g>
    ),
  },
  monocle: {
    label: 'Monocle',
    front: (p) => {
      const color = tint(p, GOLD);
      return (
        <g>
          <path d="M135 110 C140 124 146 132 150 148" {...stroke(INK, 3.8)} />
          <path
            d="M135 110 C140 124 146 132 150 148"
            {...stroke(color, 1.6)}
            strokeDasharray="2.5 2"
          />
          {glass(roundLens(124))}
          <path d={roundLens(124)} {...stroke(INK, 7)} />
          <path d={roundLens(124)} {...stroke(color, 3.4)} />
        </g>
      );
    },
  },
} as const satisfies Record<string, Item>;

// ---------------------------------------------------------------------------------------------
// Earrings, hanging from the lobes at about (46, 117) and its mirror.
// ---------------------------------------------------------------------------------------------

const pairOf = (one: ReactNode) => (
  <g>
    {one}
    <g transform={MIRROR}>{one}</g>
  </g>
);

const charm = { stroke: INK, strokeWidth: 2, strokeLinejoin: 'round' } as const;

export const EARRINGS = {
  none: { label: 'None' },
  studs: {
    label: 'Studs',
    front: (p) => pairOf(<circle cx={45.5} cy={116.5} r={3} fill={p.earring} {...charm} />),
  },
  hoops: {
    label: 'Hoops',
    front: (p) =>
      pairOf(
        <g>
          <circle cx={45} cy={123.5} r={7} {...stroke(INK, 5)} />
          <circle cx={45} cy={123.5} r={7} {...stroke(p.earring, 2.2)} />
        </g>,
      ),
  },
  huggies: {
    label: 'Huggies',
    front: (p) =>
      pairOf(
        <g>
          <circle cx={46} cy={119.5} r={4.2} {...stroke(INK, 4.6)} />
          <circle cx={46} cy={119.5} r={4.2} {...stroke(p.earring, 2)} />
        </g>,
      ),
  },
  drops: {
    label: 'Drops',
    front: (p) =>
      pairOf(
        <g>
          <path d="M45.5 116 V118.5" {...stroke(INK, 1.8)} />
          <rect x={42.4} y={118.5} width={6.2} height={11} rx={3.1} fill={p.earring} {...charm} />
        </g>,
      ),
  },
  cuff: {
    label: 'Ear cuff',
    front: (p) =>
      pairOf(
        <rect
          x={37.5}
          y={97}
          width={6}
          height={11}
          rx={2.4}
          fill={p.earring}
          transform="rotate(-18 40.5 102.5)"
          {...charm}
        />,
      ),
  },
  pearls: {
    label: 'Pearls',
    front: () =>
      pairOf(
        <g>
          <path d="M45.5 116 V119" {...stroke(INK, 1.8)} />
          <circle cx={45.5} cy={122} r={4} fill="#fbf7f0" {...charm} />
        </g>,
      ),
  },
  stars: {
    label: 'Stars',
    front: (p) =>
      pairOf(
        <g>
          <path d="M45.5 116 V118" {...stroke(INK, 1.8)} />
          <path d={starPath(45.5, 123.5, 6.4, 0.5)} fill={p.earring} {...charm} />
        </g>,
      ),
  },
  hearts: {
    label: 'Hearts',
    front: () =>
      pairOf(
        <g>
          <path d="M45.5 116 V118.5" {...stroke(INK, 1.8)} />
          <path d={heartPath(45.5, 123.5, 5.4)} fill="#fb7185" {...charm} />
        </g>,
      ),
  },
} as const satisfies Record<string, Item>;

// ---------------------------------------------------------------------------------------------
// Hair clips, on the hair at the left temple (around (68, 72)), clear of a beanie's cuff.
// ---------------------------------------------------------------------------------------------

const clipLine = { stroke: INK, strokeWidth: 2.4, strokeLinejoin: 'round' } as const;

/** A four-point sparkle centred on (cx, cy). */
const sparklePath = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r} C${cx + r * 0.16} ${cy - r * 0.16} ${cx + r * 0.16} ${cy - r * 0.16} ${cx + r} ${cy} C${cx + r * 0.16} ${cy + r * 0.16} ${cx + r * 0.16} ${cy + r * 0.16} ${cx} ${cy + r} C${cx - r * 0.16} ${cy + r * 0.16} ${cx - r * 0.16} ${cy + r * 0.16} ${cx - r} ${cy} C${cx - r * 0.16} ${cy - r * 0.16} ${cx - r * 0.16} ${cy - r * 0.16} ${cx} ${cy - r} Z`;

export const CLIPS = {
  none: { label: 'None' },
  sparkle: {
    label: 'Sparkle',
    front: (p) => <path d={sparklePath(69, 71, 8.5)} fill={p.clip} {...clipLine} />,
  },
  star: {
    label: 'Star',
    front: (p) => (
      <path
        d={starPath(69, 71, 8, 0.5)}
        fill={p.clip}
        {...clipLine}
        transform="rotate(-12 69 71)"
      />
    ),
  },
  heart: {
    label: 'Heart',
    front: (p) => (
      <path d={heartPath(69, 71, 6.6)} fill={p.clip} {...clipLine} transform="rotate(-14 69 71)" />
    ),
  },
  bow: {
    label: 'Bow',
    front: (p) => (
      <g fill={p.clip} {...clipLine} transform="rotate(-18 69 71)">
        <path d="M69 71 L58 64.5 C55.5 68 55.5 74 58 77.5 Z" />
        <path d="M69 71 L80 64.5 C82.5 68 82.5 74 80 77.5 Z" />
        <rect x={65.5} y={67.5} width={7} height={7} rx={2.4} fill={p.clipShade} />
      </g>
    ),
  },
  bar: {
    label: 'Barrette',
    front: (p) => (
      <g transform="rotate(-24 70 72)">
        <rect x={57} y={68.5} width={26} height={7} rx={3.5} fill={p.clip} {...clipLine} />
        <circle cx={63} cy={72} r={1.6} fill="#fff" />
        <circle cx={70} cy={72} r={1.6} fill="#fff" />
        <circle cx={77} cy={72} r={1.6} fill="#fff" />
      </g>
    ),
  },
} as const satisfies Record<string, Item>;
