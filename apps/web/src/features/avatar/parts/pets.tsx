import type { ReactNode } from 'react';
import { INK, type Item } from '../art';

/**
 * Little friends peeking over the left shoulder. Each is drawn around (47, 152) with its paws on
 * the shoulder line, then tilted to follow the slope of the shoulder.
 */

const soft = {
  stroke: INK,
  strokeWidth: 4,
  strokeLinejoin: 'round',
  strokeLinecap: 'round',
} as const;
const thin = (color = INK, width = 2.2) =>
  ({
    fill: 'none',
    stroke: color,
    strokeWidth: width,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }) as const;

const BLUSH = '#ff9fb2';

/** Scaled up a little from the drawing, nudged inwards, and tilted to sit on the shoulder. */
const onShoulder = (children: ReactNode, tilt = -14) => (
  <g transform={`translate(52 167) rotate(${tilt}) scale(1.32) translate(-47 -166)`}>{children}</g>
);

const eyes = (y = 151, gap = 6.5) => (
  <g fill={INK}>
    <circle cx={47 - gap} cy={y} r={2.3} />
    <circle cx={47 + gap} cy={y} r={2.3} />
    <circle cx={47 - gap + 0.8} cy={y - 0.9} r={0.8} fill="#fff" />
    <circle cx={47 + gap + 0.8} cy={y - 0.9} r={0.8} fill="#fff" />
  </g>
);

const cheeks = (y = 156, gap = 10) => (
  <g fill={BLUSH} opacity={0.85}>
    <ellipse cx={47 - gap} cy={y} rx={3} ry={1.9} />
    <ellipse cx={47 + gap} cy={y} rx={3} ry={1.9} />
  </g>
);

const paws = (fill: string) => (
  <g fill={fill} {...soft} strokeWidth={3}>
    <ellipse cx={38} cy={167} rx={5.4} ry={4} />
    <ellipse cx={56} cy={167} rx={5.4} ry={4} />
  </g>
);

const CAT = '#f6a75e';
const DOG = '#e9b47c';
const DOG_EAR = '#94603a';
const CHICK = '#fde047';
const FROG = '#7cc977';
const HAMSTER = '#efb065';
const BEAR = '#a7744b';
const CREAM = '#fff4e2';

export const PETS = {
  none: { label: 'None' },
  cat: {
    label: 'Cat',
    front: () =>
      onShoulder(
        <g>
          <path
            d="M32 153 C32 143 34 136 35 128.5 L43.5 136.5 C46 136 48 136 50.5 136.5 L59 128.5 C60 136 62 143 62 153 C62 162 55 167.5 47 167.5 C39 167.5 32 162 32 153 Z"
            fill={CAT}
            {...soft}
          />
          <path d="M37 133 L41.5 137.5 M57 133 L52.5 137.5" {...thin('#f9a8c4', 2.6)} />
          <path
            d="M47 138.5 V143 M42.5 139.5 L43.5 143 M51.5 139.5 L50.5 143"
            {...thin('#d97b2b', 2)}
          />
          {eyes(151)}
          {cheeks(156.5)}
          <path
            d="M45.6 154.4 H48.4 L47 156 Z"
            fill="#f472b6"
            stroke="#f472b6"
            strokeWidth={1}
            strokeLinejoin="round"
          />
          <path d="M43.5 157.5 Q45.3 159.8 47 157.8 Q48.7 159.8 50.5 157.5" {...thin()} />
          {paws(CAT)}
        </g>,
      ),
  },
  puppy: {
    label: 'Puppy',
    front: () =>
      onShoulder(
        <g>
          <circle cx={47} cy={152} r={15} fill={DOG} {...soft} />
          <ellipse
            cx={33.5}
            cy={150}
            rx={5.6}
            ry={11}
            transform="rotate(16 33.5 150)"
            fill={DOG_EAR}
            {...soft}
          />
          <ellipse
            cx={60.5}
            cy={150}
            rx={5.6}
            ry={11}
            transform="rotate(-16 60.5 150)"
            fill={DOG_EAR}
            {...soft}
          />
          <ellipse cx={47} cy={158} rx={8.5} ry={6.2} fill={CREAM} />
          {eyes(149, 6.2)}
          <ellipse cx={47} cy={155.2} rx={3.2} ry={2.3} fill={INK} />
          <path d="M44 158.5 Q47 161 50 158.5" {...thin()} />
          <path d="M46 160 Q47 164 48.5 160 Z" fill="#f472b6" stroke={INK} strokeWidth={1.4} />
          {paws(DOG)}
        </g>,
      ),
  },
  chick: {
    label: 'Chick',
    front: () =>
      onShoulder(
        <g>
          <path d="M44.5 139.5 Q45 133 49 136 Q49.5 132 52.5 136" {...thin(INK, 2.6)} />
          <circle cx={47} cy={154} r={14} fill={CHICK} {...soft} />
          <path d="M57 154 Q63 156 59.5 162" {...thin(INK, 2.6)} fill={CHICK} />
          {eyes(151, 5.8)}
          {cheeks(156, 9)}
          <path
            d="M44 155 L47 152.8 L50 155 L47 158 Z"
            fill="#fb923c"
            stroke={INK}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
          <path
            d="M41 167.5 L40 171 M44 168 L44 171.5 M50 168 L50 171.5 M53 167.5 L54 171"
            {...thin('#f97316', 2.2)}
          />
        </g>,
      ),
  },
  bunny: {
    label: 'Bunny',
    front: () =>
      onShoulder(
        <g>
          <ellipse
            cx={40.5}
            cy={133}
            rx={4.8}
            ry={12}
            transform="rotate(-8 40.5 133)"
            fill="#ffffff"
            {...soft}
          />
          <ellipse
            cx={53.5}
            cy={133}
            rx={4.8}
            ry={12}
            transform="rotate(8 53.5 133)"
            fill="#ffffff"
            {...soft}
          />
          <ellipse
            cx={40.5}
            cy={134}
            rx={1.9}
            ry={7.5}
            transform="rotate(-8 40.5 134)"
            fill="#f9a8c4"
          />
          <ellipse
            cx={53.5}
            cy={134}
            rx={1.9}
            ry={7.5}
            transform="rotate(8 53.5 134)"
            fill="#f9a8c4"
          />
          <ellipse cx={47} cy={154} rx={14.5} ry={13} fill="#ffffff" {...soft} />
          {eyes(152, 6)}
          {cheeks(157, 9.5)}
          <path
            d="M45.4 155.2 H48.6 L47 157 Z"
            fill="#f472b6"
            stroke="#f472b6"
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
          <path d="M44.6 158.8 Q47 160.6 49.4 158.8" {...thin()} />
          {paws('#ffffff')}
        </g>,
      ),
  },
  frog: {
    label: 'Frog',
    front: () =>
      onShoulder(
        <g>
          <circle cx={39} cy={145} r={6.5} fill={FROG} {...soft} />
          <circle cx={55} cy={145} r={6.5} fill={FROG} {...soft} />
          <ellipse cx={47} cy={157} rx={16} ry={11} fill={FROG} {...soft} />
          <path d="M32.5 145 a6.5 6.5 0 0 1 13 0 M48.5 145 a6.5 6.5 0 0 1 13 0" fill={FROG} />
          <circle cx={39} cy={144.5} r={3.6} fill="#fff" />
          <circle cx={55} cy={144.5} r={3.6} fill="#fff" />
          <circle cx={39.5} cy={145} r={2} fill={INK} />
          <circle cx={55.5} cy={145} r={2} fill={INK} />
          <path d="M38 156 Q47 163 56 156" {...thin(INK, 2.4)} />
          {cheeks(157, 12)}
          {paws(FROG)}
        </g>,
      ),
  },
  ghost: {
    label: 'Ghost',
    front: () =>
      onShoulder(
        <g>
          <path
            d="M33 162 V146 C33 137 39 131.5 47 131.5 C55 131.5 61 137 61 146 V162 Q57.5 157.5 54 162 Q50.5 157.5 47 162 Q43.5 157.5 40 162 Q36.5 157.5 33 162 Z"
            fill="#fafafa"
            {...soft}
          />
          <path d="M61 150 Q66 149 66.5 144" fill="none" {...soft} strokeWidth={3} />
          <g fill={INK}>
            <ellipse cx={42} cy={145} rx={2.2} ry={2.8} />
            <ellipse cx={52} cy={145} rx={2.2} ry={2.8} />
          </g>
          {cheeks(150, 8.5)}
          <ellipse cx={47} cy={151} rx={2} ry={2.4} fill="#6b2433" />
        </g>,
        -8,
      ),
  },
  hamster: {
    label: 'Hamster',
    front: () =>
      onShoulder(
        <g>
          <circle cx={37} cy={142} r={5} fill={HAMSTER} {...soft} />
          <circle cx={57} cy={142} r={5} fill={HAMSTER} {...soft} />
          <circle cx={37} cy={142} r={2.2} fill="#f9a8c4" />
          <circle cx={57} cy={142} r={2.2} fill="#f9a8c4" />
          <ellipse cx={47} cy={155} rx={16} ry={13.5} fill={HAMSTER} {...soft} />
          <path
            d="M33.5 160 C36 152 42 151 47 154 C52 151 58 152 60.5 160 C57 166.5 37 166.5 33.5 160 Z"
            fill={CREAM}
          />
          {eyes(151, 6.4)}
          {cheeks(158, 10.5)}
          <circle cx={47} cy={155.6} r={1.4} fill="#f472b6" />
          <ellipse
            cx={47}
            cy={165.5}
            rx={2.6}
            ry={3.6}
            fill="#a16207"
            stroke={INK}
            strokeWidth={1.6}
          />
          {paws(HAMSTER)}
        </g>,
      ),
  },
  bear: {
    label: 'Bear',
    front: () =>
      onShoulder(
        <g>
          <circle cx={35.5} cy={141} r={5.6} fill={BEAR} {...soft} />
          <circle cx={58.5} cy={141} r={5.6} fill={BEAR} {...soft} />
          <circle cx={35.5} cy={141} r={2.6} fill="#e8c39e" />
          <circle cx={58.5} cy={141} r={2.6} fill="#e8c39e" />
          <circle cx={47} cy={153} r={14.5} fill={BEAR} {...soft} />
          <ellipse cx={47} cy={158.5} rx={7.4} ry={5.4} fill="#e8c39e" />
          {eyes(150, 6.2)}
          <ellipse cx={47} cy={156} rx={2.8} ry={2} fill={INK} />
          <path d="M44.6 159.6 Q47 161.4 49.4 159.6" {...thin()} />
          {paws(BEAR)}
        </g>,
      ),
  },
} as const satisfies Record<string, Item>;
