import type { ReactNode } from 'react';
import { DW, INK, outline, type Item, type Paint } from '../art';
import { mix } from '../color';

/** The shoulders every top is cut from. Runs off the bottom of the canvas. */
const BODY = 'M28 240 C29 178 53 158 85 152.5 C90 161 110 161 115 152.5 C147 158 171 178 172 240 Z';
/** The same shoulders with a V neckline. */
const BODY_V = 'M28 240 C29 178 53 158 85 152.5 L100 176 L115 152.5 C147 158 171 178 172 240 Z';
const CREW = 'M85 152.5 C90 161 110 161 115 152.5';

const CREAM = '#f7f3ea';

const line = (stroke: string, width = 3.4) =>
  ({
    fill: 'none',
    stroke,
    strokeWidth: width,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }) as const;

/** Where the arms meet the body, drawn as soft folds. */
const arms = (color: string) => (
  <path d="M51 181 Q47.5 195 47 240 M149 181 Q152.5 195 153 240" {...line(color)} />
);

/** Body fill clipped to the shoulders, for patterns. */
const clipped = (p: Paint, id: string, d: string, children: ReactNode) => (
  <g>
    <defs>
      <clipPath id={`${p.uid}-${id}`}>
        <path d={d} />
      </clipPath>
    </defs>
    <g clipPath={`url(#${p.uid}-${id})`}>{children}</g>
  </g>
);

/** Bare shoulders. On the slim build the neck flows into them, so the neckline isn't drawn. */
const skinBody = (p: Paint) =>
  p.slim ? (
    <g>
      <path d={BODY} fill={p.skin} />
      <path
        d="M28 240 C29 178 53 158 85 152.5 M115 152.5 C147 158 171 178 172 240"
        {...outline}
        fill="none"
      />
    </g>
  ) : (
    <path d={BODY} fill={p.skin} {...outline} />
  );

/** Skin showing through a V neckline. */
const vSkin = (p: Paint) => <path d="M83 150 L100 179 L117 150 Z" fill={p.skin} />;

const button = (x: number, y: number, fill: string) => (
  <circle cx={x} cy={y} r={2.6} fill={fill} stroke={INK} strokeWidth={1.8} />
);

/** An open front (jacket, cardigan) showing a tee underneath. */
const openFront = (p: Paint, inner: string, lapel: ReactNode) => (
  <g>
    <path d={BODY} fill={p.top} {...outline} />
    <path
      d="M85 152.5 C90 161 110 161 115 152.5 L111 240 L89 240 Z"
      fill={inner}
      {...outline}
      strokeWidth={DW}
    />
    {lapel}
    {arms(p.topShade)}
  </g>
);

export const TOPS = {
  tee: {
    label: 'Tee',
    front: (p) => (
      <g>
        <path d={BODY} fill={p.top} {...outline} />
        <path d="M87 157.5 C92.5 166 107.5 166 113 157.5" {...line(p.topShade)} />
        {arms(p.topShade)}
      </g>
    ),
  },
  vneck: {
    label: 'V-neck',
    front: (p) => (
      <g>
        {vSkin(p)}
        <path d={BODY_V} fill={p.top} {...outline} />
        <path d="M88.5 156.5 L100 175 L111.5 156.5" {...line(p.topShade)} />
        {arms(p.topShade)}
      </g>
    ),
  },
  stripes: {
    label: 'Stripes',
    front: (p) => (
      <g>
        <path d={BODY} fill={p.top} />
        {clipped(
          p,
          'stripes',
          BODY,
          <g fill={mix(p.top, '#ffffff', 0.75)}>
            {[166, 182, 198].map((y) => (
              <rect key={y} x={20} y={y} width={160} height={7.5} />
            ))}
          </g>,
        )}
        <path d={BODY} fill="none" {...outline} />
        <path d="M87 157.5 C92.5 166 107.5 166 113 157.5" {...line(p.topShade)} />
      </g>
    ),
  },
  hoodie: {
    label: 'Hoodie',
    front: (p) => (
      <g>
        <path d={BODY} fill={p.top} {...outline} />
        {/* The hood lying around the neck. */}
        <path
          d="M66 152 C66 144 76 141 85 146 C90 156 110 156 115 146 C124 141 134 144 134 152 C130 168 70 168 66 152 Z"
          fill={p.topShade}
          {...outline}
          strokeWidth={DW}
        />
        <path d={CREW} fill={p.skin} />
        <path d="M84 146.5 C89 157.5 111 157.5 116 146.5" {...line(INK, DW)} />
        <path d="M92 163 L91 184 M108 163 L109 184" {...line(p.topTint, 3)} />
        <g fill={p.topTint} stroke={INK} strokeWidth={1.8}>
          <rect x={88.5} y={182} width={5} height={7} rx={2} />
          <rect x={106.5} y={182} width={5} height={7} rx={2} />
        </g>
        {arms(p.topShade)}
      </g>
    ),
  },
  sweater: {
    label: 'Sweater',
    front: (p) => (
      <g>
        <path d={BODY} fill={p.top} />
        {clipped(
          p,
          'sweater',
          BODY,
          <g>
            <rect x={20} y={180} width={160} height={12} fill={p.topTint} />
            <g fill={p.top}>
              {[50, 64, 78, 92, 106, 120, 134, 148].map((x) => (
                <path key={x} d={`M${x} 186 l5 -4.5 l5 4.5 l-5 4.5 Z`} />
              ))}
            </g>
          </g>,
        )}
        {/* The ribbed collar, kept inside the body so its ends don't poke past the shoulders. */}
        {clipped(
          p,
          'sweater-rib',
          BODY,
          <g>
            <path d="M83.5 151 C89 164 111 164 116.5 151" {...line(p.topShade, 7)} />
            <path
              d="M90 158 L89.5 162 M95 160 L95 164 M100 160.5 L100 164.5 M105 160 L105 164 M110 158 L110.5 162"
              {...line(mix(p.topShade, INK, 0.25), 1.6)}
            />
          </g>,
        )}
        <path d={BODY} fill="none" {...outline} />
        <path d={CREW} {...line(INK, DW)} />
        {arms(p.topShade)}
      </g>
    ),
  },
  turtleneck: {
    label: 'Turtleneck',
    front: (p) => (
      <g>
        <path d={BODY} fill={p.top} {...outline} />
        <path
          d="M83 140 C83 136 117 136 117 140 L118 160 C110 166 90 166 82 160 Z"
          fill={p.top}
          {...outline}
          strokeWidth={DW}
        />
        <path
          d="M84 146 C94 150 106 150 116 146 M83.5 153 C94 157 106 157 116.5 153"
          {...line(p.topShade, 2.6)}
        />
        {arms(p.topShade)}
      </g>
    ),
  },
  shirt: {
    label: 'Shirt',
    front: (p) => (
      <g>
        <path d={BODY} fill={p.top} {...outline} />
        <path d="M100 164 V214" {...line(p.topShade, 2.6)} />
        {button(100, 177, p.topTint)}
        {button(100, 192, p.topTint)}
        {button(100, 207, p.topTint)}
        <g fill={p.topTint} {...outline} strokeWidth={DW}>
          <path d="M85 151 L77 167 L96 168 L100 161 Z" />
          <path d="M115 151 L123 167 L104 168 L100 161 Z" />
        </g>
        {arms(p.topShade)}
      </g>
    ),
  },
  overalls: {
    label: 'Overalls',
    front: (p) => (
      <g>
        <path d={BODY} fill={CREAM} {...outline} />
        <path d={CREW} {...line(mix(CREAM, INK, 0.15), 3)} transform="translate(0 4)" />
        <path
          d="M72 180 C72 176 128 176 128 180 L130 240 L70 240 Z"
          fill={p.top}
          {...outline}
          strokeWidth={DW}
        />
        <path d="M64 162 L74 180 M136 162 L126 180" {...line(INK, 11)} />
        <path d="M64 162 L74 180 M136 162 L126 180" {...line(p.top, 6)} />
        <rect
          x={88}
          y={186}
          width={24}
          height={14}
          rx={3}
          fill={p.topShade}
          stroke={INK}
          strokeWidth={2.4}
        />
        {button(74, 181, '#f5c84c')}
        {button(126, 181, '#f5c84c')}
        {arms(mix(CREAM, INK, 0.18))}
      </g>
    ),
  },
  dress: {
    label: 'Dress',
    front: (p) => (
      <g>
        <path d={BODY} fill={p.top} {...outline} />
        <g fill={CREAM} {...outline} strokeWidth={DW}>
          <path d="M85.5 152 C76 155 72 165 78 171 C85 177 96 172 100 162 C94 163 88 159 85.5 152 Z" />
          <path d="M114.5 152 C124 155 128 165 122 171 C115 177 104 172 100 162 C106 163 112 159 114.5 152 Z" />
        </g>
        <g fill={p.topShade} stroke={INK} strokeWidth={2.4} strokeLinejoin="round">
          <path d="M100 169 L92 164.5 L92 173.5 Z" />
          <path d="M100 169 L108 164.5 L108 173.5 Z" />
          <circle cx={100} cy={169} r={2.8} />
        </g>
        {arms(p.topShade)}
      </g>
    ),
  },
  tank: {
    label: 'Tank top',
    front: (p) => (
      <g>
        {skinBody(p)}
        <path
          d="M64 240 C64 196 68 178 71 160 L81 158 C84 176 116 176 119 158 L129 160 C132 178 136 196 136 240 Z"
          fill={p.top}
          {...outline}
          strokeWidth={DW}
        />
        <path d="M51 181 Q47.5 195 47 240 M149 181 Q152.5 195 153 240" {...line(p.skinShade)} />
      </g>
    ),
  },
  jacket: {
    label: 'Jacket',
    front: (p) =>
      openFront(
        p,
        CREAM,
        <g fill={p.topShade} {...outline} strokeWidth={DW}>
          <path d="M85 152.5 L77 170 L86 176 L92 240 L82 240 C78 190 74 170 85 152.5 Z" />
          <path d="M115 152.5 L123 170 L114 176 L108 240 L118 240 C122 190 126 170 115 152.5 Z" />
        </g>,
      ),
  },
  suit: {
    label: 'Suit',
    front: (p) => (
      <g>
        {openFront(
          p,
          '#ffffff',
          <g fill={p.top} {...outline} strokeWidth={DW}>
            <path d="M85 152.5 L78 168 L88 173 L80 178 L94 240 L84 240 C76 190 72 168 85 152.5 Z" />
            <path d="M115 152.5 L122 168 L112 173 L120 178 L106 240 L116 240 C124 190 128 168 115 152.5 Z" />
          </g>,
        )}
        <g fill="#ffffff" {...outline} strokeWidth={3.4}>
          <path d="M86 151 L84 162 L97 163 L100 158 Z" />
          <path d="M114 151 L116 162 L103 163 L100 158 Z" />
        </g>
      </g>
    ),
  },
  sailor: {
    label: 'Sailor',
    front: (p) => (
      <g>
        {vSkin(p)}
        <path d={BODY_V} fill={CREAM} {...outline} />
        <path
          d="M85 152.5 L100 176 L115 152.5 C126 154 138 158 146 163 L128 186 L100 190 L72 186 L54 163 C62 158 74 154 85 152.5 Z"
          fill={p.top}
          {...outline}
          strokeWidth={DW}
        />
        <path d="M60 165 L75 182 L100 186 L125 182 L140 165" {...line(CREAM, 2.6)} />
        <path d="M87 158 L100 179 L113 158" {...line(CREAM, 2.6)} />
        <g fill="#ef5350" stroke={INK} strokeWidth={2.6} strokeLinejoin="round">
          <path d="M100 181 L89 175 L90 188 Z" />
          <path d="M100 181 L111 175 L110 188 Z" />
          <path d="M98 183 L94 198 L100 195 L106 198 L102 183 Z" />
          <circle cx={100} cy={181} r={3.6} />
        </g>
        {arms(mix(CREAM, INK, 0.18))}
      </g>
    ),
  },
  cardigan: {
    label: 'Cardigan',
    front: (p) =>
      openFront(
        p,
        CREAM,
        <g>
          <path d="M89 160 L91.5 240 M111 160 L108.5 240" {...line(p.topShade, 2.6)} />
          {button(94.5, 180, p.topTint)}
          {button(95.5, 196, p.topTint)}
          {button(105.5, 180, p.topTint)}
          {button(104.5, 196, p.topTint)}
        </g>,
      ),
  },
  jersey: {
    label: 'Jersey',
    front: (p) => (
      <g>
        {vSkin(p)}
        <path d={BODY_V} fill={p.top} {...outline} />
        <path d="M88.5 156.5 L100 175 L111.5 156.5" {...line(CREAM, 4)} />
        <path d="M56 168 L50 182 M144 168 L150 182" {...line(CREAM, 4)} />
        <path d="M89 186 H111 L97 208" {...line(INK, 9)} />
        <path d="M89 186 H111 L97 208" {...line(CREAM, 5)} />
      </g>
    ),
  },
  puffer: {
    label: 'Puffer',
    front: (p) => (
      <g>
        <path d={BODY} fill={p.top} {...outline} />
        {clipped(
          p,
          'puffer',
          BODY,
          <g>
            <path
              d="M20 176 Q60 184 100 178 Q140 184 180 176 M20 196 Q60 204 100 198 Q140 204 180 196"
              {...line(p.topShade, 3)}
            />
            <path
              d="M40 172 Q60 178 80 175 M120 175 Q140 178 160 172"
              {...line(p.topTint, 3)}
              opacity={0.6}
            />
          </g>,
        )}
        <path
          d="M81 142 C81 138 119 138 119 142 L120 160 C110 167 90 167 80 160 Z"
          fill={p.top}
          {...outline}
          strokeWidth={DW}
        />
        <path d="M100 150 V214" {...line(INK, 2.6)} />
        <rect
          x={97}
          y={150}
          width={6}
          height={9}
          rx={2}
          fill="#e4e4e7"
          stroke={INK}
          strokeWidth={1.8}
        />
      </g>
    ),
  },
  blazer: {
    label: 'Blazer',
    front: (p) => (
      <g>
        <path d={BODY} fill={p.top} {...outline} />
        {/* The shirt (detail colour) in the open front. */}
        <path
          d="M84 151 C90 160 110 160 116 151 L124 170 L110 240 L90 240 L76 170 Z"
          fill={p.accent}
          {...outline}
          strokeWidth={DW}
        />
        <g fill={p.accent} {...outline} strokeWidth={DW}>
          <path d="M85 150 L78 166 L96 167 L100 159 Z" />
          <path d="M115 150 L122 166 L104 167 L100 159 Z" />
        </g>
        {/* Lapels. */}
        <g fill={p.top} {...outline} strokeWidth={DW}>
          <path d="M77 162 L66 182 L76 190 L69 198 L90 240 L82 240 C76 214 72 190 77 162 Z" />
          <path d="M123 162 L134 182 L124 190 L131 198 L110 240 L118 240 C124 214 128 190 123 162 Z" />
        </g>
        {arms(p.topShade)}
      </g>
    ),
  },
  cami: {
    label: 'Cami',
    front: (p) => (
      <g>
        {skinBody(p)}
        <path d="M71 184 L78 157 M129 184 L122 157" {...line(INK, 5.2)} />
        <path d="M71 184 L78 157 M129 184 L122 157" {...line(p.top, 2.2)} />
        <path
          d="M58 240 C58 210 61 194 64 186 C74 180 88 183 100 187 C112 183 126 180 136 186 C139 194 142 210 142 240 Z"
          fill={p.top}
          {...outline}
          strokeWidth={DW}
        />
        <path d="M51 181 Q47.5 195 47 240 M149 181 Q152.5 195 153 240" {...line(p.skinShade)} />
      </g>
    ),
  },
  print: {
    label: 'Print tee',
    front: (p) => (
      <g>
        <path d={BODY} fill={p.top} {...outline} />
        <path d="M87 157.5 C92.5 166 107.5 166 113 157.5" {...line(p.topShade)} />
        <text
          x={100}
          y={p.slim ? 184 : 196}
          textAnchor="middle"
          fontSize={29}
          fontWeight={900}
          letterSpacing={1}
          fill={p.accent}
          fontFamily="'Figtree Variable', ui-sans-serif, system-ui, sans-serif"
        >
          SHE
        </text>
        {arms(p.topShade)}
      </g>
    ),
  },
  patch: {
    label: 'Patch sweater',
    front: (p) => (
      <g>
        <path d={BODY} fill={p.top} {...outline} />
        <path d="M83 151 C89 162 111 162 117 151" {...line(INK, 9)} />
        <path d="M83 151 C89 162 111 162 117 151" {...line(p.accent, 5.4)} />
        <rect
          x={118}
          y={177}
          width={22}
          height={14}
          rx={2.4}
          fill={p.accent}
          stroke={INK}
          strokeWidth={DW}
        />
        {arms(p.topShade)}
      </g>
    ),
  },
  checker: {
    label: 'Checkered',
    front: (p) => (
      <g>
        <path d={BODY} fill={p.top} />
        {clipped(
          p,
          'checker',
          BODY,
          <g fill={p.accent}>
            {Array.from({ length: 13 }, (_, c) =>
              Array.from({ length: 8 }, (_, r) =>
                (c + r) % 2 === 0 ? (
                  <rect key={`${c}-${r}`} x={22 + c * 12} y={150 + r * 12} width={12} height={12} />
                ) : null,
              ),
            )}
          </g>,
        )}
        <path d={BODY} fill="none" {...outline} />
        <path
          d="M83 140 C83 136 117 136 117 140 L118 160 C110 166 90 166 82 160 Z"
          fill={p.accent}
          {...outline}
          strokeWidth={DW}
        />
        <path
          d="M84 146 C94 150 106 150 116 146 M83.5 153 C94 157 106 157 116.5 153"
          {...line(mix(p.accent, '#ffffff', 0.3), 2.2)}
        />
      </g>
    ),
  },
} as const satisfies Record<string, Item>;

// ---------------------------------------------------------------------------------------------
// Neck accessories (drawn over the top, under the head)
// ---------------------------------------------------------------------------------------------

export const GOLD = '#f2c14e';

/** Points along the necklace curve from (82, 153) dipping to (100, 171). */
const necklace = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const x = 82 + 36 * t;
    const y = 153 + 18 * Math.sin(Math.PI * t);
    return [x, y] as const;
  });

export const flower = (x: number, y: number, petal: string, r = 4.2) => (
  <g key={`${x}-${y}`}>
    {[0, 72, 144, 216, 288].map((a) => (
      <circle
        key={a}
        cx={x + r * 0.9 * Math.cos(((a - 90) * Math.PI) / 180)}
        cy={y + r * 0.9 * Math.sin(((a - 90) * Math.PI) / 180)}
        r={r * 0.72}
        fill={petal}
        stroke={INK}
        strokeWidth={1.8}
      />
    ))}
    <circle cx={x} cy={y} r={r * 0.5} fill={GOLD} stroke={INK} strokeWidth={1.6} />
  </g>
);

export const NECKS = {
  none: { label: 'None' },
  chain: {
    label: 'Chain',
    front: () => (
      <g>
        <path d="M83 153 C88 172 112 172 117 153" {...line(INK, 5)} />
        <path d="M83 153 C88 172 112 172 117 153" {...line(GOLD, 2.6)} strokeDasharray="3 2.4" />
      </g>
    ),
  },
  pearls: {
    label: 'Pearls',
    front: () => (
      <g fill="#fbf7f0" stroke={INK} strokeWidth={1.8}>
        {necklace(9).map(([x, y]) => (
          <circle key={x} cx={x} cy={y} r={3.3} />
        ))}
      </g>
    ),
  },
  pendant: {
    label: 'Heart pendant',
    front: (p) => (
      <g>
        <path d="M84 153 C89 168 111 168 116 153" {...line(INK, 4.4)} />
        <path d="M84 153 C89 168 111 168 116 153" {...line(GOLD, 2)} />
        <path
          d="M100 181 C99 180 92 176 92 171 C92 167.5 96.5 166 100 169.5 C103.5 166 108 167.5 108 171 C108 176 101 180 100 181 Z"
          fill={p.neck}
          stroke={INK}
          strokeWidth={2.4}
          strokeLinejoin="round"
        />
      </g>
    ),
  },
  bowtie: {
    label: 'Bow tie',
    front: (p) => (
      <g fill={p.neck} stroke={INK} strokeWidth={DW} strokeLinejoin="round">
        <path d="M100 162 L84 153 C81 158 81 166 84 171 Z" />
        <path d="M100 162 L116 153 C119 158 119 166 116 171 Z" />
        <rect x={95} y={157} width={10} height={10} rx={3} fill={p.neckShade} />
      </g>
    ),
  },
  tie: {
    label: 'Tie',
    front: (p) => (
      <g fill={p.neck} stroke={INK} strokeWidth={DW} strokeLinejoin="round">
        <path d="M96 166 L91 200 L100 210 L109 200 L104 166 Z" />
        <path d="M93 156 L107 156 L104 167 L96 167 Z" fill={p.neckShade} />
      </g>
    ),
  },
  scarf: {
    label: 'Scarf',
    front: (p) => (
      <g>
        <g fill={p.neck} {...outline} strokeWidth={DW}>
          <path d="M104 160 L99 199 L111.5 201 L117 160 Z" />
          <path d="M113 160 L114 196 L125.5 194 L124 158 Z" fill={p.neckShade} />
        </g>
        <path d="M101 186 L112.5 187.5 M114 183 L125 182" {...line(p.neckShade, 3)} />
        <path
          d="M100 200 L99.5 204 M104 200.5 L103.5 205 M108 201 L107.5 205.5 M116 195.5 L116 199.5 M120 195 L120 199 M124 194.5 L124 198.5"
          {...line(INK, 2.2)}
        />
        <path
          d="M76 149 C78 139 122 139 124 149 L125.5 158 C121 172 79 172 74.5 158 Z"
          fill={p.neck}
          {...outline}
          strokeWidth={DW}
        />
        <path d="M78 156 C90 164 110 164 122 156" {...line(p.neckShade, 3)} />
      </g>
    ),
  },
  bandana: {
    label: 'Bandana',
    front: (p) => (
      <g>
        <path
          d="M80 152 C90 160 110 160 120 152 L101 186 C100.5 187 99.5 187 99 186 Z"
          fill={p.neck}
          {...outline}
          strokeWidth={DW}
        />
        <g fill={mix(p.neck, '#ffffff', 0.8)}>
          <circle cx={92} cy={163} r={1.8} />
          <circle cx={108} cy={163} r={1.8} />
          <circle cx={100} cy={170} r={1.8} />
          <circle cx={96} cy={177} r={1.5} />
          <circle cx={104} cy={177} r={1.5} />
        </g>
      </g>
    ),
  },
  choker: {
    label: 'Choker',
    front: (p) => (
      <g>
        <path
          d={p.slim ? 'M89.4 139.5 Q100 144 110.6 139.5' : 'M85.5 149 Q100 155 114.5 149'}
          {...line(INK, 5)}
        />
        <path
          transform={p.slim ? 'translate(0 -13)' : undefined}
          d="M100 163 C99.4 162.4 95 160 95 157 C95 155 97.8 154 100 156.2 C102.2 154 105 155 105 157 C105 160 100.6 162.4 100 163 Z"
          fill={p.neck}
          stroke={INK}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </g>
    ),
  },
  lei: {
    label: 'Flower lei',
    front: (p) => (
      <g>{necklace(7).map(([x, y], i) => flower(x, y + 2, i % 2 ? '#ffffff' : p.neck, 5.2))}</g>
    ),
  },
  beads: {
    label: 'Bead necklace',
    front: (p) => (
      <g>
        <g fill={p.neck} stroke={INK} strokeWidth={1.8}>
          {necklace(11).map(([x, y]) => (
            <ellipse key={x} cx={x} cy={y + 1} rx={3.6} ry={3.1} />
          ))}
        </g>
        <path d="M100 172 V175.5" {...line(INK, 1.8)} />
        <circle cx={100} cy={180.5} r={5.2} fill={p.neck} stroke={INK} strokeWidth={2} />
        <path d="M98 179.5 Q100 177.8 102 179.5" {...line(p.neckShade, 1.4)} />
      </g>
    ),
  },
  tag: {
    label: 'Bead tag',
    front: (p) => (
      <g>
        <path d="M86 157 C88 178 96 190 100 196 C104 190 112 178 114 157" {...line(INK, 1.8)} />
        <rect
          x={92}
          y={193}
          width={16}
          height={17}
          rx={2.4}
          fill={p.neck}
          stroke={INK}
          strokeWidth={2.2}
        />
        <path
          d="M96 199.5 Q100 197 104 199.5 Q100 202 96 204.5 Q100 207 104 204.5"
          {...line(p.neckShade, 1.8)}
        />
        <g fill={p.neck} stroke={INK} strokeWidth={1.8}>
          {necklace(11).map(([x, y]) => (
            <ellipse key={x} cx={x} cy={y - 1} rx={3.8} ry={3.2} />
          ))}
        </g>
      </g>
    ),
  },
  cross: {
    label: 'Cross',
    front: (p) => (
      <g>
        <path d="M85 152 C88 172 96 180 100 182 C104 180 112 172 115 152" {...line(INK, 2.2)} />
        <path
          d="M98 181 H102 V187 H108 V191 H102 V203 H98 V191 H92 V187 H98 Z"
          fill={p.neck}
          stroke={INK}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </g>
    ),
  },
  collar: {
    label: 'Buckle choker',
    front: (p) => {
      // Classic: at the base of the neck, below even the longest chin. Slim: up on the longer
      // neck, as in the specials' reference (drawn in the lowered body's coordinates; see SLIM_BODY).
      const [band, y] = p.slim
        ? (['M89.4 140.5 Q100 145 110.6 140.5', 139] as const)
        : (['M84 151 Q100 160.5 116 151', 152] as const);
      return (
        <g>
          <path d={band} {...line(INK, 8)} />
          <path d={band} {...line(p.neck, 4.4)} />
          <rect
            x={94.5}
            y={y}
            width={11}
            height={8.5}
            rx={1.6}
            fill="#e4e4e7"
            stroke={INK}
            strokeWidth={1.8}
          />
          <rect x={98} y={y + 2.5} width={4} height={3.5} rx={0.6} fill={p.neck} />
        </g>
      );
    },
  },
} as const satisfies Record<string, Item>;
