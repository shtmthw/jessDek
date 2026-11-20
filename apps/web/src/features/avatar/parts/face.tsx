import type { ReactNode } from 'react';
import { detail, heartPath, INK, MIRROR, outline, starPath, type Item, type Paint } from '../art';
import { mix } from '../color';

// ---------------------------------------------------------------------------------------------
// Head shapes. Every shape shares the same crown and temples (y ≤ 98), so any hair fits any
// face; they differ only in the cheeks and chin.
// ---------------------------------------------------------------------------------------------

const CROWN = 'M50 98 C50 63 70 49 100 49 C130 49 150 63 150 98';

export const FACES = {
  soft: { label: 'Soft', d: `${CROWN} C150 129 129 147 100 147 C71 147 50 129 50 98 Z` },
  round: { label: 'Round', d: `${CROWN} C151 134 126 150 100 150 C74 150 49 134 50 98 Z` },
  chubby: {
    label: 'Chubby',
    d: `${CROWN} C152 117 152 132 140 140 C129 147 114 148 100 148 C86 148 71 147 60 140 C48 132 48 117 50 98 Z`,
  },
  oval: { label: 'Oval', d: `${CROWN} C150 124 133 153 100 153 C67 153 50 124 50 98 Z` },
  heart: {
    label: 'Heart',
    d: `${CROWN} C150 120 128 143 104 150 C101.5 150.8 98.5 150.8 96 150 C72 143 50 120 50 98 Z`,
  },
  /** Full cheeks into a small soft chin: the specials' face. */
  mochi: {
    label: 'Mochi',
    d: `${CROWN} C151 119 143 136 127 145 C118 149.5 108 151 100 151 C92 151 82 149.5 73 145 C57 136 49 119 50 98 Z`,
  },
} as const satisfies Record<string, { label: string; d: string }>;

export type FaceId = keyof typeof FACES;

export function Ears({ p }: { p: Paint }) {
  const ear = (
    <>
      <circle cx={52} cy={106} r={12.5} fill={p.skin} {...outline} />
      <path
        d="M50.5 100.5 C45.5 102.5 45 110 50.5 112"
        {...detail}
        stroke={p.skinShade}
        strokeWidth={3.4}
      />
    </>
  );
  return (
    <g>
      {ear}
      <g transform={MIRROR}>{ear}</g>
    </g>
  );
}

/**
 * Body build. Both have the same slender neck (the specials' one); the slim build's shoulders are a
 * little narrower.
 */
export const BUILDS = {
  classic: { label: 'Classic' },
  slim: { label: 'Slim' },
} as const satisfies Record<string, { label: string }>;

/**
 * Where the shoulders sit: lowered under the long neck (AvatarFigure moves the clothes, necklaces
 * and pets with them, and the whole figure up a little so they stay in frame).
 */
export const CLASSIC_BODY = 'translate(0 17)';
/** The slim build's shoulders: lowered the same way, and a little narrower. */
export const SLIM_BODY = 'translate(100 17) scale(0.92 1) translate(-100 0)';
export const bodyOf = (slim: boolean) => (slim ? SLIM_BODY : CLASSIC_BODY);

/**
 * For things that hug the neck (chokers), which are drawn in the body's coordinates: the classic
 * body isn't narrowed, so this narrows them to the neck as the slim body does.
 */
export const NECK_HUG = 'translate(100 0) scale(0.92 1) translate(-100 0)';

/**
 * The neck: slender, flaring out into the (lowered) shoulders. The flare ends where the build's
 * neckline starts, so the neck meets the collar on both; the bottom hides under the top.
 */
export function Neck({ p, slim }: { p: Paint; slim?: boolean }) {
  // The crew neckline's corners (x 85 and 115 in body coordinates), where the body puts them.
  const [l, r] = slim ? [86.5, 113.5] : [85, 115];
  return (
    <g>
      <path
        d={`M91.5 124 C91.5 145 91 158 ${l} 170 L${l} 184 L${r} 184 L${r} 170 C109 158 108.5 145 108.5 124 Z`}
        fill={p.skin}
        {...outline}
      />
      {/* The shadow the chin casts. */}
      <path
        d="M92 147 C96 155.5 104 155.5 108 147 V156 C104 160 96 160 92 156 Z"
        fill={p.skinShade}
        opacity={0.75}
      />
    </g>
  );
}

export function Head({ p, face }: { p: Paint; face: FaceId }) {
  return <path d={FACES[face].d} fill={p.skin} {...outline} />;
}

// ---------------------------------------------------------------------------------------------
// Eyes. Centres at (76, 101) and (124, 101).
// ---------------------------------------------------------------------------------------------

const EY = 101;
const EXL = 76;

/** Draw one eye at the left position; `both` mirrors it to the right. */
const both = (one: (cx: number) => ReactNode) => (
  <g>
    {one(EXL)}
    <g transform={MIRROR}>{one(EXL)}</g>
  </g>
);

/** Same eye on both sides, highlights still on the same side (light comes from the upper right). */
const pair = (one: (cx: number) => ReactNode) => (
  <g>
    {one(EXL)}
    {one(200 - EXL)}
  </g>
);

const dot = (p: Paint, cx: number, rx = 7.2, ry = 8) => (
  <g key={cx}>
    <ellipse
      cx={cx}
      cy={EY}
      rx={rx}
      ry={ry}
      fill={p.eye}
      stroke={INK}
      strokeWidth={p.eye === INK ? 0 : 1.6}
    />
    <circle cx={cx + rx * 0.36} cy={EY - ry * 0.38} r={rx * 0.34} fill="#fff" />
  </g>
);

const happyArc = (cx: number) => (
  <path key={cx} d={`M${cx - 7.5} ${EY + 3} Q${cx} ${EY - 8} ${cx + 7.5} ${EY + 3}`} {...detail} />
);

/** The specials' eye: a tall glossy oval, slightly low, with two highlights. */
const doeIris = (p: Paint, cx: number) => (
  <g key={`iris${cx}`}>
    <ellipse
      cx={cx}
      cy={EY + 2.5}
      rx={7.6}
      ry={10}
      fill={p.eye}
      stroke={INK}
      strokeWidth={p.eye === INK ? 0 : 1.6}
    />
    <circle cx={cx + 2.6} cy={EY - 0.6} r={2.2} fill="#fff" />
    <circle cx={cx - 2.6} cy={EY + 7.4} r={1.1} fill="#fff" opacity={0.85} />
  </g>
);

/**
 * A soft upper lid hugging the top of a doe eye (it sits on the iris, as in the reference), drawn
 * for the left eye: the outer corner is on the left, where the lashes flick up and out.
 */
const doeLid = (cx: number, lash: boolean) => (
  <g key={`lid${cx}`}>
    <path
      d={`M${cx - 10.5} ${EY - 1} C${cx - 8.5} ${EY - 8.5} ${cx + 4} ${EY - 10.5} ${cx + 9.5} ${EY - 4.5}`}
      {...detail}
    />
    {lash ? (
      <path
        d={`M${cx - 9.8} ${EY - 3.2} L${cx - 14.2} ${EY - 5.4} M${cx - 8.2} ${EY - 6.2} L${cx - 11.8} ${EY - 10}`}
        {...detail}
        strokeWidth={3}
      />
    ) : null}
  </g>
);

export const EYES = {
  dot: { label: 'Classic', front: (p) => pair((cx) => dot(p, cx)) },
  sparkle: {
    label: 'Sparkly',
    front: (p) =>
      pair((cx) => (
        <g key={cx}>
          <ellipse
            cx={cx}
            cy={EY}
            rx={8.6}
            ry={9.8}
            fill={p.eye}
            stroke={INK}
            strokeWidth={p.eye === INK ? 0 : 1.6}
          />
          <circle cx={cx + 3} cy={EY - 3.8} r={3.4} fill="#fff" />
          <circle cx={cx - 3.2} cy={EY + 4.2} r={1.6} fill="#fff" />
        </g>
      )),
  },
  happy: { label: 'Happy', front: () => pair(happyArc) },
  sleepy: {
    label: 'Sleepy',
    front: () =>
      pair((cx) => (
        <path key={cx} d={`M${cx - 7.5} ${EY} Q${cx} ${EY + 7} ${cx + 7.5} ${EY}`} {...detail} />
      )),
  },
  wink: {
    label: 'Wink',
    front: (p) => (
      <g>
        {dot(p, EXL)}
        {happyArc(200 - EXL)}
      </g>
    ),
  },
  lashes: {
    label: 'Lashes',
    front: (p) =>
      both((cx) => (
        <g key={cx}>
          {dot(p, cx)}
          <path
            d={`M${cx - 5.6} ${EY - 5.4} L${cx - 9.6} ${EY - 9} M${cx - 7.4} ${EY - 1.6} L${cx - 12} ${EY - 3.4}`}
            {...detail}
            strokeWidth={2.8}
          />
        </g>
      )),
  },
  round: {
    label: 'Round',
    front: (p) =>
      pair((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={EY} r={9.6} fill="#fff" stroke={INK} strokeWidth={3.4} />
          <circle cx={cx} cy={EY + 1.2} r={6.2} fill={p.eye === INK ? '#4a3a33' : p.eye} />
          <circle cx={cx} cy={EY + 1.2} r={3.2} fill={INK} />
          <circle cx={cx + 2.4} cy={EY - 1.6} r={1.8} fill="#fff" />
        </g>
      )),
  },
  wide: {
    label: 'Surprised',
    front: () =>
      pair((cx) => (
        <g key={cx}>
          <ellipse cx={cx} cy={EY} rx={9} ry={10.4} fill="#fff" stroke={INK} strokeWidth={3.4} />
          <circle cx={cx} cy={EY + 0.5} r={3.4} fill={INK} />
        </g>
      )),
  },
  star: {
    label: 'Starry',
    front: (p) =>
      pair((cx) => (
        <path
          key={cx}
          d={starPath(cx, EY, 10)}
          fill={p.eye === INK ? '#fbbf24' : p.eye}
          stroke={INK}
          strokeWidth={2.6}
          strokeLinejoin="round"
        />
      )),
  },
  heart: {
    label: 'Hearts',
    front: () =>
      pair((cx) => (
        <g key={cx}>
          <path
            d={heartPath(cx, EY, 9.4)}
            fill="#f43f5e"
            stroke={INK}
            strokeWidth={2.6}
            strokeLinejoin="round"
          />
          <circle cx={cx + 4.2} cy={EY - 4.6} r={1.8} fill="#fff" />
        </g>
      )),
  },
  cool: {
    label: 'Unbothered',
    front: (p) =>
      pair((cx) => (
        <g key={cx}>
          <path d={`M${cx - 7.6} ${EY - 1} A7.6 7.6 0 0 0 ${cx + 7.6} ${EY - 1} Z`} fill={p.eye} />
          <path d={`M${cx - 9.5} ${EY - 1.6} L${cx + 9.5} ${EY - 1.6}`} {...detail} />
          <circle cx={cx + 3} cy={EY + 2.2} r={1.9} fill="#fff" />
        </g>
      )),
  },
  dizzy: {
    label: 'Dizzy',
    front: () =>
      pair((cx) => (
        <path
          key={cx}
          d={`M${cx} ${EY} m-0.8 0 a1.6 1.6 0 0 1 3.2 0 a3.2 3.2 0 0 1 -6.4 0 a4.8 4.8 0 0 1 9.6 0 a6.4 6.4 0 0 1 -12.8 0 a8 8 0 0 1 16 0`}
          {...detail}
          strokeWidth={2.8}
        />
      )),
  },
  doe: {
    label: 'Doe',
    front: (p) => (
      <g>
        {pair((cx) => doeIris(p, cx))}
        {both((cx) => doeLid(cx, false))}
      </g>
    ),
  },
  lashy: {
    label: 'Doe lashes',
    front: (p) => (
      <g>
        {pair((cx) => doeIris(p, cx))}
        {both((cx) => doeLid(cx, true))}
      </g>
    ),
  },
  dreamy: {
    label: 'Dreamy',
    front: (p) =>
      pair((cx) => (
        <g key={cx}>
          <path
            d={`M${cx - 7.8} ${EY + 0.5} A7.8 9 0 0 0 ${cx + 7.8} ${EY + 0.5} Z`}
            fill={p.eye}
            stroke={INK}
            strokeWidth={p.eye === INK ? 0 : 1.6}
          />
          <circle cx={cx + 2.8} cy={EY + 3.8} r={2.2} fill="#fff" />
          <path d={`M${cx - 11} ${EY + 1.4} Q${cx} ${EY - 3.8} ${cx + 11} ${EY + 1}`} {...detail} />
        </g>
      )),
  },
  doewink: {
    label: 'Doe wink',
    front: (p) => (
      <g>
        {doeIris(p, EXL)}
        {doeLid(EXL, true)}
        {/* A closed eye pointing at the nose, with a lash: "<". */}
        <path
          d={`M${200 - EXL + 8.5} ${EY - 6.5} L${200 - EXL - 7} ${EY + 2} L${200 - EXL + 8.5} ${EY + 10}`}
          {...detail}
        />
        <path
          d={`M${200 - EXL + 8.5} ${EY - 6.5} L${200 - EXL + 12.5} ${EY - 9.5}`}
          {...detail}
          strokeWidth={3}
        />
      </g>
    ),
  },
} as const satisfies Record<string, Item>;

// ---------------------------------------------------------------------------------------------
// Brows
// ---------------------------------------------------------------------------------------------

const brow =
  (d: (cx: number) => string, width = 4) =>
  (p: Paint) =>
    both((cx) => <path key={cx} d={d(cx)} {...detail} stroke={p.brow} strokeWidth={width} />);

export const BROWS = {
  none: { label: 'None' },
  soft: { label: 'Soft', front: brow((x) => `M${x - 8} 87 Q${x} 81 ${x + 8} 86`, 3.6) },
  thick: { label: 'Thick', front: brow((x) => `M${x - 8} 86.5 Q${x - 1} 80.5 ${x + 8.5} 85`, 6.4) },
  straight: { label: 'Straight', front: brow((x) => `M${x - 8} 85.5 L${x + 8} 84.5`, 4.2) },
  raised: { label: 'Raised', front: brow((x) => `M${x - 8} 83 Q${x} 74.5 ${x + 8} 82`, 3.8) },
  cross: { label: 'Fierce', front: brow((x) => `M${x - 8} 81.5 L${x + 8.5} 87.5`, 4.6) },
  worried: { label: 'Worried', front: brow((x) => `M${x - 8} 87 L${x + 8} 81`, 4) },
} as const satisfies Record<string, Item>;

// ---------------------------------------------------------------------------------------------
// Nose
// ---------------------------------------------------------------------------------------------

export const NOSES = {
  curve: {
    label: 'Curve',
    front: () => <path d="M95 110.5 Q100 115.5 105 110.5" {...detail} strokeWidth={3.8} />,
  },
  button: {
    label: 'Button',
    front: (p) => (
      <ellipse cx={100} cy={111} rx={4.6} ry={3.4} fill={mix(p.skinShade, '#c2410c', 0.12)} />
    ),
  },
  dots: {
    label: 'Nostrils',
    front: () => (
      <g fill={INK}>
        <ellipse cx={96.6} cy={112} rx={1.6} ry={1.3} />
        <ellipse cx={103.4} cy={112} rx={1.6} ry={1.3} />
      </g>
    ),
  },
  tick: {
    label: 'Profile',
    front: () => <path d="M101.5 103 L97 112.5 L102.5 113.5" {...detail} strokeWidth={3.4} />,
  },
  none: { label: 'None' },
} as const satisfies Record<string, Item>;

// ---------------------------------------------------------------------------------------------
// Mouth. Centred on x 100, around y 122.
// ---------------------------------------------------------------------------------------------

const MOUTH_INSIDE = '#6b2433';
const TONGUE = '#f27b8a';

const openMouth = (d: string, extra?: ReactNode) => (
  <g>
    <path d={d} fill={MOUTH_INSIDE} />
    {extra}
    <path d={d} {...detail} strokeWidth={3.8} />
  </g>
);

export const MOUTHS = {
  smile: { label: 'Smile', front: () => <path d="M86.5 119 Q100 131.5 113.5 119" {...detail} /> },
  small: {
    label: 'Little smile',
    front: () => <path d="M93 121 Q100 126.5 107 121" {...detail} />,
  },
  grin: {
    label: 'Grin',
    front: () =>
      openMouth(
        'M86 118.5 Q100 120 114 118.5 Q112.5 134 100 134 Q87.5 134 86 118.5 Z',
        <path d="M91 130 Q100 123.5 109 130 Q105.5 134 100 134 Q94.5 134 91 130 Z" fill={TONGUE} />,
      ),
  },
  teeth: {
    label: 'Toothy',
    front: () =>
      openMouth(
        'M85.5 118.5 Q100 120 114.5 118.5 Q113 134 100 134 Q87 134 85.5 118.5 Z',
        <path d="M86.4 119.6 Q100 121 113.6 119.6 L113 124.5 Q100 126 87 124.5 Z" fill="#fff" />,
      ),
  },
  tongue: {
    label: 'Cheeky',
    front: () => (
      <g>
        <path
          d="M95 123.5 V128 Q95 134 100.5 134 Q106 134 106 128 V123.5"
          fill={TONGUE}
          stroke={INK}
          strokeWidth={3}
          strokeLinejoin="round"
        />
        <path
          d="M100.5 125.5 V130"
          stroke={mix(TONGUE, INK, 0.3)}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
        <path d="M86.5 119 Q100 130 113.5 119" {...detail} />
      </g>
    ),
  },
  cat: {
    label: 'Cat',
    front: () => <path d="M88 119.5 Q94 127 100 120 Q106 127 112 119.5" {...detail} />,
  },
  fang: {
    label: 'Fang',
    front: () => (
      <g>
        <path
          d="M103.6 124.2 L106.6 130 L109.4 123.4 Z"
          fill="#fff"
          stroke={INK}
          strokeWidth={2.4}
          strokeLinejoin="round"
        />
        <path d="M86.5 119 Q100 130.5 113.5 119" {...detail} />
      </g>
    ),
  },
  laugh: {
    label: 'Laugh',
    front: () =>
      openMouth(
        'M83 116 L117 116 Q116 139 100 139 Q84 139 83 116 Z',
        <path d="M89 133.5 Q100 125 111 133.5 Q107 139 100 139 Q93 139 89 133.5 Z" fill={TONGUE} />,
      ),
  },
  o: {
    label: 'Ooh',
    front: () => (
      <ellipse
        cx={100}
        cy={124}
        rx={4.8}
        ry={5.8}
        fill={MOUTH_INSIDE}
        stroke={INK}
        strokeWidth={3.6}
      />
    ),
  },
  smirk: { label: 'Smirk', front: () => <path d="M90 123 Q104 127 112.5 117.5" {...detail} /> },
  flat: { label: 'Neutral', front: () => <path d="M92 123 L108 123" {...detail} /> },
  kiss: {
    label: 'Kiss',
    front: () => (
      <path d="M97.5 116.5 Q105.5 119 99 123 Q105.5 127 97.5 129.5" {...detail} strokeWidth={4} />
    ),
  },
  tiny: {
    label: 'Tiny smile',
    front: () => <path d="M96 124.5 Q100 127.8 104 124.5" {...detail} />,
  },
  pip: {
    label: 'Little o',
    front: () => <ellipse cx={100} cy={125} rx={2.3} ry={2.8} fill={INK} />,
  },
} as const satisfies Record<string, Item>;

// ---------------------------------------------------------------------------------------------
// Cheeks and stickers
// ---------------------------------------------------------------------------------------------

const blush = (p: Paint, rx = 8.5, ry = 5.2, opacity = 0.55) => (
  <g fill={p.blush} opacity={opacity}>
    <ellipse cx={69} cy={116} rx={rx} ry={ry} />
    <ellipse cx={131} cy={116} rx={rx} ry={ry} />
  </g>
);

const freckles = (p: Paint) =>
  both((cx) => (
    <g key={cx} fill={mix(p.skin, '#5b2a14', 0.5)}>
      <circle cx={cx - 10} cy={112.5} r={1.8} />
      <circle cx={cx - 4.5} cy={115.5} r={1.8} />
      <circle cx={cx - 11} cy={118.5} r={1.8} />
    </g>
  ));

export const CHEEKS = {
  none: { label: 'None' },
  blush: { label: 'Blush', front: (p) => blush(p) },
  freckles: { label: 'Freckles', front: freckles },
  both: {
    label: 'Blush & freckles',
    front: (p) => (
      <g>
        {blush(p)}
        {freckles(p)}
      </g>
    ),
  },
  faint: {
    label: 'Faint blush',
    front: (p) => (
      <g fill={p.blush} opacity={0.3}>
        <ellipse cx={70} cy={117} rx={10} ry={5.6} />
        <ellipse cx={130} cy={117} rx={10} ry={5.6} />
      </g>
    ),
  },
  rosy: {
    label: 'Rosy',
    front: (p) => (
      <g>
        {blush(p, 9.5, 6, 0.75)}
        {both((cx) => (
          <path
            key={cx}
            d={`M${cx - 12} 119 L${cx - 9} 114 M${cx - 8} 119 L${cx - 5} 114 M${cx - 4} 119 L${cx - 1} 114`}
            stroke={mix(p.blush, INK, 0.35)}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        ))}
      </g>
    ),
  },
} as const satisfies Record<string, Item>;

const sticker = { stroke: INK, strokeWidth: 2.4, strokeLinejoin: 'round' } as const;

export const MARKS = {
  none: { label: 'None' },
  heart: {
    label: 'Heart',
    front: () => <path d={heartPath(128, 121, 6)} fill="#fb7185" {...sticker} />,
  },
  star: {
    label: 'Star',
    front: () => <path d={starPath(128, 120.5, 7.2, 0.5)} fill="#fcd34d" {...sticker} />,
  },
  bandage: {
    label: 'Bandage',
    front: () => (
      <g transform="translate(-5 2) rotate(-24 133 117)">
        <rect x={122} y={113} width={22} height={8.4} rx={4.2} fill="#f6d1ae" {...sticker} />
        <rect x={129.5} y={113.8} width={7} height={6.8} fill="#ecc099" />
        <g fill={mix('#ecc099', INK, 0.35)}>
          <circle cx={131.5} cy={116} r={0.8} />
          <circle cx={134.5} cy={118.5} r={0.8} />
          <circle cx={134.5} cy={116} r={0.8} />
          <circle cx={131.5} cy={118.5} r={0.8} />
        </g>
      </g>
    ),
  },
  mole: { label: 'Beauty mark', front: () => <circle cx={115} cy={128} r={1.8} fill={INK} /> },
  sparkle: {
    label: 'Sparkle',
    front: () => (
      <g fill="#fff" stroke={INK} strokeWidth={2} strokeLinejoin="round">
        <path d="M127 106 Q128 112.5 134 113.5 Q128 114.5 127 121 Q126 114.5 120 113.5 Q126 112.5 127 106 Z" />
        <path d="M135.5 120.5 Q136 123.5 138.5 124 Q136 124.5 135.5 127.5 Q135 124.5 132.5 124 Q135 123.5 135.5 120.5 Z" />
      </g>
    ),
  },
  sweat: {
    label: 'Sweat drop',
    front: () => (
      <path
        d="M131 80 Q126.5 87 126.5 90 A4.5 4.5 0 0 0 135.5 90 Q135.5 87 131 80 Z"
        fill="#93c5fd"
        {...sticker}
      />
    ),
  },
} as const satisfies Record<string, Item>;
