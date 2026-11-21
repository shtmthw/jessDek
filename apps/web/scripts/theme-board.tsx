/**
 * Draws every chat theme preset as a small chat, in light and dark, on one SVG board, from the
 * real theme tokens and doodles. For design review (Penpot, `resvg` → PNG) rather than the app.
 *
 *   npx tsx scripts/theme-board.tsx out.svg [presetId,…]
 */
import { writeFileSync } from 'node:fs';
// tsx compiles this script with the classic JSX runtime.
import React, { type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { doodlePattern } from '../src/features/theme/doodles';
import { ACCENTS, DOODLES, WALLS } from '../src/features/theme/catalog';
import { PRESETS } from '../src/features/theme/presets';
import { themeSpec, type ThemeSpec } from '../src/features/theme/recipe';
import {
  assignMemberColors,
  memberTokens,
  resolveTheme,
  type Mode,
} from '../src/features/theme/resolve';

const W = 300;
const H = 460;
const HEADER = 52;
const FONT = "Figtree, 'Noto Sans', 'DejaVu Sans', sans-serif";
const APP_BG = { light: '#ffffff', dark: '#09090b' } as const;
const APP_FG = { light: '#18181b', dark: '#fafafa' } as const;
const APP_BORDER = { light: '#e4e4e7', dark: '#27272a' } as const;

let uid = 0;
const nextId = (p: string) => `${p}${uid++}`;

/** Rough text width for the system sans at `size` px. */
const textW = (s: string, size: number) => s.length * size * 0.54;

function Bubble({
  x,
  y,
  text,
  fill,
  color,
  outline,
  link,
  linkColor,
  right,
}: {
  x: number;
  y: number;
  text: string;
  fill: string;
  color: string;
  outline?: string;
  link?: string;
  linkColor?: string;
  right?: boolean;
}) {
  const size = 12.5;
  const w = Math.max(textW(text, size), link ? textW(link, size) : 0) + 26;
  const h = link ? 50 : 32;
  const bx = right ? x - w : x;
  return (
    <g>
      {outline ? <rect x={bx + 2} y={y + 2.5} width={w} height={h} rx={16} fill={outline} /> : null}
      <rect
        x={bx}
        y={y}
        width={w}
        height={h}
        rx={16}
        fill={fill}
        stroke={outline}
        strokeWidth={outline ? 1.5 : 0}
      />
      <text x={bx + 13} y={y + 20.5} fontSize={size} fill={color} fontFamily={FONT}>
        {text}
      </text>
      {link ? (
        <text
          x={bx + 13}
          y={y + 38}
          fontSize={size}
          fill={linkColor}
          fontFamily={FONT}
          textDecoration="underline"
        >
          {link}
        </text>
      ) : null}
    </g>
  );
}

function MiniChat({ spec, mode, x, y }: { spec: ThemeSpec; mode: Mode; x: number; y: number }) {
  const t = resolveTheme(spec, mode);
  const clip = nextId('clip');
  const grad = nextId('grad');
  const doodle = nextId('dd');
  const members = assignMemberColors(['alice', 'bob', 'carol'], [], spec.accent);
  const bob = memberTokens(members.get('bob')!, t, mode);
  const carol = memberTokens(members.get('carol')!, t, mode);
  const outline = spec.bubble === 'outline' ? t.outline : undefined;
  const stops = t.wallFill.stops;
  const angle = ((t.wallFill.angle ?? 180) - 90) * (Math.PI / 180);
  const pattern = doodlePattern(spec.doodle, t.doodle, doodle);
  const top = HEADER;
  return (
    <g transform={`translate(${x} ${y})`}>
      <defs>
        <clipPath id={clip}>
          <rect width={W} height={H} rx={22} />
        </clipPath>
        <linearGradient
          id={grad}
          x1={0.5 - Math.cos(angle) / 2}
          y1={0.5 - Math.sin(angle) / 2}
          x2={0.5 + Math.cos(angle) / 2}
          y2={0.5 + Math.sin(angle) / 2}
        >
          {stops.map((s, i) => (
            <stop key={i} offset={stops.length === 1 ? 0 : i / (stops.length - 1)} stopColor={s} />
          ))}
        </linearGradient>
        {pattern}
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect y={top} width={W} height={H - top} fill={`url(#${grad})`} />
        {pattern ? (
          <rect
            y={top}
            width={W}
            height={H - top}
            fill={`url(#${doodle})`}
            opacity={t.doodleOpacity}
          />
        ) : null}
        {/* header */}
        <rect width={W} height={top} fill={APP_BG[mode]} />
        <rect y={top - 1} width={W} height={1} fill={APP_BORDER[mode]} />
        <circle cx={28} cy={26} r={15} fill={mode === 'light' ? '#f4f4f5' : '#18181b'} />
        <text x={52} y={23} fontSize={13.5} fontWeight={700} fill={APP_FG[mode]} fontFamily={FONT}>
          {spec.label}
        </text>
        <text x={52} y={39} fontSize={10.5} fill={t.accentText} fontWeight={600} fontFamily={FONT}>
          Bob is typing
        </text>
        {/* day pill */}
        <rect
          x={W / 2 - 26}
          y={top + 12}
          width={52}
          height={20}
          rx={10}
          fill={t.surface}
          stroke={t.border}
        />
        <text
          x={W / 2}
          y={top + 25.5}
          fontSize={10}
          textAnchor="middle"
          fill={t.meta}
          fontFamily={FONT}
        >
          Today
        </text>
        {/* Bob */}
        <text x={46} y={top + 52} fontSize={10} fontWeight={600} fill={bob.name} fontFamily={FONT}>
          Bob
        </text>
        <circle cx={24} cy={top + 74} r={11} fill={bob.name} opacity={0.9} />
        <Bubble
          x={40}
          y={top + 58}
          text="Forecast looks clear!"
          fill={bob.bubble}
          color={bob.onBubble}
          outline={outline}
        />
        {/* Carol, with a link */}
        <text
          x={46}
          y={top + 110}
          fontSize={10}
          fontWeight={600}
          fill={carol.name}
          fontFamily={FONT}
        >
          Carol
        </text>
        <circle cx={24} cy={top + 150} r={11} fill={carol.name} opacity={0.9} />
        <Bubble
          x={40}
          y={top + 116}
          text="Trail map is here"
          link="maps.example/trail"
          linkColor={t.accentText}
          fill={carol.bubble}
          color={carol.onBubble}
          outline={outline}
        />
        {/* yours */}
        <Bubble
          x={W - 16}
          y={top + 182}
          text="Bringing snacks 🍪"
          fill={t.mine}
          color={t.onMine}
          outline={outline}
          right
        />
        <Bubble
          x={W - 16}
          y={top + 218}
          text="See you at 7!"
          fill={t.mine}
          color={t.onMine}
          outline={outline}
          right
        />
        <text
          x={W - 18}
          y={top + 266}
          fontSize={9.5}
          textAnchor="end"
          fill={t.meta}
          fontFamily={FONT}
        >
          ✓ Sent
        </text>
        {/* theme notice */}
        <text
          x={W / 2}
          y={top + 296}
          fontSize={10}
          textAnchor="middle"
          fill={t.meta}
          fontFamily={FONT}
        >
          Bob changed the theme to {spec.label} ·{' '}
          <tspan fill={t.accentText} fontWeight={600}>
            Change
          </tspan>
        </text>
        {/* DM-style other bubble (no member tint) */}
        <Bubble
          x={16}
          y={top + 312}
          text="Nice, theme looks great"
          fill={t.theirs}
          color={t.onTheirs}
          outline={outline}
        />
        {/* composer */}
        <rect
          x={12}
          y={H - 50}
          width={W - 24}
          height={38}
          rx={19}
          fill={t.surface}
          stroke={t.border}
        />
        <text x={30} y={H - 26.5} fontSize={12} fill={t.meta} fontFamily={FONT}>
          Message {spec.label}
        </text>
        <circle cx={W - 32} cy={H - 31} r={13} fill={t.accent} />
        <path
          d={`M${W - 32} ${H - 25} V${H - 37} M${W - 37} ${H - 32} L${W - 32} ${H - 37} L${W - 27} ${H - 32}`}
          stroke={t.onAccent}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <rect
        width={W}
        height={H}
        rx={22}
        fill="none"
        stroke={mode === 'light' ? '#d4d4d8' : '#3f3f46'}
      />
    </g>
  );
}

function Board({ specs }: { specs: ThemeSpec[] }) {
  const COLS = 3;
  const GAP = 24;
  const PAIR = W * 2 + 14;
  const CELL_W = PAIR + 56;
  const CELL_H = H + 70;
  const rows = Math.ceil(specs.length / COLS);
  const width = COLS * CELL_W + 40;
  const height = rows * CELL_H + 40;
  const cells: ReactNode[] = specs.map((spec, i) => {
    const cx = 40 + (i % COLS) * CELL_W;
    const cy = 40 + Math.floor(i / COLS) * CELL_H;
    return (
      <g key={spec.id}>
        <text x={cx} y={cy + 16} fontSize={20} fontWeight={700} fill="#18181b" fontFamily={FONT}>
          {spec.label}
        </text>
        <text
          x={cx + PAIR}
          y={cy + 16}
          fontSize={12}
          textAnchor="end"
          fill="#71717a"
          fontFamily={FONT}
        >
          {spec.accent} · {spec.wall} · {spec.doodle} · {spec.bubble}
        </text>
        <MiniChat spec={spec} mode="light" x={cx} y={cy + 30} />
        <MiniChat spec={spec} mode="dark" x={cx + W + 14} y={cy + 30} />
      </g>
    );
  });
  void GAP;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      <rect width={width} height={height} fill="#f6f5f2" />
      {cells}
    </svg>
  );
}

/** The building blocks of a custom theme: accents with text on them, wallpapers and doodles in both modes. */
function Catalog() {
  const SW = 150;
  const rows: ReactNode[] = [];
  let y = 40;
  const title = (t: string) => {
    rows.push(
      <text
        key={`t${y}`}
        x={40}
        y={y + 20}
        fontSize={22}
        fontWeight={700}
        fill="#18181b"
        fontFamily={FONT}
      >
        {t}
      </text>,
    );
    y += 40;
  };
  title('Accents (your bubbles) · light / dark');
  ACCENTS.forEach((a, i) => {
    const x = 40 + (i % 7) * (SW + 20);
    const yy = y + Math.floor(i / 7) * 96;
    (['light', 'dark'] as const).forEach((mode, j) => {
      const t = resolveTheme(
        themeSpec({ v: 1, preset: 'custom', accent: a.id, wall: 'plain' }),
        mode,
      );
      rows.push(
        <g key={`${a.id}${mode}`} transform={`translate(${x} ${yy + j * 40})`}>
          <rect
            width={SW}
            height={34}
            rx={17}
            fill={mode === 'light' ? '#ffffff' : '#09090b'}
            stroke="#d4d4d8"
          />
          <rect x={6} y={5} width={SW - 12} height={24} rx={12} fill={t.mine} />
          <text
            x={SW / 2}
            y={21.5}
            fontSize={12}
            textAnchor="middle"
            fill={t.onMine}
            fontFamily={FONT}
          >
            {a.label}
          </text>
        </g>,
      );
    });
  });
  y += Math.ceil(ACCENTS.length / 7) * 96 + 20;
  title('Wallpapers · light / dark');
  WALLS.forEach((w, i) => {
    const x = 40 + (i % 7) * (SW + 20);
    const yy = y + Math.floor(i / 7) * 130;
    (['light', 'dark'] as const).forEach((mode, j) => {
      const id = nextId('wg');
      const f = w[mode];
      rows.push(
        <g key={`${w.id}${mode}`} transform={`translate(${x + j * (SW / 2)} ${yy})`}>
          <defs>
            <linearGradient id={id} x1={0} y1={0} x2={0.3} y2={1}>
              {f.stops.map((s, k) => (
                <stop
                  key={k}
                  offset={f.stops.length === 1 ? 0 : k / (f.stops.length - 1)}
                  stopColor={s}
                />
              ))}
            </linearGradient>
          </defs>
          <rect width={SW / 2} height={96} rx={j === 0 ? 0 : 0} fill={`url(#${id})`} />
        </g>,
      );
    });
    rows.push(
      <g key={`${w.id}lbl`}>
        <rect x={x} y={yy} width={SW} height={96} rx={14} fill="none" stroke="#d4d4d8" />
        <text x={x} y={yy + 114} fontSize={12} fill="#3f3f46" fontFamily={FONT}>
          {w.label}
        </text>
      </g>,
    );
  });
  y += Math.ceil(WALLS.length / 7) * 130 + 20;
  title('Doodles');
  DOODLES.filter((d) => d.kind !== 'none').forEach((d, i) => {
    const x = 40 + (i % 8) * (SW + 10);
    const yy = y + Math.floor(i / 8) * 190;
    const id = nextId('dp');
    const pattern = doodlePattern(d.id, '#3f3f46', id, 0.7);
    rows.push(
      <g key={d.id} transform={`translate(${x} ${yy})`}>
        <defs>{pattern}</defs>
        <rect width={SW} height={160} rx={14} fill="#ffffff" stroke="#d4d4d8" />
        <rect width={SW} height={160} rx={14} fill={`url(#${id})`} opacity={0.55} />
        <text x={0} y={178} fontSize={12} fill="#3f3f46" fontFamily={FONT}>
          {d.label}
        </text>
      </g>,
    );
  });
  y += Math.ceil((DOODLES.length - 1) / 8) * 190 + 20;
  const width = 40 + 8 * (SW + 10) + 40;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={y + 20}
      viewBox={`0 0 ${width} ${y + 20}`}
    >
      <rect width={width} height={y + 20} fill="#f6f5f2" />
      {rows}
    </svg>
  );
}

const [out = 'theme-board.svg', only] = process.argv.slice(2);
if (only === 'catalog') {
  writeFileSync(out, renderToStaticMarkup(<Catalog />));
  console.log(`wrote ${out} (catalog)`);
} else {
  const ids = only ? only.split(',') : PRESETS.map((p) => p.id);
  const specs = ids.map((id) => themeSpec({ v: 1, preset: id }));
  writeFileSync(out, renderToStaticMarkup(<Board specs={specs} />));
  console.log(`wrote ${out} (${specs.length} themes)`);
}
void React;
