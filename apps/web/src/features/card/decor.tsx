import { memo, useId, useMemo, type CSSProperties } from 'react';
import { starPath } from '../avatar/art';
import type { CardTheme } from './theme';

// ---------------------------------------------------------------------------------------------
// Hand-drawn lines: a few points with a fixed wobble, joined by smooth curves
// ---------------------------------------------------------------------------------------------

/** A tiny seeded random generator, so a "hand-drawn" line looks the same on every render. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = [number, number];

/** Catmull-Rom through the points, as cubic Béziers. */
function smooth(pts: Pt[], closed = false): string {
  const p = closed
    ? [pts[pts.length - 1]!, ...pts, pts[0]!, pts[1]!]
    : [pts[0]!, ...pts, pts[pts.length - 1]!];
  let d = `M${p[1]![0].toFixed(1)} ${p[1]![1].toFixed(1)}`;
  for (let i = 1; i < p.length - 2; i++) {
    const [p0, p1, p2, p3] = [p[i - 1]!, p[i]!, p[i + 1]!, p[i + 2]!];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/** A rounded rectangle traced by hand: wobbly, and it overshoots where it started. */
export function sketchRect(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  seed: number,
  wobble = 1.3,
) {
  const rand = seeded(seed);
  const jit = () => (rand() - 0.5) * 2 * wobble;
  const pts: Pt[] = [];
  const side = (x0: number, y0: number, x1: number, y1: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(len / 46));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      pts.push([x0 + (x1 - x0) * t + jit(), y0 + (y1 - y0) * t + jit()]);
    }
  };
  const corner = (cx: number, cy: number, a0: number) => {
    for (const k of [0.25, 0.5, 0.75]) {
      const a = a0 + (k * Math.PI) / 2;
      pts.push([cx + r * Math.cos(a) + jit() * 0.5, cy + r * Math.sin(a) + jit() * 0.5]);
    }
  };
  side(x + r, y, x + w - r, y);
  corner(x + w - r, y + r, -Math.PI / 2);
  side(x + w, y + r, x + w, y + h - r);
  corner(x + w - r, y + h - r, 0);
  side(x + w - r, y + h, x + r, y + h);
  corner(x + r, y + h - r, Math.PI / 2);
  side(x, y + h - r, x, y + r);
  corner(x + r, y + r, Math.PI);
  // Overshoot: carry on a little past the start, the way a pen does.
  pts.push([x + r + 4 + jit(), y + jit() * 0.6], [x + r + 22 + jit(), y + 1.2 + jit()]);
  return smooth(pts);
}

/** A hand-drawn horizontal line. */
function sketchLine(x0: number, x1: number, y: number, seed: number, wobble = 1.1) {
  const rand = seeded(seed);
  const pts: Pt[] = [];
  const n = Math.max(2, Math.round((x1 - x0) / 40));
  for (let i = 0; i <= n; i++)
    pts.push([x0 + ((x1 - x0) * i) / n, y + (rand() - 0.5) * 2 * wobble]);
  return smooth(pts);
}

// ---------------------------------------------------------------------------------------------
// Dividers
// ---------------------------------------------------------------------------------------------

export const Divider = memo(function Divider({
  kind,
  width,
  theme,
  seed = 1,
}: {
  kind: string;
  width: number;
  theme: CardTheme;
  seed?: number;
}) {
  const y = 9;
  const c = theme.ink;
  const path = useMemo(() => {
    switch (kind) {
      case 'wavy': {
        let d = `M0 ${y}`;
        for (let x = 0; x < width; x += 14) d += ` q3.5 -4 7 0 t7 0`;
        return d;
      }
      case 'zigzag': {
        let d = `M0 ${y + 2.5}`;
        for (let x = 0; x < width; x += 10) d += ` l5 -5 l5 5`;
        return d;
      }
      case 'sketch':
        return sketchLine(2, width - 2, y, seed);
      default:
        return `M1 ${y} H${width - 1}`;
    }
  }, [kind, width, seed]);
  if (kind === 'none') return <div aria-hidden style={{ height: 18 }} />;
  if (kind === 'stars') {
    const n = 7;
    return (
      <svg aria-hidden width={width} height={18} viewBox={`0 0 ${width} 18`} className="block">
        <path
          d={`M0 ${y} H${width / 2 - 70} M${width / 2 + 70} ${y} H${width}`}
          stroke={c}
          strokeOpacity={0.35}
          strokeWidth={1.4}
        />
        {Array.from({ length: n }, (_, i) => {
          const cx = width / 2 + (i - (n - 1) / 2) * 20;
          const r = i === (n - 1) / 2 ? 6.4 : 4.6;
          return (
            <path
              key={i}
              d={starPath(cx, y + 0.5, r)}
              fill={theme.accent}
              stroke={c}
              strokeOpacity={0.8}
              strokeWidth={1}
              strokeLinejoin="round"
            />
          );
        })}
      </svg>
    );
  }
  return (
    <svg
      aria-hidden
      width={width}
      height={18}
      viewBox={`0 0 ${width} 18`}
      className="block"
      overflow="visible"
    >
      <path
        d={path}
        fill="none"
        stroke={c}
        strokeOpacity={kind === 'sketch' ? 0.9 : 0.7}
        strokeWidth={kind === 'dotted' ? 2.6 : kind === 'sketch' ? 1.8 : 1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={kind === 'dashed' ? '6 5' : kind === 'dotted' ? '0.1 6' : undefined}
      />
      {kind === 'sketch' ? (
        <path
          d={sketchLine(10, width - 30, y + 1, seed + 7, 0.9)}
          fill="none"
          stroke={c}
          strokeOpacity={0.4}
          strokeWidth={1.1}
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
});

// ---------------------------------------------------------------------------------------------
// Borders
// ---------------------------------------------------------------------------------------------

/** Where a ticket's notches cut in (layout px from the top): level with the first divider (header 224 + 9). */
export const TICKET_Y = 233;
const NOTCH = 13;

/** The card face's mask for borders that change its shape (the ticket notches). */
export function faceMask(border: string, y = TICKET_Y): CSSProperties | undefined {
  if (border !== 'ticket') return undefined;
  const at = `${y}px`;
  const m = `radial-gradient(circle ${NOTCH}px at 0 ${at}, #0000 98%, #000) left / 51% 100% no-repeat, radial-gradient(circle ${NOTCH}px at 100% ${at}, #0000 98%, #000) right / 51% 100% no-repeat`;
  return { maskImage: undefined, mask: m, WebkitMask: m } as CSSProperties;
}

const FOIL_WIDTH = 6;

/** A rounded rectangle as an SVG path (corner radius clamped to fit). */
function roundRectPath(x: number, y: number, w: number, h: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  return (
    `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}` +
    `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}` +
    `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  );
}

/** A `t`-wide ring along the edge of a `w`×`h` box with corner radius `r`, for an even-odd fill. */
export function ringPath(w: number, h: number, r: number, t: number): string {
  return `${roundRectPath(0, 0, w, h, r)}${roundRectPath(t, t, w - 2 * t, h - 2 * t, r - t)}`;
}

/** A glow outside the card face (box shadows aren't clipped by the face's own overflow). */
export function faceShadow(border: string, theme: CardTheme): string | undefined {
  if (border !== 'glow') return undefined;
  return `0 0 0 2px ${theme.line}, 0 0 18px 3px color-mix(in srgb, ${theme.line} 60%, transparent), 0 0 42px 6px color-mix(in srgb, ${theme.line} 30%, transparent)`;
}

export const BorderLayer = memo(function BorderLayer({
  kind,
  theme,
  width,
  height,
  ticketY = TICKET_Y,
}: {
  kind: string;
  theme: CardTheme;
  width: number;
  height: number;
  /** Where the ticket's notches are (layout px from the top). */
  ticketY?: number;
}) {
  const r = theme.radius;
  const c = theme.line;
  const box = (style: CSSProperties) => (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{ inset: 0, borderRadius: r, ...style }}
    />
  );
  const sketch = useMemo(
    () =>
      kind === 'sketch'
        ? [
            sketchRect(7, 7, width - 14, height - 14, Math.max(4, r - 5), 11),
            sketchRect(8, 9, width - 17, height - 17, Math.max(4, r - 6), 23, 1.6),
          ]
        : null,
    [kind, width, height, r],
  );
  switch (kind) {
    case 'thin':
      return box({ border: `2px solid ${c}` });
    case 'thick':
      return box({ border: `5px solid ${c}` });
    case 'double':
      return box({ border: `7px double ${c}` });
    case 'dashed':
      return box({ inset: 5, borderRadius: Math.max(2, r - 5), border: `2.5px dashed ${c}` });
    case 'dotted':
      return box({ inset: 5, borderRadius: Math.max(2, r - 5), border: `3.5px dotted ${c}` });
    case 'stitched':
      return (
        <>
          {box({ border: `1px solid color-mix(in srgb, ${c} 35%, transparent)` })}
          {box({
            inset: 8,
            borderRadius: Math.max(2, r - 7),
            border: `2px dashed ${c}`,
            opacity: 0.85,
          })}
        </>
      );
    case 'frame':
      return (
        <>
          {box({ border: `10px solid ${c}` })}
          {box({
            inset: 14,
            borderRadius: Math.max(2, r - 12),
            border: `1.5px solid ${c}`,
            opacity: 0.7,
          })}
        </>
      );
    case 'ticket':
      return (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0"
          width={width}
          height={height}
        >
          <path
            d={`M${NOTCH + 8} ${ticketY} H${width - NOTCH - 8}`}
            stroke={c}
            strokeOpacity={0.55}
            strokeWidth={2}
            strokeDasharray="0.1 7"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'foil':
      // A 6px ring cut with an even-odd clip path. Not the usual mask-composite trick: Firefox
      // treats `-webkit-mask` as `mask`, so the prefixed copy overwrote the `exclude` one and the
      // foil covered the whole card.
      return box({
        background:
          'linear-gradient(125deg, #d9dde6, #f7d6ec 18%, #c8efe2 34%, #fff1bf 50%, #c9d3ff 66%, #f4cfe9 82%, #d9dde6) var(--mx, 50%) var(--my, 50%) / 260% 260%',
        clipPath: `path(evenodd, "${ringPath(width, height, r, FOIL_WIDTH)}")`,
      });
    case 'sketch':
      return (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0"
          width={width}
          height={height}
          overflow="visible"
        >
          <path
            d={sketch![0]}
            fill="none"
            stroke={c}
            strokeWidth={2.3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={sketch![1]}
            fill="none"
            stroke={c}
            strokeOpacity={0.45}
            strokeWidth={1.3}
            strokeLinecap="round"
          />
        </svg>
      );
    default:
      return null;
  }
});

// ---------------------------------------------------------------------------------------------
// Finishes
// ---------------------------------------------------------------------------------------------

const GLITTER = (() => {
  const rand = seeded(7);
  return Array.from({ length: 110 }, () => ({
    x: rand() * 320,
    y: rand() * 540,
    r: 0.6 + rand() * 1.6,
    star: rand() < 0.22,
    hue: Math.floor(rand() * 4),
  }));
})();
const GLITTER_LIGHT = ['#e3b341', '#f472b6', '#60a5fa', '#c084fc'];
const GLITTER_DARK = ['#ffffff', '#fde68a', '#f9a8d4', '#a5f3fc'];

/** Surface effects over the whole face. Gloss and holographic follow `--mx`/`--my` (the tilt). */
export const FinishLayer = memo(function FinishLayer({
  kind,
  theme,
}: {
  kind: string;
  theme: CardTheme;
}) {
  const uid = `fn${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const layer = (style: CSSProperties, key?: string) => (
    <div key={key} aria-hidden className="pointer-events-none absolute inset-0" style={style} />
  );
  switch (kind) {
    case 'gloss':
      return (
        <>
          {layer({
            background:
              'linear-gradient(118deg, transparent 32%, rgb(255 255 255 / 0.5) 46%, rgb(255 255 255 / 0.12) 52%, transparent 64%) var(--mx, 30%) var(--my, 50%) / 280% 280%',
            mixBlendMode: theme.bg.dark ? 'screen' : 'normal',
            opacity: theme.bg.dark ? 0.45 : 0.5,
          })}
          {layer({
            background:
              'radial-gradient(circle at var(--mx, 30%) var(--my, 20%), rgb(255 255 255 / 0.32), transparent 40%)',
            opacity: 0.8,
          })}
        </>
      );
    case 'holo':
      return (
        <>
          {layer({
            background:
              'linear-gradient(115deg, transparent 4%, #ff77b7 18%, #ffd66b 30%, #7cf3c5 42%, #7ab8ff 54%, #c99bff 66%, #ff77b7 78%, transparent 94%) var(--mx, 40%) var(--my, 40%) / 300% 300%',
            mixBlendMode: theme.bg.dark ? 'screen' : 'multiply',
            opacity: theme.bg.dark ? 0.3 : 0.3,
          })}
          {layer({
            background:
              'repeating-linear-gradient(55deg, rgb(255 255 255 / 0) 0 6px, rgb(255 255 255 / 0.22) 7px 8px, rgb(255 255 255 / 0) 9px 14px)',
            mixBlendMode: 'overlay',
          })}
        </>
      );
    case 'glitter': {
      const colors = theme.bg.dark ? GLITTER_DARK : GLITTER_LIGHT;
      return (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
          viewBox="0 0 320 540"
          preserveAspectRatio="none"
          style={{ opacity: theme.bg.dark ? 0.85 : 0.7 }}
        >
          {GLITTER.map((g, i) =>
            g.star ? (
              <path
                key={i}
                d={`M${g.x} ${g.y - g.r * 2.6} Q${g.x} ${g.y} ${g.x + g.r * 2.6} ${g.y} Q${g.x} ${g.y} ${g.x} ${g.y + g.r * 2.6} Q${g.x} ${g.y} ${g.x - g.r * 2.6} ${g.y} Q${g.x} ${g.y} ${g.x} ${g.y - g.r * 2.6} Z`}
                fill={colors[g.hue]}
              />
            ) : (
              <circle key={i} cx={g.x} cy={g.y} r={g.r * 0.7} fill={colors[g.hue]} />
            ),
          )}
        </svg>
      );
    }
    case 'paper':
      return (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
          style={{
            mixBlendMode: theme.bg.dark ? 'screen' : 'multiply',
            opacity: theme.bg.dark ? 0.16 : 0.32,
          }}
        >
          <filter id={uid}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.85"
              numOctaves={2}
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncA type="linear" slope={0.9} />
            </feComponentTransfer>
          </filter>
          <rect width="100%" height="100%" filter={`url(#${uid})`} />
        </svg>
      );
    default:
      return null;
  }
});

// ---------------------------------------------------------------------------------------------
// The Message button
// ---------------------------------------------------------------------------------------------

export function buttonStyle(kind: string, theme: CardTheme): CSSProperties {
  switch (kind) {
    case 'solid':
      return { background: theme.accent, color: theme.onAccent, borderRadius: 12 };
    case 'soft':
      return {
        background: theme.accentWash,
        color: theme.dark ? theme.ink : theme.accentText,
        borderRadius: 12,
      };
    case 'outline':
      return { boxShadow: `inset 0 0 0 2px ${theme.ink}`, color: theme.ink, borderRadius: 12 };
    case 'pill':
      return { background: theme.ink, color: theme.bg.base, borderRadius: 999 };
    default:
      return { color: theme.ink };
  }
}

/** The hand-drawn box behind the "sketch" button. */
export const SketchBox = memo(function SketchBox({
  width,
  height,
  color,
}: {
  width: number;
  height: number;
  color: string;
}) {
  const d = useMemo(
    () => [
      sketchRect(2, 3, width - 4, height - 6, 3, 5, 1.4),
      sketchRect(3, 2, width - 5, height - 4, 3, 9, 1.8),
    ],
    [width, height],
  );
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0"
      width={width}
      height={height}
      overflow="visible"
    >
      <path
        d={d[0]}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={d[1]}
        fill="none"
        stroke={color}
        strokeOpacity={0.4}
        strokeWidth={1.2}
        strokeLinecap="round"
      />
    </svg>
  );
});
