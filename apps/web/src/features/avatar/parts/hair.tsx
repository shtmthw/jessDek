import type { ReactNode } from 'react';
import { INK, MIRROR, outline, SW, type Item, type Paint } from '../art';
import { luminance, mix } from '../color';

/** A soft shine across the crown, so dark hair still reads as a shape. */
const shine = (p: Paint, d = 'M111 45.5 Q125 46.5 133 54') => (
  <path
    d={d}
    fill="none"
    stroke={p.hairShine}
    strokeWidth={3.6}
    strokeLinecap="round"
    opacity={0.85}
  />
);

/** Hair ties: little white bobbles. */
const bobble = (cx: number, cy: number) => (
  <circle cx={cx} cy={cy} r={5.4} fill="#fff" stroke={INK} strokeWidth={3.4} />
);

type Circle = readonly [cx: number, cy: number, r: number];

/**
 * A puffy shape made of overlapping circles with one clean outline around the whole union:
 * stroke every circle at double width, then fill them all again on top to hide the inner lines.
 */
const cloud = (fill: string, circles: readonly Circle[], extra?: ReactNode) => (
  <g>
    <g fill={fill} stroke={INK} strokeWidth={SW * 2} strokeLinejoin="round">
      {circles.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} />
      ))}
    </g>
    <g fill={fill}>
      {circles.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} />
      ))}
      {extra}
    </g>
  </g>
);

/** Circles on an ellipse from angle `a0` to `a1` (degrees, 0 = right, 90 = down). */
const ring = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  a0: number,
  a1: number,
  n: number,
  r: number,
) =>
  Array.from({ length: n }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / (n - 1)) * Math.PI) / 180;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a), r] as const;
  });

/** Pulled back from the face: a smooth high hairline (ponytail, buns). */
const SLICKED =
  'M47.5 99 C45 62 67 41 100 41 C133 41 155 62 152.5 99 L146 99 C144 80 134 68 116 64.5 C106 62.5 94 62.5 84 64.5 C66 68 56 80 54 99 Z';

/** A centre parting that falls to the temples. */
const PARTED =
  'M47 102 C44 62 66 40 100 40 C134 40 156 62 153 102 C152 108 147 109 146 103 C145 84 136 72 120 66 C110 62 104 59 100 52.5 C96 59 90 62 80 66 C64 72 55 84 54 103 C53 109 48 108 47 102 Z';

const parting = (p: Paint) => (
  <path
    d="M100 52.5 Q99 46 96.5 41.5"
    fill="none"
    stroke={p.hairShade}
    strokeWidth={3}
    strokeLinecap="round"
  />
);

/** Fine strands that give a hairstyle its fall: darker on light hair, lighter on dark hair. */
const strands = (p: Paint, d: string, width = 2.4) => (
  <path
    d={d}
    fill="none"
    stroke={luminance(p.hair) > 0.2 ? mix(p.hair, '#3a2a20', 0.24) : mix(p.hair, '#ffffff', 0.13)}
    strokeWidth={width * 0.8}
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

// ---------------------------------------------------------------------------------------------
// The specials' hair kit: fine, softly pointed locks. Hair is built in three layers, so long
// hair tucks behind the ears (which stay visible, with any earrings) and falls in front of the
// shoulders: `back` (crown volume behind the head), `mid` (lengths over the clothes, behind the
// ears and face) and `front` (the cap and fringe).
// ---------------------------------------------------------------------------------------------

/** The crown from the left temple to the right one. A fringe edge closes it back to the left. */
const CAP_TOP = 'M46 96 C44 60 66 40 100 40 C134 40 156 60 154 96';
const cap = (edge: string, top = CAP_TOP) => `${top} ${edge} Z`;

/** Volume behind the head, showing round the crown and behind the ears. */
// It shares the cap's outline over the top (so no second ring shows above the fringe) and tucks
// behind the ears below the temples.
const CROWN_BACK =
  'M46 96 C44 60 66 40 100 40 C134 40 156 60 154 96 C156.5 105 156 113 152 119 L48 119 C44 113 43.5 105 46 96 Z';

/** Both sides from a drawing of the left one. */
const sides = (left: ReactNode) => (
  <g>
    {left}
    <g transform={MIRROR}>{left}</g>
  </g>
);

export const HAIRS = {
  short: {
    label: 'Short',
    front: (p) => (
      <g>
        <path
          d="M50 113 C43 92 43 62 62 48 C76 38 124 38 138 48 C157 62 157 92 150 113 C148.5 119.5 139.5 119.5 139 113 L139 86 C139 77 133 72.5 124 72.5 Q112 77 100 72.5 Q88 77 76 72.5 C67 72.5 61 77 61 86 L61 113 C60.5 119.5 51.5 119.5 50 113 Z"
          fill={p.hair}
          {...outline}
        />
        {shine(p)}
      </g>
    ),
  },
  pigtails: {
    label: 'Pigtails',
    back: (p) => {
      const tail = (
        <g>
          <path
            d="M52 116 C38 118 24 132 19 151 C31 146 45 147 57 141 Z"
            fill={p.hair}
            {...outline}
          />
          {bobble(50, 128)}
        </g>
      );
      return (
        <g>
          {tail}
          <g transform={MIRROR}>{tail}</g>
        </g>
      );
    },
    front: (p) => (
      <g>
        <path
          d="M49 114 C42 90 44 62 62 48 C76 38 124 38 138 48 C156 62 158 90 151 114 C149 118 143 118 142.5 112 C140 86 124 70.5 100 70.5 C76 70.5 60 86 57.5 112 C57 118 51 118 49 114 Z"
          fill={p.hair}
          {...outline}
        />
        {shine(p)}
      </g>
    ),
  },
  buzz: {
    label: 'Buzz',
    front: (p) => (
      <g>
        <path
          d="M47.5 98 C46.5 60 68 44 100 44 C132 44 153.5 60 152.5 98 L146.5 98 C146 80 139 70 126 67 C114 64.5 86 64.5 74 67 C61 70 54 80 53.5 98 Z"
          fill={mix(p.hair, p.skin, 0.28)}
        />
        <path
          d="M47.5 98 C46.5 60 68 44 100 44 C132 44 153.5 60 152.5 98"
          {...outline}
          fill="none"
        />
      </g>
    ),
  },
  bald: {
    label: 'Bald',
    front: (p) => (
      <path
        d="M114 57 Q126 58.5 133 66"
        fill="none"
        stroke={mix(p.skin, '#ffffff', 0.6)}
        strokeWidth={4}
        strokeLinecap="round"
      />
    ),
  },
  'side-part': {
    label: 'Side part',
    front: (p) => (
      <g>
        <path
          d="M50 111 C43 90 43 62 62 47 C76 37 124 37 138 47 C157 62 157 90 150 111 C148.5 117.5 140 117.5 139.5 111 L139 90 C137 79 128 74.5 115 77.5 C99 81 81 77 71.5 64 C69.5 73 65 80 61 87 L61 111 C60.5 117.5 51.5 117.5 50 111 Z"
          fill={p.hair}
          {...outline}
        />
        <path
          d="M71.5 64 Q73.5 53 80 45"
          fill="none"
          stroke={p.hairShade}
          strokeWidth={3}
          strokeLinecap="round"
        />
        {shine(p)}
      </g>
    ),
  },
  spiky: {
    label: 'Spiky',
    front: (p) => (
      <g>
        <path
          d="M49 110 C45 94 44 80 46 69 L36 61 L53 54 L50 38 L68 44 L74 27 L89 39 L100 22 L111 39 L126 27 L132 44 L150 38 L147 54 L164 61 L154 69 C156 80 155 94 151 110 C149.5 116 142 116 141 110 L140.5 88 C140 79 134 74 126 74 L119 82 L111 73.5 L101 83 L91 73.5 L82 82 L74 74 C66 74 60 79 59.5 88 L59 110 C58 116 50.5 116 49 110 Z"
          fill={p.hair}
          {...outline}
        />
        {shine(p, 'M114 44 Q124 45 130 50')}
      </g>
    ),
  },
  curly: {
    label: 'Curly',
    front: (p) =>
      cloud(
        p.hair,
        [
          ...ring(100, 90, 52, 50, 168, 372, 15, 12),
          [66, 74, 11],
          [80, 69, 11],
          [94, 67, 11],
          [108, 67, 11],
          [122, 69, 11],
          [135, 74, 11],
        ],
        <ellipse cx={100} cy={62} rx={46} ry={20} />,
      ),
  },
  afro: {
    label: 'Afro',
    back: (p) =>
      cloud(
        p.hair,
        ring(100, 80, 60, 56, 140, 400, 14, 18),
        <ellipse cx={100} cy={80} rx={62} ry={58} />,
      ),
    front: (p) =>
      cloud(p.hair, [
        [56, 92, 9],
        [58, 79, 10],
        [68, 68, 10],
        [82, 63, 10],
        [96, 61, 10],
        [110, 61, 10],
        [124, 64, 10],
        [137, 70, 10],
        [144, 81, 10],
        [144, 93, 9],
        [100, 50, 14],
        [74, 52, 12],
        [126, 52, 12],
      ]),
  },
  bob: {
    label: 'Bob',
    back: (p) => (
      <path
        d="M42 76 C40 47 67 33 100 33 C133 33 160 47 158 76 C157 98 163 122 156 136 C152 143 144 144 138 140 L62 140 C56 144 48 143 44 136 C37 122 43 98 42 76 Z"
        fill={p.hair}
        {...outline}
      />
    ),
    front: (p) => (
      <g>
        <path
          d="M45.5 100 C43.5 60 66 40 100 40 C134 40 156.5 60 154.5 100 L147 100 C146 92 144.5 85 141 79 L59 79 C55.5 85 54 92 53 100 Z"
          fill={p.hair}
          {...outline}
        />
        {shine(p)}
      </g>
    ),
  },
  long: {
    label: 'Long',
    back: (p) => (
      <path
        d="M41 74 C41 47 67 34 100 34 C133 34 159 47 159 74 L163 170 C163 180 156 186 147 184 L53 184 C44 186 37 180 37 170 Z"
        fill={p.hair}
        {...outline}
      />
    ),
    front: (p) => (
      <g>
        <path
          d="M46 102 C43 62 66 40 100 40 C134 40 157 62 154 102 L147 102 C146 86 140 75 128 72 C112 69 93 76 79 85 C69 91 61 96 54.5 102 Z"
          fill={p.hair}
          {...outline}
        />
        {shine(p)}
      </g>
    ),
  },
  ponytail: {
    label: 'Ponytail',
    back: (p) => (
      <path
        d="M128 44 C146 28 172 34 179 58 C186 82 180 110 166 128 C166 110 162 94 154 82 C148 72 140 62 128 44 Z"
        fill={p.hair}
        {...outline}
      />
    ),
    front: (p) => (
      <g>
        <path d={SLICKED} fill={p.hair} {...outline} />
        <rect
          x={136}
          y={39}
          width={14}
          height={9}
          rx={4.5}
          transform="rotate(38 143 43.5)"
          fill="#fff"
          stroke={INK}
          strokeWidth={3.4}
        />
        {shine(p, 'M104 47 Q117 47 126 53')}
      </g>
    ),
  },
  bun: {
    label: 'Bun',
    back: (p) => (
      <g>
        <circle cx={100} cy={30} r={17} fill={p.hair} {...outline} />
        <path
          d="M92 24 Q100 18 108 25 M90 33 Q100 40 110 32"
          fill="none"
          stroke={p.hairShade}
          strokeWidth={3}
          strokeLinecap="round"
        />
      </g>
    ),
    front: (p) => (
      <g>
        <path d={SLICKED} fill={p.hair} {...outline} />
        {shine(p, 'M104 47 Q117 47 126 53')}
      </g>
    ),
  },
  'space-buns': {
    label: 'Space buns',
    back: (p) => {
      const bun = (
        <g>
          <circle cx={60} cy={44} r={16} fill={p.hair} {...outline} />
          <path
            d="M53 40 Q60 33 67 40"
            fill="none"
            stroke={p.hairShade}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </g>
      );
      return (
        <g>
          {bun}
          <g transform={MIRROR}>{bun}</g>
        </g>
      );
    },
    front: (p) => (
      <g>
        <path d={PARTED} fill={p.hair} {...outline} />
        {parting(p)}
      </g>
    ),
  },
  mohawk: {
    label: 'Mohawk',
    front: (p) => (
      <g>
        <path
          d="M47.5 98 C46.5 60 68 44 100 44 C132 44 153.5 60 152.5 98 L146.5 98 C146 80 139 70 126 67 C114 64.5 86 64.5 74 67 C61 70 54 80 53.5 98 Z"
          fill={mix(p.hair, p.skin, 0.28)}
        />
        <path
          d="M47.5 98 C46.5 60 68 44 100 44 C132 44 153.5 60 152.5 98"
          {...outline}
          fill="none"
        />
        <path
          d="M84 60 C82 46 84 30 88 16 L95 30 L101 11 L107 29 L115 17 C118 32 118 48 116 60 C106 64 94 64 84 60 Z"
          fill={p.hair}
          {...outline}
        />
      </g>
    ),
  },
  wavy: {
    label: 'Wavy',
    back: (p) => (
      <path
        d="M40 74 C40 46 68 33 100 33 C132 33 160 46 160 74 C160 92 168 104 164 120 C160 134 170 146 166 160 C163 172 170 180 165 188 L35 188 C30 180 37 172 34 160 C30 146 40 134 36 120 C32 104 40 92 40 74 Z"
        fill={p.hair}
        {...outline}
      />
    ),
    front: (p) => (
      <g>
        <path
          d="M47 104 C44 62 66 40 100 40 C134 40 156 62 153 104 C150 110 146 104 146 98 C145 84 136 72 120 66 C110 62 104 59 100 52.5 C96 59 90 62 80 66 C64 72 55 84 54 98 C54 104 50 110 47 104 Z"
          fill={p.hair}
          {...outline}
        />
        {parting(p)}
      </g>
    ),
  },
  braids: {
    label: 'Braids',
    back: (p) => (
      <g fill={p.hair} {...outline}>
        <path d="M44 84 L38 128 L56 128 L58 96 Z" />
        <path d="M156 84 L162 128 L144 128 L142 96 Z" />
      </g>
    ),
    front: (p) => {
      const braid = (
        <g fill={p.hair} stroke={INK} strokeWidth={4.4} strokeLinejoin="round">
          {[124, 137, 150, 163].map((y) => (
            <ellipse key={y} cx={46} cy={y} rx={8.5} ry={8.4} />
          ))}
          <rect x={41} y={170} width={10} height={6} rx={2} fill="#fff" />
          <path d="M42 176 L39 186 Q46 190 53 186 L50 176 Z" />
        </g>
      );
      return (
        <g>
          {braid}
          <g transform={MIRROR}>{braid}</g>
          <path d={PARTED} fill={p.hair} {...outline} />
          {parting(p)}
        </g>
      );
    },
  },
  bowl: {
    label: 'Bowl',
    front: (p) => (
      <g>
        <path
          d="M44 102 C40 60 64 38 100 38 C136 38 160 60 156 102 C155.5 107 150.5 108 147 104.5 L141.5 98 L140 83 L60 83 L58.5 98 L53 104.5 C49.5 108 44.5 107 44 102 Z"
          fill={p.hair}
          {...outline}
        />
        <path
          d="M78 83 L79 74 M100 83 L100 73 M122 83 L121 74"
          fill="none"
          stroke={p.hairShade}
          strokeWidth={3}
          strokeLinecap="round"
        />
        {shine(p)}
      </g>
    ),
  },
  curtains: {
    label: 'Curtains',
    back: (p) => (
      <path
        d="M43 76 C41 47 68 35 100 35 C132 35 159 47 157 76 C156 96 160 116 154 128 C150 134 144 135 140 132 L60 132 C56 135 50 134 46 128 C40 116 44 96 43 76 Z"
        fill={p.hair}
        {...outline}
      />
    ),
    front: (p) => (
      <g>
        <path
          d="M46 102 C43 62 66 40 100 40 C134 40 157 62 154 102 C153 109 146 110 145 103 C143 88 132 81 121 75 C111 70 104 63 100 54 C96 63 89 70 79 75 C68 81 57 88 55 103 C54 110 47 109 46 102 Z"
          fill={p.hair}
          {...outline}
        />
        {parting(p)}
      </g>
    ),
  },
  swoop: {
    label: 'Side swoop',
    back: (p) => <path d={CROWN_BACK} fill={p.hair} {...outline} />,
    mid: (p) =>
      sides(
        <path
          d="M41 98 C38 116 39 133 43 146 C49 151 58 149 65 142 L71 118 L63 98 Z"
          fill={p.hair}
          {...outline}
        />,
      ),
    front: (p) => (
      <g>
        <path
          d={cap(
            'C151 98 148 97 146 92 C144 85 140 79 134 75 C127 72 121 72 118 72 C115 86 105 97 92 104 C95 96 96 90 95 84 C82 86 69 91 60 96 C57 98 53 98 50 98 C48 98 47 97 46 96',
          )}
          fill={p.hair}
          {...outline}
        />
        {strands(p, 'M118 76 Q110 90 97 99 M108 47 Q99 62 96 80 M140 56 Q147 68 148 84')}
      </g>
    ),
  },
  curtain: {
    label: 'Straight bob',
    back: (p) => <path d={CROWN_BACK} fill={p.hair} {...outline} />,
    mid: (p) =>
      sides(
        <g>
          <path
            d="M40 98 C37 118 37 136 40 152 L46.5 145 L50 155.5 L56 146 L62 153 C68 143 71 131 71 116 L63 98 Z"
            fill={p.hair}
            {...outline}
          />
          {strands(p, 'M47 112 Q45 128 47 142')}
        </g>,
      ),
    front: (p) => (
      <g>
        <path
          d={cap(
            'C151 98 148 97 146 92 C144 87 141 83 137 81 C137 88 135 94 131 98 C130 90 126 84 120 80 C118 88 113 94 106 97 C109 90 109 83 107 77 C100 85 92 91 82 94 C86 88 87 83 86 79 C78 84 68 90 60 95 C57 97 53 98 50 98 C48 98 47 97 46 96',
          )}
          fill={p.hair}
          {...outline}
        />
      </g>
    ),
  },
  hime: {
    label: 'Blunt bob',
    back: (p) => (
      <path
        d="M46 96 C44 60 66 40 100 40 C134 40 156 60 154 96 C157 112 162 134 158 151 C154 157 146 157 142 151 L58 151 C54 157 46 157 42 151 C38 134 43 112 46 96 Z"
        fill={p.hair}
        {...outline}
      />
    ),
    front: (p) => (
      <g>
        <path
          d={cap(
            'C151 98 148 97 147 93 C146 92 145 91 144 90 L120 90 L117.5 85 L115 90 L86 90 L83.5 85 L81 90 L56 90 C55 91 54 92 53 93 C52 97 48 98 46 96',
          )}
          fill={p.hair}
          {...outline}
        />
        {shine(p)}
      </g>
    ),
  },
  sleek: {
    label: 'Sleek long',
    back: (p) => <path d={CROWN_BACK} fill={p.hair} {...outline} />,
    mid: (p) =>
      sides(
        <g>
          <path
            d="M40 98 C36 130 35 166 37 194 C41 199 46 196 49 200 C53 195 57 199 61 195 C64 199 67 196 67 192 C65 178 66 166 70 156 C73 146 73 132 71 118 L63 98 Z"
            fill={p.hair}
            {...outline}
          />
          {strands(p, 'M46 118 Q43 150 45 186 M57 152 Q56 170 58 188')}
        </g>,
      ),
    front: (p) => (
      <g>
        <path
          d={cap(
            'C150 96 148 90 145 84 C140 73 128 65 114 61 C107 58 102 54 100 49 C98 54 93 58 86 61 C72 65 60 73 55 84 C52 90 50 96 46 96',
          )}
          fill={p.hair}
          {...outline}
        />
        {parting(p)}
      </g>
    ),
  },
  veil: {
    label: 'Long bangs',
    back: (p) => <path d={CROWN_BACK} fill={p.hair} {...outline} />,
    mid: (p) =>
      sides(
        <g>
          <path
            d="M40 98 C36 130 35 166 37 194 C41 199 46 196 49 200 C53 195 57 199 61 195 C64 199 67 196 67 192 C65 178 66 166 70 156 C73 146 73 132 71 118 L63 98 Z"
            fill={p.hair}
            {...outline}
          />
          {strands(p, 'M46 118 Q43 150 45 186 M57 152 Q56 170 58 188')}
        </g>,
      ),
    front: (p) => (
      <g>
        <path
          d={cap(
            'C151 98 149 96 148 92 C146 86 143 81 139 78 C139 86 137 92 133 97 C132 89 129 82 124 77 C121 85 117 91 111 95 C113 85 112 76 109 70 C103 79 95 87 85 93 C89 86 91 80 91 74 C82 81 71 88 61 93 C58 96 54 98 50 98 C48 98 47 97 46 96',
          )}
          fill={p.hair}
          {...outline}
        />
        {strands(p, 'M109 70 Q104 58 104 46 M128 50 Q136 60 138 74')}
      </g>
    ),
  },
  braid: {
    label: 'Side braid',
    back: (p) => <path d={CROWN_BACK} fill={p.hair} {...outline} />,
    mid: (p) => (
      <g>
        {/* Gathered behind the left ear into a braid over the shoulder. */}
        <path d="M42 100 C40 110 43 119 50 123 L61 117 L58 100 Z" fill={p.hair} {...outline} />
        <g fill={p.hair} stroke={INK} strokeWidth={4.4} strokeLinejoin="round">
          {(
            [
              [52, 125],
              [53.5, 138],
              [55, 151],
              [56.5, 164],
              [58, 177],
            ] as const
          ).map(([x, y]) => (
            <path
              key={y}
              d={`M${x - 8} ${y - 2} C${x - 6} ${y - 9} ${x + 6} ${y - 9} ${x + 8} ${y - 2} C${x + 6} ${y + 6} ${x - 6} ${y + 7} ${x - 8} ${y - 2} Z`}
            />
          ))}
        </g>
        <rect
          x={52}
          y={182}
          width={12}
          height={6}
          rx={2.5}
          fill="#fff"
          stroke={INK}
          strokeWidth={3}
        />
        <path
          d="M53 188 C51 193 51 198 54 202 C56 197 58 197 59 201 C61 197 62 193 63 188 Z"
          fill={p.hair}
          stroke={INK}
          strokeWidth={3.4}
          strokeLinejoin="round"
        />
      </g>
    ),
    front: (p) => (
      <g>
        <path
          d={cap(
            'C150 96 148 90 145 84 C140 73 128 65 114 61 C107 58 102 54 100 49 C98 54 93 58 86 61 C72 65 60 73 55 84 C52 90 50 96 46 96',
          )}
          fill={p.hair}
          {...outline}
        />
        {parting(p)}
        {strands(p, 'M86 64 Q70 72 62 84 M114 64 Q130 72 138 84')}
      </g>
    ),
  },
  pony: {
    label: 'High ponytail',
    back: (p) => (
      <g>
        <path d={CROWN_BACK} fill={p.hair} {...outline} />
        <path
          d="M128 40 C150 30 172 42 176 70 C181 100 174 132 160 152 C161 132 158 116 152 102 C146 86 140 66 128 40 Z"
          fill={p.hair}
          {...outline}
        />
        {strands(p, 'M150 50 Q166 74 164 112 M158 82 Q168 104 162 132')}
      </g>
    ),
    front: (p) => (
      <g>
        <path
          d={cap(
            'C151 98 148 97 146 92 C144 85 140 80 134 77 C131 85 126 91 118 94 C122 86 122 80 121 75 C111 81 98 86 84 89 C89 84 91 79 91 73 C80 79 68 87 58 95 C55 97 52 98 50 98 C48 98 47 97 46 96',
          )}
          fill={p.hair}
          {...outline}
        />
        <rect
          x={127}
          y={35}
          width={12}
          height={9}
          rx={4}
          fill={p.hairShade}
          stroke={INK}
          strokeWidth={3}
          transform="rotate(-24 133 39.5)"
        />
      </g>
    ),
  },
  twintails: {
    label: 'Twin tails',
    back: (p) => <path d={CROWN_BACK} fill={p.hair} {...outline} />,
    mid: (p) =>
      sides(
        <g>
          <path
            d="M46 112 C32 122 27 150 30 182 C32 192 41 195 45 188 C43 170 46 142 58 120 Z"
            fill={p.hair}
            {...outline}
          />
          {strands(p, 'M42 126 Q34 150 37 180')}
          {bobble(48, 114)}
        </g>,
      ),
    front: (p) => (
      <g>
        <path
          d={cap(
            'C151 98 148 97 146 93 C145 91 144 90 143 89 C141 93 137 95 132 95 C134 91 134 88 133 86 C127 90 121 92 114 92 C116 88 116 85 115 83 C106 88 95 89 86 88 C88 86 89 84 89 82 C81 86 72 89 62 91 C58 92 55 93 53 94 C51 97 48 98 46 96',
          )}
          fill={p.hair}
          {...outline}
        />
        {shine(p)}
      </g>
    ),
  },
  waves: {
    label: 'Long waves',
    back: (p) => <path d={CROWN_BACK} fill={p.hair} {...outline} />,
    mid: (p) =>
      sides(
        <g>
          <path
            d="M40 98 C33 116 42 128 36 146 C30 164 42 176 35 194 C40 200 47 196 51 199 C56 194 61 198 65 193 C62 182 68 170 64 158 C70 150 73 134 71 118 L63 98 Z"
            fill={p.hair}
            {...outline}
          />
          {strands(p, 'M47 112 C42 126 49 136 44 150 C40 164 48 174 45 188')}
        </g>,
      ),
    front: (p) => (
      <g>
        <path
          d={cap(
            'C151 98 148 96 146 91 C143 82 136 74 126 70 C118 68 110 70 104 76 C104 82 101 88 96 92 C97 86 96 80 93 76 C82 76 70 82 62 92 C58 96 54 98 50 98 C48 98 47 97 46 96',
          )}
          fill={p.hair}
          {...outline}
        />
        {strands(p, 'M104 76 Q102 60 98 46 M126 72 Q138 76 144 88')}
      </g>
    ),
  },
  pixie: {
    label: 'Pixie',
    front: (p) => (
      <g>
        <path
          d={cap(
            'C152 100 149 102 148 98 C147 92 146 88 143 85 C141 90 137 93 132 94 C134 88 133 83 131 80 C122 86 111 88 100 88 C104 84 105 80 104 76 C94 82 83 86 72 87 C76 84 77 81 77 78 C68 82 60 88 56 96 C53 103 49 103 48 99 C47 98 46 97 46 96',
          )}
          fill={p.hair}
          {...outline}
        />
        {strands(p, 'M104 76 Q112 60 124 50 M77 78 Q84 62 96 52')}
      </g>
    ),
  },
  'messy-bun': {
    label: 'Messy bun',
    back: (p) => (
      <g>
        <path d={CROWN_BACK} fill={p.hair} {...outline} />
        <circle cx={100} cy={30} r={17} fill={p.hair} {...outline} />
        {strands(p, 'M90 22 Q100 16 110 24 M88 34 Q98 40 112 34')}
      </g>
    ),
    front: (p) => (
      <g>
        <path
          d={cap(
            'C150 96 148 90 145 85 C141 79 135 75 128 73 C129 79 127 84 123 88 C121 80 115 75 107 73 C105 78 101 82 96 84 C97 79 96 75 94 73 C84 74 72 78 62 86 C57 90 53 94 50 97 C48 98 47 97 46 96',
          )}
          fill={p.hair}
          {...outline}
        />
      </g>
    ),
  },
  tousled: {
    label: 'Tousled',
    front: (p) => (
      <g>
        <path d="M104 34 C104 24 110 17 118 14 C113 21 112 27 113 33" fill={p.hair} {...outline} />
        <path
          d="M50 106 C45 88 45 72 51 61 L43 56 L57 52 C62 42 74 35 88 33 L86 24 L98 31 C108 28 120 30 129 35 L141 30 L137 42 C147 48 153 58 153 70 L161 74 L153 80 C155 90 154 99 151 106 C148 99 146 93 142 89 L143 100 L134 85 C128 81 122 80 116 81 L114 93 L106 81 C98 83 90 87 84 93 L82 83 L72 95 L70 85 C62 89 57 96 55 106 Z"
          fill={p.hair}
          {...outline}
        />
        {strands(p, 'M90 48 Q86 60 88 70 M114 46 Q120 56 118 68')}
      </g>
    ),
  },
  swept: {
    label: 'Swept up',
    front: (p) => (
      <g>
        <path
          d="M50 102 C45 84 45 66 54 54 L50 45 L61 47 C68 37 80 31 93 30 L93 20 L102 29 C114 27 126 31 134 37 L144 32 L142 43 C150 51 155 62 155 75 C156 86 154 96 151 104 C149 97 147 92 144 89 C140 99 132 105 122 107 C130 99 133 90 132 82 C124 78 114 72 104 64 C98 72 90 78 82 80 C84 74 86 68 86 62 C74 70 64 84 58 100 C56 105 52 106 50 102 Z"
          fill={p.hair}
          {...outline}
        />
        {strands(p, 'M104 64 Q116 52 130 48 M86 62 Q92 48 104 40 M132 82 Q142 72 146 60')}
      </g>
    ),
  },
  messy: {
    label: 'Messy',
    front: (p) => (
      <g>
        <path
          d="M46 114 C40 98 40 80 46 68 L38 62 L50 58 C56 44 70 34 86 32 L84 23 L96 30 C108 27 122 30 132 36 L144 30 L140 42 C150 50 156 62 156 76 L164 82 L155 86 C157 96 156 106 152 114 L148 104 L146 116 L140 96 L132 101 L130 88 L120 99 L116 82 L108 97 L104 80 L94 97 L92 82 L82 98 L80 86 L70 101 L68 90 L59 104 L56 96 C52 102 50 108 50 116 Z"
          fill={p.hair}
          {...outline}
        />
        {strands(p, 'M80 46 Q74 60 76 70 M118 44 Q124 56 122 68')}
      </g>
    ),
  },
  middle: {
    label: 'Middle part',
    front: (p) => (
      <g>
        <path
          d={cap(
            'C153 102 149 104 148 99 C147 92 143 84 136 79 C126 74 114 75 106 82 C103 77 101 70 100 61 C99 70 97 77 94 82 C86 75 74 74 64 79 C57 84 53 92 52 99 C51 104 47 102 46 96',
          )}
          fill={p.hair}
          {...outline}
        />
        {strands(p, 'M100 62 Q98 52 96 42 M106 82 Q118 70 134 66 M94 82 Q82 70 66 66')}
      </g>
    ),
  },
  crop: {
    label: 'Textured crop',
    front: (p) => (
      <g>
        <path
          d={cap(
            'C152 100 149 101 148 96 L147 86 L141 89 L137 81 L131 86 L126 78 L120 84 L114 77 L108 84 L101 78 L95 84 L88 78 L82 85 L76 79 L70 86 L64 81 L58 89 L54 86 C52 92 50 98 46 96',
            'M46 96 C44 68 55 50 68 43 L72 36 L79 40 L86 33 L93 38 L101 31 L108 37 L116 32 L121 38 L129 36 L132 43 C146 50 156 66 154 96',
          )}
          fill={p.hair}
          {...outline}
        />
        {strands(p, 'M88 46 Q86 58 90 70 M112 45 Q116 58 112 70')}
      </g>
    ),
  },
  wolf: {
    label: 'Wolf cut',
    back: (p) => <path d={CROWN_BACK} fill={p.hair} {...outline} />,
    mid: (p) =>
      sides(
        <path
          d="M41 98 C38 116 40 134 45 150 L51 143 L55 153 L61 143 L67 148 L71 120 L63 98 Z"
          fill={p.hair}
          {...outline}
        />,
      ),
    front: (p) => (
      <g>
        <path
          d={cap(
            'C152 100 149 102 147 97 L144 88 L139 98 L134 84 L126 96 L122 82 L113 94 L109 80 L101 93 L96 80 L88 92 L84 81 L76 93 L72 84 L64 95 L60 88 C56 92 52 98 46 96',
            'M46 96 C44 66 56 48 70 42 L68 32 L80 37 C88 31 98 29 106 31 L112 22 L117 33 C132 37 146 46 151 60 L160 62 L154 70 C155 78 155 88 154 96',
          )}
          fill={p.hair}
          {...outline}
        />
        {strands(p, 'M90 44 Q86 58 88 72 M118 46 Q124 58 120 72')}
      </g>
    ),
  },
  sweep: {
    label: 'Side sweep',
    front: (p) => (
      <g>
        <path
          d={cap(
            'C152 100 149 102 148 97 C147 90 145 85 141 82 C138 89 132 93 124 95 C128 88 128 82 126 78 C114 84 98 87 82 87 C88 83 91 77 91 71 C79 77 66 85 56 93 C53 97 49 99 46 96',
          )}
          fill={p.hair}
          {...outline}
        />
        {strands(p, 'M126 78 Q112 64 92 56 M91 71 Q100 58 116 50')}
      </g>
    ),
  },
} as const satisfies Record<string, Item>;
