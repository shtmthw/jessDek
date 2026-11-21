import { ACCENTS, byId, DOODLES, MEMBER_COLORS, WALLS, type Fill } from './catalog';
import { average, contrast, ensureContrast, INK, luminance, mix, WHITE } from './color';
import type { ThemeSpec } from './recipe';

export type Mode = 'light' | 'dark';

/** Every colour a themed chat needs in one mode. See THEMES_PLAN.md §3.1. */
export interface ThemeTokens {
  /** The wallpaper as a CSS background. */
  wall: string;
  wallFill: Fill;
  /** A colour standing for the wallpaper (a gradient's average), for contrast and mixing. */
  wallBase: string;
  doodle: string;
  doodleOpacity: number;
  /** The accent fill (send button, the "new messages" pill) and the text on it. */
  accent: string;
  onAccent: string;
  /** The accent as text on the wallpaper, on others' bubbles and on the app background. */
  accentText: string;
  /** Your bubbles. */
  mine: string;
  onMine: string;
  /** Other people's bubbles. */
  theirs: string;
  onTheirs: string;
  /** The ink of outlined bubbles (outline style only). */
  outline: string;
  /** Timestamps, day labels and names over the wallpaper. */
  meta: string;
  /** Small surfaces over the wallpaper: day pills, reaction chips, the composer. */
  surface: string;
  muted: string;
  border: string;
}

/** The app's own colours (index.css). Classic uses exactly these. */
const APP = {
  light: {
    background: '#ffffff',
    brand: '#4f46e5',
    brandText: '#4f46e5',
    bubble: '#f4f4f5',
    foreground: '#18181b',
    meta: '#6b6b74',
    muted: '#f4f4f5',
    border: '#e4e4e7',
  },
  dark: {
    background: '#09090b',
    brand: '#5850ec',
    brandText: '#818cf8',
    bubble: '#1c1c21',
    foreground: '#fafafa',
    meta: '#a1a1aa',
    muted: '#18181b',
    border: '#27272a',
  },
} as const;

export const fillCss = (fill: Fill) =>
  fill.stops.length === 1
    ? fill.stops[0]!
    : `linear-gradient(${fill.angle ?? 180}deg, ${fill.stops.join(', ')})`;

/** Strength of each doodle layer, by mode. Line drawings take more than filled shapes. */
const DOODLE_STRENGTH: Record<string, number> = {
  scatter: 1,
  hearts: 0.62,
  stars: 0.7,
  dots: 0.55,
  clouds: 0.55,
  confetti: 0.62,
  sprinkles: 0.6,
  waves: 0.6,
  bubbles: 0.5,
  grid: 0.7,
};

/** A bubble fill that white or ink text reads on at 4.5:1, darkening it if neither does. */
function readableFill(fill: string): { fill: string; text: string } {
  if (contrast(WHITE, fill) >= 4.5) return { fill, text: WHITE };
  if (contrast(INK, fill) >= 4.5) return { fill, text: INK };
  for (let t = 0.05; t <= 1; t += 0.05) {
    const darker = mix(fill, INK, t);
    if (contrast(WHITE, darker) >= 4.5) return { fill: darker, text: WHITE };
  }
  return { fill: INK, text: WHITE };
}

/** `fg` made readable on every one of `bgs`. */
const readableOnAll = (fg: string, bgs: readonly string[], ratio = 4.5) => {
  let out = fg;
  for (let i = 0; i < 3; i++) for (const bg of bgs) out = ensureContrast(out, bg, ratio);
  return out;
};

export function resolveTheme(spec: ThemeSpec, mode: Mode): ThemeTokens {
  const app = APP[mode];
  const dark = mode === 'dark';
  const wall = byId(WALLS, spec.wall);
  const wallFill = spec.classic ? { stops: [app.background] } : wall[mode];
  const wallBase = average(wallFill.stops);
  const accentDef = byId(ACCENTS, spec.accent);

  if (spec.classic) {
    return {
      wall: app.background,
      wallFill,
      wallBase,
      doodle: app.meta,
      doodleOpacity: 0,
      accent: app.brand,
      onAccent: WHITE,
      accentText: app.brandText,
      mine: app.brand,
      onMine: WHITE,
      theirs: app.bubble,
      onTheirs: app.foreground,
      outline: app.foreground,
      meta: app.meta,
      surface: app.background,
      muted: app.muted,
      border: app.border,
    };
  }

  const solid = readableFill(accentDef[mode]);
  // Others' bubbles are a lighter wallpaper; on a near-white wall, a touch darker instead.
  const theirs = dark
    ? mix(wallBase, WHITE, 0.1)
    : luminance(wallBase) > 0.9
      ? mix(wallBase, INK, 0.045)
      : mix(wallBase, WHITE, 0.8);
  const onTheirs = dark ? '#fafafa' : INK;
  const surface = dark ? mix(wallBase, WHITE, 0.07) : mix(wallBase, WHITE, 0.88);
  const accentText = readableOnAll(dark ? mix(solid.fill, WHITE, 0.25) : solid.fill, [
    wallBase,
    theirs,
    surface,
    app.background,
  ]);

  let mine = solid.fill;
  let onMine = solid.text;
  if (spec.bubble === 'soft') {
    mine = dark ? mix(accentDef.dark, '#09090b', 0.58) : mix(accentDef.light, WHITE, 0.78);
    onMine = readableOnAll(
      dark ? mix(accentDef.dark, WHITE, 0.6) : mix(accentDef.light, INK, 0.45),
      [mine],
      4.8,
    );
  }

  const meta = readableOnAll(dark ? mix(wallBase, WHITE, 0.58) : mix(wallBase, INK, 0.58), [
    wallBase,
    ...wallFill.stops,
  ]);
  const doodle = dark ? mix(accentText, WHITE, 0.35) : mix(accentText, INK, 0.25);
  const kind = byId(DOODLES, spec.doodle);
  const strength =
    kind.kind === 'none'
      ? 0
      : (DOODLE_STRENGTH[kind.kind === 'scatter' ? 'scatter' : kind.id] ?? 0.8);

  return {
    wall: fillCss(wallFill),
    wallFill,
    wallBase,
    doodle,
    doodleOpacity: +(strength * (dark ? 0.1 : 0.13)).toFixed(3),
    accent: solid.fill,
    onAccent: solid.text,
    accentText,
    mine,
    onMine,
    theirs,
    onTheirs,
    outline: dark ? mix(wallBase, WHITE, 0.55) : INK,
    meta,
    surface,
    muted: dark ? mix(wallBase, WHITE, 0.1) : mix(wallBase, INK, 0.06),
    border: dark ? mix(wallBase, WHITE, 0.14) : mix(wallBase, INK, 0.12),
  };
}

/** A group member's look in one mode: a tint on their bubbles and their name's colour. */
export interface MemberTokens {
  bubble: string;
  onBubble: string;
  name: string;
}

export function memberTokens(colorId: string, tokens: ThemeTokens, mode: Mode): MemberTokens {
  const color = byId(MEMBER_COLORS, colorId).color;
  const dark = mode === 'dark';
  const bubble = dark ? mix(color, tokens.theirs, 0.7) : mix(color, tokens.theirs, 0.8);
  const onBubble = dark ? '#fafafa' : INK;
  const name = readableOnAll(dark ? mix(color, WHITE, 0.15) : color, [
    tokens.wallBase,
    tokens.surface,
  ]);
  return { bubble, onBubble, name };
}

/** Accent ids that look like a member colour, so the automatic palette can skip it. */
const ACCENT_TWIN: Record<string, string> = {
  sky: 'sky',
  teal: 'teal',
  green: 'green',
  mint: 'green',
  orange: 'orange',
  lemon: 'gold',
  rose: 'rose',
  blush: 'rose',
  lilac: 'lilac',
  red: 'red',
  denim: 'denim',
  cocoa: 'tan',
};

/**
 * Each member's colour id. Members (in join order, so everyone sees the same colours) take the
 * palette in turn, skipping the theme's accent; a colour someone picked for themselves wins.
 */
export function assignMemberColors(
  memberIds: readonly string[],
  picked: ReadonlyArray<{ userId: string; color: string }>,
  accentId: string,
): Map<string, string> {
  const palette = MEMBER_COLORS.filter((c) => c.id !== ACCENT_TWIN[accentId]).map((c) => c.id);
  const chosen = new Map(
    picked
      .filter((p) => MEMBER_COLORS.some((c) => c.id === p.color))
      .map((p) => [p.userId, p.color]),
  );
  const out = new Map<string, string>();
  memberIds.forEach((id, i) => out.set(id, chosen.get(id) ?? palette[i % palette.length]!));
  return out;
}

type Vars = Record<`--${string}`, string>;

/** CSS variables for a themed chat, both modes at once (index.css picks one with `.dark`). */
export function themeVars(spec: ThemeSpec): Vars {
  if (spec.classic) return {};
  const out: Vars = {};
  for (const mode of ['light', 'dark'] as const) {
    const t = resolveTheme(spec, mode);
    const p = mode === 'light' ? '--l' : '--d';
    Object.assign(out, {
      [`${p}-wall`]: t.wall,
      [`${p}-doodle`]: t.doodle,
      [`${p}-doodle-opacity`]: String(t.doodleOpacity),
      [`${p}-accent`]: t.accent,
      [`${p}-on-accent`]: t.onAccent,
      [`${p}-accent-text`]: t.accentText,
      [`${p}-mine`]: t.mine,
      [`${p}-on-mine`]: t.onMine,
      [`${p}-theirs`]: t.theirs,
      [`${p}-on-theirs`]: t.onTheirs,
      [`${p}-outline`]: t.outline,
      [`${p}-meta`]: t.meta,
      [`${p}-surface`]: t.surface,
      [`${p}-muted`]: t.muted,
      [`${p}-border`]: t.border,
    });
  }
  return out;
}

/** CSS variables for one member's runs in a group, both modes. */
export function memberVars(spec: ThemeSpec, colorId: string): Vars {
  const out: Vars = {};
  for (const mode of ['light', 'dark'] as const) {
    const m = memberTokens(colorId, resolveTheme(spec, mode), mode);
    const p = mode === 'light' ? '--l' : '--d';
    out[`${p}-member-bubble`] = m.bubble;
    out[`${p}-member-on-bubble`] = m.onBubble;
    out[`${p}-member-name`] = m.name;
  }
  return out;
}
