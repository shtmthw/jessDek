import { DW, INK, MIRROR, outline, starPath, type Item, type Paint } from '../art';
import { mix } from '../color';
import { flower, GOLD } from './clothes';

export interface HatItem extends Item {
  /** The region where hair may still show (everything else is under the hat). */
  clip?: string;
}

/** Hair shows only below `y`. */
const below = (y: number) => `M-20 ${y} H220 V220 H-20 Z`;

const line = (stroke: string, width = 3) =>
  ({
    fill: 'none',
    stroke,
    strokeWidth: width,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }) as const;

/** A headband over the crown, for ears and the like. */
const band = (p: Paint) => (
  <g>
    <path d="M51 76 C50 44 72 33 100 33 C128 33 150 44 149 76" {...line(INK, 9.5)} />
    <path d="M51 76 C50 44 72 33 100 33 C128 33 150 44 149 76" {...line(p.hatShade, 4)} />
  </g>
);

const INNER_EAR = '#f9a8c4';
const STRAW = '#eecf82';
const FROG = '#7cc977';
const SANTA = '#e5403a';

const ribs = (x0: number, x1: number, y0: number, y1: number, step: number, color: string) => {
  let d = '';
  for (let x = x0; x <= x1; x += step) d += `M${x} ${y0} L${x} ${y1} `;
  return <path d={d} {...line(color, 2)} />;
};

export const HATS = {
  none: { label: 'None' },
  beanie: {
    label: 'Beanie',
    clip: below(70),
    front: (p) => (
      <g>
        <path d="M45 70 C43 36 68 22 100 22 C132 22 157 36 155 70 Z" fill={p.hat} {...outline} />
        <path
          d="M80 27 Q75 46 75 62 M100 23 V62 M120 27 Q125 46 125 62"
          {...line(p.hatShade, 2.6)}
        />
        <rect x={40} y={57} width={120} height={19} rx={9.5} fill={p.hatShade} {...outline} />
        {ribs(50, 150, 62, 71, 7.5, mix(p.hatShade, INK, 0.22))}
        <circle cx={100} cy={18} r={10} fill={p.hatTint} {...outline} />
      </g>
    ),
  },
  cap: {
    label: 'Cap',
    clip: below(72),
    front: (p) => (
      <g>
        <path d="M46 73 C44 40 68 26 100 26 C132 26 156 40 154 73 Z" fill={p.hat} {...outline} />
        <path
          d="M100 27 V64 M77 31 Q70 48 70 68 M123 31 Q130 48 130 68"
          {...line(p.hatShade, 2.4)}
        />
        <circle cx={100} cy={26.5} r={4} fill={p.hatShade} stroke={INK} strokeWidth={2.6} />
        <path
          d={starPath(100, 51, 8, 0.5)}
          fill={p.hatTint}
          stroke={INK}
          strokeWidth={2.2}
          strokeLinejoin="round"
        />
        <path
          d="M39 73 C56 62 144 62 161 73 C163 81 150 89 100 89 C50 89 37 81 39 73 Z"
          fill={p.hatShade}
          {...outline}
        />
      </g>
    ),
  },
  'cap-back': {
    label: 'Backwards cap',
    clip: below(72),
    back: (p) => (
      <path
        d="M112 34 C124 16 152 12 166 22 C158 32 138 38 122 44 Z"
        fill={p.hatShade}
        {...outline}
      />
    ),
    front: (p) => (
      <g>
        <path d="M45 73 C43 40 68 26 100 26 C132 26 157 40 155 73 Z" fill={p.hat} {...outline} />
        <path
          d="M100 27 V58 M77 31 Q70 48 70 68 M123 31 Q130 48 130 68"
          {...line(p.hatShade, 2.4)}
        />
        <path d="M84 73 C84 58 116 58 116 73 Z" fill={p.hair} {...outline} strokeWidth={DW} />
        <path d="M85 66.5 H115" {...line(INK, 7.5)} />
        <path d="M85 66.5 H115" {...line(p.hatShade, 3)} />
        <path d="M45 73 C70 76 130 76 155 73" {...line(INK, DW)} />
      </g>
    ),
  },
  bucket: {
    label: 'Bucket hat',
    clip: below(70),
    front: (p) => (
      <g>
        <path d="M58 64 C58 34 76 25 100 25 C124 25 142 34 142 64 Z" fill={p.hat} />
        <path d="M58.5 51 H141.5 V64 H58.5 Z" fill={p.hatShade} />
        <path d="M58 64 C58 34 76 25 100 25 C124 25 142 34 142 64" fill="none" {...outline} />
        <path
          d="M33 77 C39 62 62 57 100 57 C138 57 161 62 167 77 C165 85 140 87 100 87 C60 87 35 85 33 77 Z"
          fill={p.hat}
          {...outline}
        />
        <path d="M44 75 C60 68 140 68 156 75" {...line(p.hatShade, 2.2)} strokeDasharray="4 4" />
      </g>
    ),
  },
  beret: {
    label: 'Beret',
    clip: below(56),
    front: (p) => (
      <g>
        <path d="M104 31 L107 21" {...line(INK, 5)} />
        <path
          d="M39 61 C33 45 62 29 104 30 C144 31 169 44 161 60 C155 70 128 69 100 67 C72 65 45 73 39 61 Z"
          fill={p.hat}
          {...outline}
        />
        <path d="M52 57 C78 61 124 60 152 55" {...line(p.hatShade, 3)} />
        <path d="M66 41 Q84 34 102 35" {...line(p.hatTint, 3.2)} opacity={0.8} />
      </g>
    ),
  },
  crown: {
    label: 'Crown',
    front: (p) => (
      <g>
        <path
          d="M64 56 L60 24 L77 40 L88 17 L100 36 L112 17 L123 40 L140 24 L136 56 Z"
          fill={GOLD}
          {...outline}
          strokeWidth={DW}
        />
        <path
          d="M63 45.5 H137 L136 56 H64 Z"
          fill={mix(GOLD, '#b45309', 0.3)}
          {...outline}
          strokeWidth={DW}
        />
        <g stroke={INK} strokeWidth={2.2}>
          <circle cx={60} cy={23} r={4} fill="#f43f5e" />
          <circle cx={88} cy={16} r={4} fill="#38bdf8" />
          <circle cx={112} cy={16} r={4} fill="#38bdf8" />
          <circle cx={140} cy={23} r={4} fill="#f43f5e" />
          <circle cx={100} cy={51} r={3.8} fill={p.hat} />
          <circle cx={80} cy={51} r={2.6} fill="#fff" />
          <circle cx={120} cy={51} r={2.6} fill="#fff" />
        </g>
      </g>
    ),
  },
  tiara: {
    label: 'Tiara',
    front: (p) => (
      <g>
        <path d="M60 62 C70 47 130 47 140 62" {...line(INK, 8)} />
        <path d="M60 62 C70 47 130 47 140 62" {...line('#e5e7eb', 3.6)} />
        <path
          d="M78 52 L84 40 L90 49 L100 28 L110 49 L116 40 L122 52 C110 48 90 48 78 52 Z"
          fill="#e5e7eb"
          stroke={INK}
          strokeWidth={2.8}
          strokeLinejoin="round"
        />
        <circle cx={100} cy={42} r={4.6} fill={p.hat} stroke={INK} strokeWidth={2.4} />
        <circle cx={84} cy={45} r={1.8} fill={p.hatTint} stroke={INK} strokeWidth={1.4} />
        <circle cx={116} cy={45} r={1.8} fill={p.hatTint} stroke={INK} strokeWidth={1.4} />
      </g>
    ),
  },
  'flower-crown': {
    label: 'Flower crown',
    front: (p) => {
      const at = [200, 220, 240, 260, 280, 300, 320, 340].map((deg) => {
        const a = (deg * Math.PI) / 180;
        return [100 + 52 * Math.cos(a), 84 + 40 * Math.sin(a)] as const;
      });
      const colors = [p.hat, '#ffffff', '#fcd34d'];
      return (
        <g>
          <g fill="#6cc070" stroke={INK} strokeWidth={2}>
            {at.slice(0, -1).map(([x, y], i) => {
              const [nx, ny] = at[i + 1]!;
              return (
                <ellipse
                  key={i}
                  cx={(x + nx) / 2}
                  cy={(y + ny) / 2 - 3}
                  rx={5}
                  ry={2.6}
                  transform={`rotate(${-30 + i * 9} ${(x + nx) / 2} ${(y + ny) / 2 - 3})`}
                />
              );
            })}
          </g>
          {at.map(([x, y], i) => flower(x, y, colors[i % 3]!, 6.2))}
        </g>
      );
    },
  },
  'cat-ears': {
    label: 'Cat ears',
    front: (p) => {
      const ear = (
        <g>
          <path d="M53 52 L57 15 L86 37 Z" fill={p.hat} {...outline} strokeWidth={DW} />
          <path d="M60 42 L61 26 L75 37 Z" fill={INNER_EAR} />
        </g>
      );
      return (
        <g>
          {ear}
          <g transform={MIRROR}>{ear}</g>
          {band(p)}
        </g>
      );
    },
  },
  'bunny-ears': {
    label: 'Bunny ears',
    front: (p) => (
      <g>
        <g transform="rotate(-12 82 46)">
          <ellipse cx={82} cy={22} rx={10.5} ry={24} fill={p.hat} {...outline} strokeWidth={DW} />
          <ellipse cx={82} cy={25} rx={4.6} ry={16} fill={INNER_EAR} />
        </g>
        <g transform="rotate(58 118 44)">
          <ellipse cx={118} cy={21} rx={10.5} ry={24} fill={p.hat} {...outline} strokeWidth={DW} />
          <ellipse cx={118} cy={24} rx={4.6} ry={16} fill={INNER_EAR} />
        </g>
        {band(p)}
      </g>
    ),
  },
  'bear-ears': {
    label: 'Bear ears',
    front: (p) => (
      <g>
        <circle cx={63} cy={42} r={14} fill={p.hat} {...outline} strokeWidth={DW} />
        <circle cx={137} cy={42} r={14} fill={p.hat} {...outline} strokeWidth={DW} />
        <circle cx={63} cy={42} r={7} fill={p.hatTint} />
        <circle cx={137} cy={42} r={7} fill={p.hatTint} />
        {band(p)}
      </g>
    ),
  },
  party: {
    label: 'Party hat',
    front: (p) => (
      <g transform="rotate(10 100 56)">
        <path
          d="M76 56 L100 7 L124 56 C116 60 84 60 76 56 Z"
          fill={p.hat}
          {...outline}
          strokeWidth={DW}
        />
        <g fill={p.hatTint} stroke={INK} strokeWidth={1.8}>
          <circle cx={96} cy={28} r={3} />
          <circle cx={107} cy={40} r={3.4} />
          <circle cx={90} cy={47} r={3.4} />
          <circle cx={112} cy={53} r={2.6} />
        </g>
        <circle cx={100} cy={7} r={6.5} fill="#fcd34d" stroke={INK} strokeWidth={DW} />
      </g>
    ),
  },
  'top-hat': {
    label: 'Top hat',
    clip: below(58),
    front: (p) => (
      <g>
        <ellipse cx={100} cy={57} rx={47} ry={8.5} fill="#27272a" {...outline} />
        <path
          d="M70 56 L67 14 Q100 8 133 14 L130 56 C120 60 80 60 70 56 Z"
          fill="#27272a"
          {...outline}
        />
        <path d="M69.2 42 Q100 46 130.8 42 L130.1 52 Q100 56 69.9 52 Z" fill={p.hat} />
        <path d="M76 20 Q78 34 78 44" {...line('#52525b', 3)} />
      </g>
    ),
  },
  wizard: {
    label: 'Wizard hat',
    clip: below(62),
    front: (p) => (
      <g>
        <ellipse cx={100} cy={62} rx={56} ry={11} fill={p.hat} {...outline} />
        <path
          d="M66 61 C72 46 84 28 96 16 C103 9 116 5 127 11 C119 15 113 23 111 33 L135 61 C120 66 80 66 66 61 Z"
          fill={p.hat}
          {...outline}
        />
        <path d="M67.5 56 C84 60 118 60 133 56" {...line(p.hatShade, 5)} />
        <path
          d={starPath(90, 42, 6.5)}
          fill="#fcd34d"
          stroke={INK}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <path
          d={starPath(112, 46, 4)}
          fill="#fcd34d"
          stroke={INK}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
        <circle cx={104} cy={26} r={2} fill="#fcd34d" />
      </g>
    ),
  },
  cowboy: {
    label: 'Cowboy hat',
    clip: below(72),
    front: (p) => (
      <g>
        <path
          d="M62 70 C60 44 66 28 82 30 C90 31 94 37 100 37 C106 37 110 31 118 30 C134 28 140 44 138 70 Z"
          fill={p.hat}
          {...outline}
        />
        <path
          d="M61.5 57 C80 61 120 61 138.5 57 L138.2 67 C120 71 80 71 61.8 67 Z"
          fill={p.hatShade}
        />
        <path
          d="M20 64 C30 74 60 72 100 72 C140 72 170 74 180 64 C180 80 150 92 100 90 C50 92 20 80 20 64 Z"
          fill={p.hat}
          {...outline}
        />
        <path d="M34 74 C60 80 140 80 166 74" {...line(p.hatShade, 2.4)} />
      </g>
    ),
  },
  straw: {
    label: 'Sun hat',
    clip: below(66),
    front: (p) => (
      <g>
        <ellipse cx={100} cy={65} rx={70} ry={14} fill={STRAW} {...outline} />
        <ellipse
          cx={100}
          cy={66}
          rx={56}
          ry={9}
          {...line(mix(STRAW, INK, 0.28), 2)}
          strokeDasharray="3 4"
        />
        <path
          d="M63 64 C61 38 77 28 100 28 C123 28 139 38 137 64 C120 68 80 68 63 64 Z"
          fill={STRAW}
          {...outline}
        />
        <path d="M62.6 51 C80 55 120 55 137.4 51 L137.1 61 C120 65 80 65 62.9 61 Z" fill={p.hat} />
        {flower(126, 56, '#ffffff', 6.4)}
      </g>
    ),
  },
  bow: {
    label: 'Big bow',
    front: (p) => (
      <g fill={p.hat} stroke={INK} strokeWidth={DW} strokeLinejoin="round">
        <path d="M130 50 L123 68 L131 64 L135 55 Z" />
        <path d="M138 50 L147 67 L139 64 L135 55 Z" />
        <path d="M134 46 C120 28 101 33 106 48 C109 59 124 55 134 46 Z" />
        <path d="M134 46 C148 28 167 33 162 48 C159 59 144 55 134 46 Z" />
        <rect x={128} y={40} width={12} height={12} rx={4} fill={p.hatShade} />
      </g>
    ),
  },
  clips: {
    label: 'Hair clips',
    front: (p) => (
      <g stroke={INK} strokeWidth={2.4} strokeLinejoin="round">
        <path d={starPath(66, 63, 8, 0.5)} fill={p.hat} transform="rotate(-14 66 63)" />
        <path d={starPath(82, 53, 7, 0.5)} fill={p.hatTint} transform="rotate(10 82 53)" />
      </g>
    ),
  },
  headphones: {
    label: 'Headphones',
    front: (p) => {
      const cup = (
        <g>
          <rect
            x={33}
            y={86}
            width={20}
            height={38}
            rx={9}
            fill={p.hat}
            {...outline}
            strokeWidth={DW}
          />
          <rect
            x={47}
            y={91}
            width={10}
            height={28}
            rx={4.5}
            fill={p.hatShade}
            stroke={INK}
            strokeWidth={3}
          />
        </g>
      );
      return (
        <g>
          <path d="M44 92 C40 48 68 29 100 29 C132 29 160 48 156 92" {...line(INK, 13)} />
          <path d="M44 92 C40 48 68 29 100 29 C132 29 160 48 156 92" {...line(p.hat, 6.5)} />
          {cup}
          <g transform={MIRROR}>{cup}</g>
        </g>
      );
    },
  },
  frog: {
    label: 'Frog hat',
    clip: below(70),
    front: () => {
      const eye = (x: number) => (
        <g key={x}>
          <circle cx={x} cy={30} r={7} fill="#fff" />
          <circle cx={x + 1} cy={31} r={3.6} fill={INK} />
          <circle cx={x + 2.2} cy={29.4} r={1.2} fill="#fff" />
        </g>
      );
      return (
        <g>
          <circle cx={76} cy={32} r={12.5} fill={FROG} {...outline} strokeWidth={DW} />
          <circle cx={124} cy={32} r={12.5} fill={FROG} {...outline} strokeWidth={DW} />
          <path
            d="M44 74 C42 40 66 27 100 27 C134 27 158 40 156 74 C140 80 60 80 44 74 Z"
            fill={FROG}
            {...outline}
          />
          <path
            d="M76 32 m-12.5 0 a12.5 12.5 0 0 1 25 0 M124 32 m-12.5 0 a12.5 12.5 0 0 1 25 0"
            fill={FROG}
          />
          {eye(76)}
          {eye(124)}
          <path d="M84 60 Q100 69 116 60" {...line(INK, 3.2)} />
          <ellipse cx={66} cy={60} rx={6} ry={3.6} fill="#f9a8c4" opacity={0.8} />
          <ellipse cx={134} cy={60} rx={6} ry={3.6} fill="#f9a8c4" opacity={0.8} />
        </g>
      );
    },
  },
  halo: {
    label: 'Halo',
    front: () => (
      <g>
        <ellipse cx={100} cy={22} rx={31} ry={8.5} {...line(INK, 10.5)} />
        <ellipse cx={100} cy={22} rx={31} ry={8.5} {...line('#fcd34d', 5)} />
      </g>
    ),
  },
  horns: {
    label: 'Horns',
    front: (p) => {
      const horn = (
        <path
          d="M68 54 C61 42 61 30 68 18 C71 31 78 40 87 47 Z"
          fill={p.hat}
          {...outline}
          strokeWidth={DW}
        />
      );
      return (
        <g>
          {horn}
          <g transform={MIRROR}>{horn}</g>
        </g>
      );
    },
  },
  santa: {
    label: 'Santa hat',
    clip: below(70),
    front: () => (
      <g>
        <path
          d="M46 70 C44 38 70 23 104 25 C134 27 157 44 163 82 L151 84 C147 72 142 66 137 69 Z"
          fill={SANTA}
          {...outline}
        />
        <path d="M80 30 Q100 26 120 32" {...line(mix(SANTA, '#ffffff', 0.35), 3.2)} />
        <rect x={39} y={58} width={122} height={19} rx={9.5} fill="#fff" {...outline} />
        <circle cx={157} cy={87} r={9.5} fill="#fff" {...outline} />
      </g>
    ),
  },
  knit: {
    label: 'Knit beanie',
    clip: below(72),
    front: (p) => (
      <g>
        <path d="M44 74 C41 38 66 21 100 21 C134 21 159 38 156 74 Z" fill={p.hat} {...outline} />
        <path
          d="M72 30 Q66 48 66 64 M86 25 Q83 45 83 64 M100 23 V64 M114 25 Q117 45 117 64 M128 30 Q134 48 134 64"
          {...line(p.hatShade, 2.4)}
        />
        <rect x={38} y={59} width={124} height={19} rx={9.5} fill={p.hat} {...outline} />
        {ribs(47, 153, 64, 73, 6.5, p.hatShade)}
      </g>
    ),
  },
  headband: {
    label: 'Headband',
    front: (p) => (
      <g>
        <path d="M49 82 C47 46 71 34 100 34 C129 34 153 46 151 82" {...line(INK, 11)} />
        <path d="M49 82 C47 46 71 34 100 34 C129 34 153 46 151 82" {...line(p.hat, 6)} />
      </g>
    ),
  },
  'mini-beret': {
    label: 'Mini beret',
    front: (p) => (
      <g transform="rotate(14 124 38)">
        <path d="M124 29 L125.5 22" {...line(INK, 4.4)} />
        <path
          d="M106 41 C104 32 113 26 125 26.5 C137 27 145 33 142 41 C139 47 113 48 106 41 Z"
          fill={p.hat}
          {...outline}
        />
        <path d="M113 33 Q120 29.5 128 30" {...line(p.hatTint, 2.6)} opacity={0.8} />
      </g>
    ),
  },
} as const satisfies Record<string, HatItem>;
