import { BACKGROUNDS, optionIds, STYLE_OPTIONS, type StyleKey } from './catalog';
import { interestById } from './interests';
import { isStickerId } from './stickerIds';

/**
 * A card recipe: the person's own words plus every style choice. This is what the server stores
 * (CARDS_PLAN.md §2), so it stays small and forgiving: anything missing or unknown falls back to
 * the default, and anything over a limit is trimmed rather than refused.
 */

export const ABOUT_MAX = 150;
export const ABOUT_LINES = 4;
export const INTERESTS_MAX = 6;
export const CUSTOM_MAX = 18;
export const STICKERS_MAX = 8;
export const STICKER_SCALE = { min: 0.4, max: 2.5 } as const;

/** A built-in interest id, or one the person wrote themselves (`t`) with an optional emoji (`e`). */
export type Interest = string | { t: string; e?: string };

/** `k` names a drawn sticker, `e` is an emoji. Position is the centre, as a fraction of the card. */
export type Sticker = ({ k: string; e?: undefined } | { e: string; k?: undefined }) & {
  x: number;
  y: number;
  /** 1 = 56 layout px. */
  s: number;
  /** Degrees. */
  r: number;
  /** Colour id for drawn stickers that take one. */
  c?: string;
};

export type CardRecipe = {
  v: 1;
  about: string;
  interests: Interest[];
  labels: boolean;
  stickers: Sticker[];
} & Record<StyleKey, string>;

/** The sketch everyone starts from. */
export const DEFAULT_CARD: Readonly<CardRecipe> = Object.freeze({
  v: 1,
  about: '',
  interests: [],
  labels: true,
  stickers: [],
  layout: 'classic',
  name: 'username',
  align: 'center',
  font: 'clean',
  bg: 'paper',
  pattern: 'none',
  patternTone: 'soft',
  ink: 'auto',
  accent: 'indigo',
  border: 'sketch',
  borderColor: 'ink',
  corners: 'soft',
  finish: 'matte',
  frame: 'circle',
  frameBg: 'avatar',
  ring: 'none',
  divider: 'sketch',
  chips: 'plain',
  button: 'sketch',
});

const STYLE_KEYS = Object.keys(STYLE_OPTIONS) as StyleKey[];
const VALID = Object.fromEntries(STYLE_KEYS.map((k) => [k, new Set(optionIds(k))])) as Record<
  StyleKey,
  Set<string>
>;

/** Characters as people count them (code points, so an emoji counts once, not twice). */
export const charCount = (s: string) => [...s].length;
const clip = (s: string, n: number) => [...s].slice(0, n).join('');

let oneEmoji: RegExp | null = null;
try {
  oneEmoji = new RegExp('^\\p{RGI_Emoji}$', 'v');
} catch {
  /* very old browser: accept short strings below */
}
export const isEmoji = (s: string) =>
  oneEmoji ? oneEmoji.test(s) : s.length > 0 && s.length <= 16 && !/[\p{L}\p{N}\s]/u.test(s);

/** Control characters (C0 and DEL), optionally keeping line feeds. */
const isControl = (ch: string, keepNewline: boolean) => {
  const c = ch.charCodeAt(0);
  return (c < 32 || c === 127) && !(keepNewline && c === 10);
};
const dropControls = (s: string, keepNewline: boolean, by = '') =>
  [...s].map((ch) => (isControl(ch, keepNewline) ? by : ch)).join('');

/** The about text as the server stores it: LF only, no control characters, no trailing spaces. */
export function cleanAbout(text: string): string {
  return dropControls(text.replace(/\r\n?/g, '\n'), true)
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

/** The same, cut to fit: at most ABOUT_LINES lines and ABOUT_MAX characters. */
export function fitAbout(text: string): string {
  const lines = cleanAbout(text).split('\n');
  const kept = lines.slice(0, ABOUT_LINES - 1);
  const rest = lines.slice(ABOUT_LINES - 1).join(' ');
  if (lines.length >= ABOUT_LINES) kept.push(rest);
  return clip(kept.join('\n'), ABOUT_MAX).trim();
}

/** One-line custom interest name. */
export const cleanCustom = (t: string) =>
  clip(dropControls(t, false, ' ').replace(/\s+/g, ' ').trim(), CUSTOM_MAX).trim();

export const interestKey = (it: Interest) =>
  typeof it === 'string' ? `id:${it}` : `t:${it.t.toLocaleLowerCase()}`;

function normalizeInterests(input: unknown): Interest[] {
  if (!Array.isArray(input)) return [];
  const out: Interest[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    let it: Interest | null = null;
    if (typeof raw === 'string') {
      if (interestById(raw)) it = raw;
    } else if (raw && typeof raw === 'object') {
      const { t, e } = raw as { t?: unknown; e?: unknown };
      const name = typeof t === 'string' ? cleanCustom(t) : '';
      if (name) it = typeof e === 'string' && isEmoji(e) ? { t: name, e } : { t: name };
    }
    if (!it || seen.has(interestKey(it))) continue;
    seen.add(interestKey(it));
    out.push(it);
    if (out.length === INTERESTS_MAX) break;
  }
  return out;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/** Keeps a sticker inside the limits, rounded the way the server stores it. */
export function tidySticker(s: Sticker): Sticker {
  const base = s.k !== undefined ? { k: s.k } : { e: s.e! };
  const out: Sticker = {
    ...base,
    x: round(clamp(s.x, 0, 1), 3),
    y: round(clamp(s.y, 0, 1), 3),
    s: round(clamp(s.s, STICKER_SCALE.min, STICKER_SCALE.max), 2),
    r: Math.round(((((s.r + 180) % 360) + 360) % 360) - 180),
  } as Sticker;
  if (s.c && /^[a-z0-9-]{1,24}$/.test(s.c)) out.c = s.c;
  return out;
}

function normalizeStickers(input: unknown): Sticker[] {
  if (!Array.isArray(input)) return [];
  const out: Sticker[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const src = raw as Record<string, unknown>;
    const k = typeof src.k === 'string' && isStickerId(src.k) ? src.k : undefined;
    const e = typeof src.e === 'string' && isEmoji(src.e) ? src.e : undefined;
    if ((k === undefined) === (e === undefined)) continue;
    out.push(
      tidySticker({
        ...(k !== undefined ? { k } : { e: e! }),
        x: num(src.x, 0.5),
        y: num(src.y, 0.5),
        s: num(src.s, 1),
        r: num(src.r, 0),
        c: typeof src.c === 'string' ? src.c : undefined,
      } as Sticker),
    );
    if (out.length === STICKERS_MAX) break;
  }
  return out;
}

/** Fills gaps and drops anything this build doesn't know. */
export function normalizeCard(input: unknown): CardRecipe {
  const src = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const out = { ...DEFAULT_CARD } as CardRecipe;
  for (const key of STYLE_KEYS) {
    const value = src[key];
    if (typeof value === 'string' && VALID[key].has(value)) out[key] = value;
  }
  out.labels = typeof src.labels === 'boolean' ? src.labels : DEFAULT_CARD.labels;
  out.about = typeof src.about === 'string' ? fitAbout(src.about) : '';
  out.interests = normalizeInterests(src.interests);
  out.stickers = normalizeStickers(src.stickers);
  return out;
}

// Cards arrive as JSON strings and can be drawn several times on a page, so parsing is cached.
const cache = new Map<string, CardRecipe>();
const CACHE_MAX = 100;

/** `null`/`undefined` (never customised) and anything unreadable give the default card. */
export function parseCard(raw: string | null | undefined): CardRecipe {
  if (!raw) return DEFAULT_CARD as CardRecipe;
  const hit = cache.get(raw);
  if (hit) return hit;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  const card = normalizeCard(parsed);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(raw, card);
  return card;
}

/** Stable key order, so equal cards give equal strings. */
export function serializeCard(r: CardRecipe): string {
  const out: Record<string, unknown> = {
    v: 1,
    about: fitAbout(r.about),
    interests: r.interests,
    labels: r.labels,
  };
  for (const key of STYLE_KEYS) out[key] = r[key];
  out.stickers = r.stickers.map(tidySticker);
  return JSON.stringify(out);
}

export const sameCard = (a: CardRecipe, b: CardRecipe) => serializeCard(a) === serializeCard(b);

/** A fresh random look. Never touches the words, the interests, the stickers or how the name shows. */
export function randomStyle(from: CardRecipe, rand: () => number = Math.random): CardRecipe {
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)]!;
  const out = { ...from };
  for (const key of STYLE_KEYS) {
    if (key === 'name') continue;
    out[key] = pick(optionIds(key));
  }
  // Keep it readable and not too busy: text colour follows the background, border colours that
  // could vanish into it are avoided, and patterns and fancy finishes come up half as often.
  out.ink = 'auto';
  const dark = BACKGROUNDS.find((b) => b.id === out.bg)?.dark ?? false;
  out.borderColor = pick(dark ? ['accent', 'white'] : ['accent', 'ink', 'ink']);
  if (rand() < 0.5) out.pattern = 'none';
  if (rand() < 0.5) out.finish = 'matte';
  return out;
}
