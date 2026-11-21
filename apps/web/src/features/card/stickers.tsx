import { memo, useId, type ReactNode } from 'react';
import { heartPath, INK, starPath } from '../avatar/art';
import { colorHex } from './catalog';
import type { Sticker as StickerData } from './recipe';

/**
 * Card stickers, drawn like the avatars: flat fills, thick ink outlines, little faces. Each is
 * drawn in a 100 × 100 box centred on (50, 50); `Sticker` adds the white die-cut edge and a soft
 * shadow, so they read as real stickers stuck on the card.
 */

export interface StickerDef {
  label: string;
  /** Colour id (catalog COLORS) when the sticker takes a colour; the default. */
  color?: string;
  /** False for things that aren't die-cut stickers (tape, pins, clips): just a shadow. */
  cut?: boolean;
  draw: (color: string) => ReactNode;
}

const SW = 4.6;
const line = {
  stroke: INK,
  strokeWidth: SW,
  strokeLinejoin: 'round',
  strokeLinecap: 'round',
} as const;
const thin = (w = 3.4, color: string = INK) =>
  ({
    stroke: color,
    strokeWidth: w,
    strokeLinejoin: 'round',
    strokeLinecap: 'round',
    fill: 'none',
  }) as const;

const BLUSH = '#ff8fab';
const YELLOW = '#fcd34d';
const GOLD = '#fbbf24';
const ORANGE = '#fb923c';
const RED = '#ef5350';
const GREEN = '#5fcf7f';
const SKY = '#7cc4f8';
const CREAM = '#fff4e2';
const CRUST = '#e8a660';

/** Dot eyes, a small smile and blush: the avatar face, sticker-sized. */
function face(cx: number, cy: number, s = 1, mouth: 'smile' | 'o' | 'sleepy' = 'smile') {
  const eyes =
    mouth === 'sleepy' ? (
      <path
        d={`M${cx - 12 * s} ${cy} q${3.5 * s} ${3.5 * s} ${7 * s} 0 M${cx + 5 * s} ${cy} q${3.5 * s} ${3.5 * s} ${7 * s} 0`}
        {...thin(3 * s)}
      />
    ) : (
      <g fill={INK}>
        <circle cx={cx - 8.5 * s} cy={cy} r={3.3 * s} />
        <circle cx={cx + 8.5 * s} cy={cy} r={3.3 * s} />
        <circle cx={cx - 7.4 * s} cy={cy - 1.2 * s} r={1.1 * s} fill="#fff" />
        <circle cx={cx + 9.6 * s} cy={cy - 1.2 * s} r={1.1 * s} fill="#fff" />
      </g>
    );
  return (
    <g>
      {eyes}
      {mouth === 'o' ? (
        <ellipse cx={cx} cy={cy + 8 * s} rx={3 * s} ry={3.6 * s} fill={INK} />
      ) : (
        <path
          d={`M${cx - 4.5 * s} ${cy + 6 * s} Q${cx} ${cy + 10.5 * s} ${cx + 4.5 * s} ${cy + 6 * s}`}
          {...thin(3 * s)}
        />
      )}
      <g fill={BLUSH} opacity={0.75}>
        <ellipse cx={cx - 15 * s} cy={cy + 5.5 * s} rx={4.2 * s} ry={2.6 * s} />
        <ellipse cx={cx + 15 * s} cy={cy + 5.5 * s} rx={4.2 * s} ry={2.6 * s} />
      </g>
    </g>
  );
}

const shine = (cx: number, cy: number, rx = 6, ry = 3.4, rot = -35) => (
  <ellipse
    cx={cx}
    cy={cy}
    rx={rx}
    ry={ry}
    fill="#fff"
    opacity={0.75}
    transform={`rotate(${rot} ${cx} ${cy})`}
  />
);

/** Draws overlapping shapes as one silhouette: outlines first, then every fill on top. */
const merged = (fill: string, shapes: ReactNode) => (
  <g>
    <g stroke={INK} strokeWidth={SW * 2} strokeLinejoin="round" fill={INK}>
      {shapes}
    </g>
    <g fill={fill}>{shapes}</g>
  </g>
);

const polar = (cx: number, cy: number, r: number, a: number) =>
  `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;

/** A badge outline with `n` round bumps. */
function scallop(cx: number, cy: number, r: number, n: number, depth: number) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const mid = (a0 + a1) / 2;
    if (i === 0) d += `M${polar(cx, cy, r, a0)} `;
    d += `Q${polar(cx, cy, r + depth * 2, mid)} ${polar(cx, cy, r, a1)} `;
  }
  return `${d}Z`;
}

/** A spiky burst with `n` points. */
function burst(cx: number, cy: number, r: number, n: number, inner: number) {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    pts.push(polar(cx, cy, i % 2 === 0 ? r : r * inner, a));
  }
  return `M${pts.join(' L')} Z`;
}

const label = (text: string, x: number, y: number, size: number, rot = 0, fill = INK) => (
  <text
    x={x}
    y={y}
    fontSize={size}
    fontWeight={900}
    fill={fill}
    textAnchor="middle"
    dominantBaseline="central"
    fontFamily="'Figtree Variable', ui-sans-serif, system-ui, sans-serif"
    transform={rot ? `rotate(${rot} ${x} ${y})` : undefined}
    letterSpacing={-0.5}
  >
    {text}
  </text>
);

export const STICKERS: Record<string, StickerDef> = {
  star: {
    label: 'Star',
    color: 'yellow',
    draw: (c) => (
      <g>
        <path d={starPath(50, 55, 47, 0.52)} fill={c} {...line} />
        {face(50, 58, 0.72)}
      </g>
    ),
  },
  heart: {
    label: 'Heart',
    color: 'red',
    draw: (c) => (
      <g>
        <path d={heartPath(50, 54, 42)} fill={c} {...line} />
        {shine(28, 36, 7, 4)}
      </g>
    ),
  },
  sparkle: {
    label: 'Sparkle',
    color: 'yellow',
    draw: (c) => (
      <g>
        <path
          d="M44 8 C47 38 54 46 84 50 C54 54 47 62 44 92 C41 62 34 54 4 50 C34 46 41 38 44 8 Z"
          fill={c}
          {...line}
        />
        <path
          d="M80 6 C81 16 84 19 94 20 C84 21 81 24 80 34 C79 24 76 21 66 20 C76 19 79 16 80 6 Z"
          fill={c}
          {...line}
          strokeWidth={3.6}
        />
      </g>
    ),
  },
  bolt: {
    label: 'Lightning',
    color: 'yellow',
    draw: (c) => <path d="M58 4 L16 56 H44 L34 96 L84 40 H56 L70 4 Z" fill={c} {...line} />,
  },
  flower: {
    label: 'Flower',
    color: 'rose',
    draw: (c) => (
      <g>
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <ellipse
            key={a}
            cx={50}
            cy={27}
            rx={14}
            ry={21}
            fill={c}
            {...line}
            transform={`rotate(${a} 50 50)`}
          />
        ))}
        <circle cx={50} cy={50} r={17} fill={YELLOW} {...line} />
        {face(50, 50, 0.55)}
      </g>
    ),
  },
  sun: {
    label: 'Sun',
    draw: () => (
      <g>
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          return (
            <path
              key={i}
              d={`M${polar(50, 50, 30, a - 0.2)} L${polar(50, 50, 47, a)} L${polar(50, 50, 30, a + 0.2)} Z`}
              fill={ORANGE}
              {...line}
              strokeWidth={3.6}
            />
          );
        })}
        <circle cx={50} cy={50} r={29} fill={YELLOW} {...line} />
        {face(50, 50, 0.8)}
      </g>
    ),
  },
  moon: {
    label: 'Moon',
    draw: () => (
      <g>
        <path d="M58 8 A42 42 0 1 0 92 70 A33 33 0 1 1 58 8 Z" fill="#fde68a" {...line} />
        {face(36, 56, 0.62, 'sleepy')}
        <path d={starPath(80, 26, 9, 0.5)} fill={YELLOW} {...line} strokeWidth={3} />
      </g>
    ),
  },
  cloud: {
    label: 'Cloud',
    draw: () => (
      <g>
        <path
          d="M24 78 C10 78 4 66 10 56 C8 44 20 36 32 40 C36 24 58 18 68 32 C82 28 96 40 90 54 C98 62 94 78 80 78 Z"
          fill="#fff"
          {...line}
        />
        {face(52, 58, 0.72)}
      </g>
    ),
  },
  rainbow: {
    label: 'Rainbow',
    draw: () => {
      const band = (R: number, r: number, fill: string) => (
        <path
          d={`M${50 - R} 76 A${R} ${R} 0 0 1 ${50 + R} 76 L${50 + r} 76 A${r} ${r} 0 0 0 ${50 - r} 76 Z`}
          fill={fill}
          {...line}
          strokeWidth={3.6}
        />
      );
      const puff = (x: number) => (
        <path
          d={`M${x - 14} 84 C${x - 20} 84 ${x - 20} 74 ${x - 12} 73 C${x - 10} 64 ${x + 4} 64 ${x + 6} 71 C${x + 14} 70 ${x + 18} 80 ${x + 12} 84 Z`}
          fill="#fff"
          {...line}
          strokeWidth={3.6}
        />
      );
      return (
        <g>
          {band(46, 36, RED)}
          {band(36, 26, YELLOW)}
          {band(26, 16, SKY)}
          {puff(12)}
          {puff(86)}
        </g>
      );
    },
  },
  note: {
    label: 'Music',
    color: 'indigo',
    draw: (c) => (
      <g>
        {merged(
          c,
          <>
            <path d="M33 22 L77 10 V24 L33 36 Z" />
            <rect x={33} y={24} width={8} height={50} />
            <rect x={69} y={12} width={8} height={50} />
            <ellipse cx={28} cy={74} rx={14} ry={10.5} transform="rotate(-18 28 74)" />
            <ellipse cx={64} cy={62} rx={14} ry={10.5} transform="rotate(-18 64 62)" />
          </>,
        )}
        {shine(24, 70, 4, 2.2)}
        {shine(60, 58, 4, 2.2)}
      </g>
    ),
  },
  crown: {
    label: 'Crown',
    draw: () => (
      <g>
        <path d="M14 72 L8 28 L32 48 L50 16 L68 48 L92 28 L86 72 Z" fill={YELLOW} {...line} />
        <rect x={12} y={70} width={76} height={16} rx={4} fill={GOLD} {...line} />
        <circle cx={8} cy={28} r={6} fill="#f47cb4" {...line} strokeWidth={3.4} />
        <circle cx={50} cy={16} r={6.5} fill={SKY} {...line} strokeWidth={3.4} />
        <circle cx={92} cy={28} r={6} fill="#f47cb4" {...line} strokeWidth={3.4} />
        <circle cx={32} cy={78} r={3.6} fill={RED} />
        <circle cx={50} cy={78} r={3.6} fill={SKY} />
        <circle cx={68} cy={78} r={3.6} fill={RED} />
      </g>
    ),
  },
  flame: {
    label: 'Flame',
    draw: () => (
      <g>
        <path
          d="M50 4 C60 22 82 34 82 60 C82 80 68 94 50 94 C32 94 18 80 18 62 C18 46 28 38 33 27 C38 38 41 43 46 44 C43 30 44 16 50 4 Z"
          fill={ORANGE}
          {...line}
        />
        <path
          d="M50 48 C57 59 67 64 67 76 C67 86 59 92 50 92 C41 92 33 86 33 76 C33 67 43 61 50 48 Z"
          fill={YELLOW}
        />
        {face(50, 74, 0.55)}
      </g>
    ),
  },
  smiley: {
    label: 'Smiley',
    draw: () => (
      <g>
        <circle cx={50} cy={50} r={43} fill={YELLOW} {...line} />
        <ellipse cx={36} cy={40} rx={5} ry={8} fill={INK} />
        <ellipse cx={64} cy={40} rx={5} ry={8} fill={INK} />
        <path d="M26 56 Q50 84 74 56 Q50 64 26 56 Z" fill={INK} {...line} strokeWidth={3.6} />
        <path d="M40 70 Q50 76 60 70 Q56 66 50 66 Q44 66 40 70 Z" fill="#f87171" />
        {shine(26, 24, 7, 3.8)}
      </g>
    ),
  },
  peace: {
    label: 'Peace',
    color: 'lilac',
    draw: (c) => (
      <g>
        <circle cx={50} cy={50} r={43} fill={c} {...line} />
        <g {...thin(7.5, '#fff')}>
          <circle cx={50} cy={50} r={29} />
          <path d="M50 21 V79 M50 50 L29.5 70.5 M50 50 L70.5 70.5" />
        </g>
      </g>
    ),
  },
  wow: {
    label: 'Wow!',
    color: 'yellow',
    draw: (c) => (
      <g>
        <path d={burst(50, 50, 48, 13, 0.78)} fill={c} {...line} />
        {label('WOW', 50, 51, 24, -10)}
      </g>
    ),
  },
  hi: {
    label: 'Hi!',
    color: 'white',
    draw: (c) => (
      <g>
        <path
          d="M18 16 H82 Q94 16 94 28 V62 Q94 74 82 74 H46 L26 92 L30 74 H18 Q6 74 6 62 V28 Q6 16 18 16 Z"
          fill={c}
          {...line}
        />
        {label('hi!', 50, 44, 34, -4)}
      </g>
    ),
  },
  check: {
    label: 'Badge',
    color: 'green',
    draw: (c) => (
      <g>
        <path d={scallop(50, 50, 38, 12, 3.4)} fill={c} {...line} />
        <path d="M31 51 L44 64 L70 37" {...thin(10, INK)} />
        <path d="M31 51 L44 64 L70 37" {...thin(5.4, '#fff')} />
      </g>
    ),
  },
  pizza: {
    label: 'Pizza',
    draw: () => (
      <g>
        <path d="M50 94 L13 24 Q50 4 87 24 Z" fill={YELLOW} {...line} />
        <path
          d="M13 24 Q50 4 87 24 L82 34 Q50 16 18 34 Z"
          fill={CRUST}
          {...line}
          strokeWidth={3.8}
        />
        <g fill={RED} {...line} strokeWidth={3}>
          <circle cx={39} cy={45} r={7} />
          <circle cx={62} cy={47} r={6.5} />
          <circle cx={50} cy={68} r={6} />
        </g>
      </g>
    ),
  },
  coffee: {
    label: 'Coffee',
    draw: () => (
      <g>
        <path d="M70 46 Q88 44 88 58 Q88 72 68 72" {...thin(SW * 2.6)} />
        <path d="M70 46 Q88 44 88 58 Q88 72 68 72" {...thin(SW * 0.9, '#fff')} />
        <path d="M18 36 H72 V72 Q72 90 54 90 H36 Q18 90 18 72 Z" fill="#fff" {...line} />
        <ellipse cx={45} cy={36} rx={27} ry={6} fill="#7a4a2a" {...line} strokeWidth={3.6} />
        <path
          d="M34 22 q-5 -6 0 -12 q5 -6 0 -12 M48 22 q-5 -6 0 -12 q5 -6 0 -12"
          {...thin(3.6)}
          opacity={0.75}
          transform="translate(0 4)"
        />
        {face(45, 60, 0.7)}
      </g>
    ),
  },
  donut: {
    label: 'Donut',
    color: 'rose',
    draw: (c) => (
      <g>
        <path
          d="M50 8 A42 42 0 1 1 49.9 8 Z M50 39 A11 11 0 1 0 50.1 39 Z"
          fill={CRUST}
          fillRule="evenodd"
          {...line}
        />
        <path
          d="M50 14 C64 13 80 20 84 36 C88 48 82 52 86 60 C84 74 70 84 56 84 C48 80 44 86 34 82 C22 78 14 68 14 54 C16 44 12 38 18 30 C24 20 38 14 50 14 Z M50 39 A11 11 0 1 0 50.1 39 Z"
          fill={c}
          fillRule="evenodd"
          {...line}
          strokeWidth={3.6}
        />
        <g strokeWidth={3.6} strokeLinecap="round">
          <path d="M30 30 l5 3" stroke={YELLOW} />
          <path d="M66 26 l-2 5" stroke={SKY} />
          <path d="M74 48 l5 -2" stroke="#fff" />
          <path d="M26 56 l3 5" stroke={SKY} />
          <path d="M60 72 l5 2" stroke={YELLOW} />
          <path d="M40 70 l-4 4" stroke="#fff" />
          <path d="M44 24 l4 -2" stroke={GREEN} />
        </g>
      </g>
    ),
  },
  icecream: {
    label: 'Ice cream',
    color: 'rose',
    draw: (c) => (
      <g>
        <path d="M28 50 L50 96 L72 50 Z" fill={CRUST} {...line} />
        <path
          d="M36 58 L58 82 M48 54 L64 70 M64 56 L44 80 M52 54 L38 68"
          {...thin(2.6)}
          opacity={0.5}
        />
        <path
          d="M22 52 C14 50 14 38 22 34 C22 18 36 10 50 10 C64 10 78 18 78 34 C86 38 86 50 78 52 C74 60 66 56 62 60 C56 66 50 58 44 62 C38 58 30 60 22 52 Z"
          fill={c}
          {...line}
        />
        <circle cx={50} cy={8} r={7} fill={RED} {...line} strokeWidth={3.4} />
        {face(50, 36, 0.7)}
      </g>
    ),
  },
  cherry: {
    label: 'Cherries',
    draw: () => (
      <g>
        <path d="M32 58 Q38 30 60 12 M70 60 Q64 34 60 12" {...thin(SW)} />
        <ellipse
          cx={72}
          cy={15}
          rx={14}
          ry={7}
          fill={GREEN}
          {...line}
          strokeWidth={3.6}
          transform="rotate(-20 72 15)"
        />
        <circle cx={30} cy={70} r={19} fill={RED} {...line} />
        <circle cx={70} cy={72} r={19} fill={RED} {...line} />
        {shine(23, 63, 5, 3)}
        {shine(63, 65, 5, 3)}
      </g>
    ),
  },
  boba: {
    label: 'Boba',
    draw: () => (
      <g>
        <path d="M56 2 L64 3 L58 44 L50 43 Z" fill="#f47cb4" {...line} strokeWidth={3.6} />
        <path d="M24 36 H76 L68 94 H32 Z" fill="#f3d9b1" {...line} />
        <path d="M18 36 Q50 12 82 36 Z" fill="#fff" {...line} opacity={0.95} />
        <g fill="#3b2418">
          <circle cx={39} cy={84} r={4.4} />
          <circle cx={50} cy={86} r={4.4} />
          <circle cx={61} cy={84} r={4.4} />
          <circle cx={44} cy={77} r={4.4} />
          <circle cx={56} cy={77} r={4.4} />
        </g>
        {face(50, 56, 0.66)}
      </g>
    ),
  },
  controller: {
    label: 'Gamepad',
    color: 'indigo',
    draw: (c) => (
      <g>
        <path
          d="M26 30 H74 Q92 30 95 56 Q98 82 82 82 Q71 82 65 68 H35 Q29 82 18 82 Q2 82 5 56 Q8 30 26 30 Z"
          fill={c}
          {...line}
        />
        <path
          d="M22 50 h6 v-6 h6 v6 h6 v6 h-6 v6 h-6 v-6 h-6 Z"
          fill="#fff"
          {...line}
          strokeWidth={2.6}
        />
        <circle cx={72} cy={46} r={4.6} fill={YELLOW} {...line} strokeWidth={2.6} />
        <circle cx={81} cy={55} r={4.6} fill={RED} {...line} strokeWidth={2.6} />
        <circle cx={63} cy={55} r={4.6} fill={GREEN} {...line} strokeWidth={2.6} />
      </g>
    ),
  },
  headphones: {
    label: 'Headphones',
    color: 'rose',
    draw: (c) => (
      <g>
        <path d="M17 62 Q15 14 50 14 Q85 14 83 62" {...thin(14)} />
        <path d="M17 62 Q15 14 50 14 Q85 14 83 62" {...thin(6, c)} />
        <rect x={6} y={50} width={24} height={38} rx={11} fill={c} {...line} />
        <rect x={70} y={50} width={24} height={38} rx={11} fill={c} {...line} />
      </g>
    ),
  },
  camera: {
    label: 'Camera',
    color: 'sky',
    draw: (c) => (
      <g>
        <rect x={20} y={20} width={22} height={14} rx={4} fill={c} {...line} />
        <rect x={6} y={28} width={88} height={58} rx={14} fill={c} {...line} />
        <circle cx={50} cy={57} r={21} fill={INK} />
        <circle cx={50} cy={57} r={13} fill="#93c5fd" {...line} strokeWidth={3.4} />
        {shine(45, 52, 4, 2.4)}
        <rect x={72} y={36} width={12} height={7} rx={2} fill="#fff" {...line} strokeWidth={2.6} />
      </g>
    ),
  },
  skateboard: {
    label: 'Skateboard',
    color: 'orange',
    draw: (c) => (
      <g transform="rotate(-24 50 50)">
        <circle cx={26} cy={64} r={7.5} fill={YELLOW} {...line} strokeWidth={3.6} />
        <circle cx={74} cy={64} r={7.5} fill={YELLOW} {...line} strokeWidth={3.6} />
        <path
          d="M10 42 H90 Q98 42 98 50 Q98 58 90 58 H10 Q2 58 2 50 Q2 42 10 42 Z"
          fill={c}
          {...line}
        />
        <path d={starPath(50, 50, 6, 0.5)} fill="#fff" />
      </g>
    ),
  },
  basketball: {
    label: 'Basketball',
    draw: () => (
      <g>
        <circle cx={50} cy={50} r={43} fill={ORANGE} {...line} />
        <g {...thin(3.6)}>
          <path d="M50 7 V93 M7 50 H93" />
          <path d="M20 19 Q36 50 20 81 M80 19 Q64 50 80 81" />
        </g>
      </g>
    ),
  },
  planet: {
    label: 'Planet',
    color: 'lilac',
    draw: (c) => (
      <g transform="rotate(-18 50 50)">
        <path d="M6 50 A44 13 0 0 1 94 50" {...thin(12)} />
        <path d="M6 50 A44 13 0 0 1 94 50" {...thin(5, YELLOW)} />
        <circle cx={50} cy={50} r={29} fill={c} {...line} />
        <path d="M6 50 A44 13 0 0 0 94 50" {...thin(12)} />
        <path d="M6 50 A44 13 0 0 0 94 50" {...thin(5, YELLOW)} />
        {shine(38, 34, 6, 3.4, -10)}
      </g>
    ),
  },
  rocket: {
    label: 'Rocket',
    draw: () => (
      <g transform="rotate(30 50 50)">
        <path d="M40 72 Q50 104 60 72 Z" fill={ORANGE} {...line} strokeWidth={3.6} />
        <path d="M31 50 L16 74 L33 72 Z M69 50 L84 74 L67 72 Z" fill={RED} {...line} />
        <path d="M50 4 Q72 22 70 70 H30 Q28 22 50 4 Z" fill="#fff" {...line} />
        <circle cx={50} cy={38} r={10} fill={SKY} {...line} strokeWidth={3.6} />
        <path d="M38 18 Q50 10 62 18" {...thin(3)} opacity={0.4} />
      </g>
    ),
  },
  ghost: {
    label: 'Ghost',
    draw: () => (
      <g>
        <path
          d="M20 88 V44 Q20 10 50 10 Q80 10 80 44 V88 L70 80 L60 88 L50 80 L40 88 L30 80 Z"
          fill="#fff"
          {...line}
        />
        {face(50, 44, 0.85, 'o')}
      </g>
    ),
  },
  cat: {
    label: 'Cat',
    draw: () => (
      <g>
        <path
          d="M12 52 Q12 30 20 10 L38 26 Q50 22 62 26 L80 10 Q88 30 88 52 Q88 86 50 86 Q12 86 12 52 Z"
          fill="#f6a75e"
          {...line}
        />
        <path d="M22 22 L32 30 M78 22 L68 30" {...thin(3.4, '#f9a8c4')} />
        {face(50, 54, 0.9)}
        <path d="M6 58 H22 M8 66 L22 63 M94 58 H78 M92 66 L78 63" {...thin(2.6)} />
      </g>
    ),
  },
  paw: {
    label: 'Paw',
    color: 'rose',
    draw: (c) => (
      <g fill={c} {...line}>
        <path d="M50 46 C66 46 80 62 76 76 C73 88 60 84 50 84 C40 84 27 88 24 76 C20 62 34 46 50 46 Z" />
        <ellipse cx={20} cy={42} rx={9.5} ry={12} transform="rotate(-20 20 42)" />
        <ellipse cx={38} cy={24} rx={9.5} ry={12.5} transform="rotate(-6 38 24)" />
        <ellipse cx={62} cy={24} rx={9.5} ry={12.5} transform="rotate(6 62 24)" />
        <ellipse cx={80} cy={42} rx={9.5} ry={12} transform="rotate(20 80 42)" />
      </g>
    ),
  },
  mushroom: {
    label: 'Mushroom',
    draw: () => (
      <g>
        <path d="M36 56 Q32 92 40 94 H60 Q68 92 64 56 Z" fill={CREAM} {...line} />
        <path d="M6 56 Q6 10 50 10 Q94 10 94 56 Q50 68 6 56 Z" fill={RED} {...line} />
        <g fill="#fff">
          <circle cx={30} cy={34} r={7} />
          <circle cx={58} cy={24} r={6} />
          <circle cx={74} cy={44} r={5.5} />
          <circle cx={46} cy={48} r={4.5} />
        </g>
        {face(50, 76, 0.55)}
      </g>
    ),
  },
  clover: {
    label: 'Clover',
    draw: () => (
      <g>
        <path d="M52 52 Q58 74 70 94" {...thin(SW * 2.2)} />
        <path d="M52 52 Q58 74 70 94" {...thin(SW * 0.8, GREEN)} />
        {merged(
          GREEN,
          [0, 90, 180, 270].map((a) => (
            <path key={a} d={heartPath(50, 31, 17)} transform={`rotate(${a} 50 50)`} />
          )),
        )}
        <path
          d="M50 50 L50 22 M50 50 L78 50 M50 50 L50 78 M50 50 L22 50"
          {...thin(2.4)}
          opacity={0.35}
        />
      </g>
    ),
  },
  cactus: {
    label: 'Cactus',
    draw: () => (
      <g>
        {merged(
          GREEN,
          <>
            <rect x={38} y={12} width={24} height={66} rx={12} />
            <rect x={16} y={30} width={14} height={30} rx={7} />
            <rect x={20} y={48} width={22} height={12} rx={6} />
            <rect x={70} y={22} width={14} height={28} rx={7} />
            <rect x={58} y={38} width={22} height={12} rx={6} />
          </>,
        )}
        {face(50, 44, 0.6)}
        <path d="M24 70 H76 L70 96 H30 Z" fill="#e07a4f" {...line} />
        <rect x={20} y={64} width={60} height={12} rx={3} fill="#f08c5f" {...line} />
      </g>
    ),
  },
  alien: {
    label: 'Alien',
    draw: () => (
      <g>
        <path
          d="M50 8 Q88 8 88 44 Q88 76 50 94 Q12 76 12 44 Q12 8 50 8 Z"
          fill="#8fdc7a"
          {...line}
        />
        <ellipse cx={33} cy={50} rx={13} ry={8} transform="rotate(28 33 50)" fill={INK} />
        <ellipse cx={67} cy={50} rx={13} ry={8} transform="rotate(-28 67 50)" fill={INK} />
        <circle cx={30} cy={46} r={2.6} fill="#fff" />
        <circle cx={64} cy={46} r={2.6} fill="#fff" />
        <path d="M44 72 Q50 76 56 72" {...thin(3)} />
      </g>
    ),
  },
  dice: {
    label: 'Dice',
    draw: () => (
      <g transform="rotate(12 50 50)">
        <rect x={12} y={12} width={76} height={76} rx={18} fill="#fff" {...line} />
        <g fill={INK}>
          <circle cx={32} cy={32} r={6.5} />
          <circle cx={68} cy={32} r={6.5} />
          <circle cx={50} cy={50} r={6.5} fill={RED} />
          <circle cx={32} cy={68} r={6.5} />
          <circle cx={68} cy={68} r={6.5} />
        </g>
      </g>
    ),
  },
  gem: {
    label: 'Gem',
    color: 'sky',
    draw: (c) => (
      <g>
        <path d="M24 16 H76 L95 40 L50 92 L5 40 Z" fill={c} {...line} />
        <path d="M5 40 H95 M24 16 L36 40 L50 92 L64 40 L76 16 M36 40 L50 16 L64 40" {...thin(3)} />
        <path d="M24 16 L36 40 L5 40 Z" fill="#fff" opacity={0.4} />
      </g>
    ),
  },
  balloon: {
    label: 'Balloon',
    color: 'red',
    draw: (c) => (
      <g>
        <path d="M50 74 Q44 84 54 90 Q62 96 52 100" {...thin(3)} />
        <path d="M44 78 L50 70 L56 78 Z" fill={c} {...line} strokeWidth={3} />
        <ellipse cx={50} cy={38} rx={30} ry={34} fill={c} {...line} />
        {shine(36, 22, 7, 4)}
      </g>
    ),
  },
  bandage: {
    label: 'Bandage',
    draw: () => (
      <g transform="rotate(-32 50 50)">
        <rect x={4} y={34} width={92} height={32} rx={16} fill="#f6c9a0" {...line} />
        <rect x={34} y={36} width={32} height={28} rx={4} fill="#fbe2c8" />
        <g fill="#d9a27a">
          <circle cx={17} cy={44} r={2} />
          <circle cx={17} cy={56} r={2} />
          <circle cx={24} cy={50} r={2} />
          <circle cx={83} cy={44} r={2} />
          <circle cx={83} cy={56} r={2} />
          <circle cx={76} cy={50} r={2} />
        </g>
      </g>
    ),
  },
  tape: {
    label: 'Tape',
    color: 'yellow',
    cut: false,
    draw: (c) => (
      <g transform="rotate(-12 50 50)">
        <path
          d="M4 36 L8 40 L4 44 L8 48 L4 52 L8 56 L4 60 L8 64 H92 L96 60 L92 56 L96 52 L92 48 L96 44 L92 40 L96 36 Z"
          fill={c}
          opacity={0.82}
        />
        <g stroke="#fff" strokeWidth={4} opacity={0.35}>
          {[14, 30, 46, 62, 78].map((x) => (
            <path key={x} d={`M${x} 64 L${x + 14} 36`} />
          ))}
        </g>
      </g>
    ),
  },
  pin: {
    label: 'Pin',
    color: 'red',
    cut: false,
    draw: (c) => (
      <g>
        <path d="M50 60 L52 94" {...thin(4.4, '#9ca3af')} />
        <path d="M38 52 H62 L58 64 H42 Z" fill={c} {...line} strokeWidth={3.6} />
        <circle cx={50} cy={32} r={24} fill={c} {...line} />
        {shine(40, 22, 7, 4)}
      </g>
    ),
  },
  clip: {
    label: 'Paper clip',
    cut: false,
    draw: () => {
      const d =
        'M40 82 V28 Q40 12 54 12 Q68 12 68 28 V72 Q68 90 52 90 Q34 90 34 72 V36 Q34 26 44 26 Q54 26 54 36 V70';
      return (
        <g transform="rotate(18 50 50)">
          <path d={d} {...thin(9)} />
          <path d={d} {...thin(4.4, '#d4d4d8')} />
        </g>
      );
    },
  },
};

export const STICKER_IDS = Object.keys(STICKERS);

/** The 100-unit drawing is 56 layout px at scale 1; the box adds room for the die-cut edge. */
export const STICKER_BASE = 56;
const PAD = 14;
const BOX = 100 + PAD * 2;
export const STICKER_BOX = (STICKER_BASE * BOX) / 100;

const EMOJI_FONT = "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";

/** One sticker, drawn in a square `STICKER_BOX × STICKER_BOX` (at scale 1) centred on its spot. */
export const StickerArt = memo(function StickerArt({
  sticker,
  className,
  style,
}: {
  sticker: Pick<StickerData, 'k' | 'e' | 'c'>;
  className?: string;
  style?: React.CSSProperties;
}) {
  const uid = `st${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const def = sticker.k !== undefined ? STICKERS[sticker.k] : undefined;
  const cut = def ? def.cut !== false : true;
  const color = def?.color ? colorHex(sticker.c ?? def.color, colorHex(def.color)) : '';
  return (
    <svg
      viewBox={`${-PAD} ${-PAD} ${BOX} ${BOX}`}
      className={className}
      style={style}
      aria-hidden
      focusable="false"
      overflow="visible"
    >
      <defs>
        <filter
          id={uid}
          x="-30%"
          y="-30%"
          width="160%"
          height="160%"
          colorInterpolationFilters="sRGB"
        >
          {cut ? (
            <>
              <feMorphology in="SourceAlpha" operator="dilate" radius={5} result="grow" />
              <feFlood floodColor="#fff" />
              <feComposite in2="grow" operator="in" result="edge" />
              <feGaussianBlur in="grow" stdDeviation={2.4} result="blur" />
            </>
          ) : (
            <feGaussianBlur in="SourceAlpha" stdDeviation={1.8} result="blur" />
          )}
          <feOffset in="blur" dy={cut ? 2.6 : 2} result="drop" />
          <feFlood floodColor="#000" floodOpacity={cut ? 0.2 : 0.22} />
          <feComposite in2="drop" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            {cut ? <feMergeNode in="edge" /> : null}
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#${uid})`}>
        {def ? (
          def.draw(color)
        ) : (
          <text
            x={50}
            y={54}
            fontSize={80}
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily={EMOJI_FONT}
          >
            {sticker.e}
          </text>
        )}
      </g>
    </svg>
  );
});
