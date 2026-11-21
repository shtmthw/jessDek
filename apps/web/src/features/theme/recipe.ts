import { ACCENTS, BUBBLES, byId, DOODLES, WALLS, type BubbleStyle } from './catalog';
import { CLASSIC, presetById, type Preset } from './presets';

/**
 * A chat theme as stored on the conversation (JSON, at most 512 bytes; the server checks only the
 * shape). `preset` names a ready-made theme; `custom` builds one from the other four keys.
 */
export interface ThemeRecipe {
  v: 1;
  preset: string;
  accent?: string;
  wall?: string;
  doodle?: string;
  bubble?: string;
}

/** A theme with every part decided: what the chat draws. */
export interface ThemeSpec {
  /** The preset's id, or `custom`. */
  id: string;
  label: string;
  accent: string;
  wall: string;
  doodle: string;
  bubble: BubbleStyle;
  /** The app's own look: draw nothing extra and change no colours. */
  classic: boolean;
}

export const THEME_MAX_BYTES = 512;
export const CUSTOM = 'custom';

const fromPreset = (p: Preset): ThemeSpec => ({ ...p, classic: p.id === CLASSIC.id });

/** Reads a stored theme. Null, broken JSON and unknown presets all mean Classic. */
export function parseTheme(raw: string | null | undefined): ThemeRecipe | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const o = value as Record<string, unknown>;
    const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : undefined);
    const preset = str('preset');
    if (!preset) return null;
    if (preset !== CUSTOM) return presetById(preset) ? { v: 1, preset } : null;
    return {
      v: 1,
      preset,
      accent: str('accent'),
      wall: str('wall'),
      doodle: str('doodle'),
      bubble: str('bubble'),
    };
  } catch {
    return null;
  }
}

/** The theme to draw for a recipe (null: Classic). Unknown parts fall back to the first option. */
export function themeSpec(recipe: ThemeRecipe | null): ThemeSpec {
  if (!recipe) return fromPreset(CLASSIC);
  if (recipe.preset !== CUSTOM) return fromPreset(presetById(recipe.preset) ?? CLASSIC);
  return {
    id: CUSTOM,
    label: 'Custom',
    accent: byId(ACCENTS, recipe.accent).id,
    wall: byId(WALLS, recipe.wall).id,
    doodle: byId(DOODLES, recipe.doodle).id,
    bubble: byId(BUBBLES, recipe.bubble).id,
    classic: false,
  };
}

/** What to store: null for Classic, a preset by name, or every part of a custom theme. */
export function serializeTheme(spec: ThemeSpec): string | null {
  if (spec.id !== CUSTOM)
    return spec.id === CLASSIC.id ? null : JSON.stringify({ v: 1, preset: spec.id });
  const { accent, wall, doodle, bubble } = spec;
  return JSON.stringify({ v: 1, preset: CUSTOM, accent, wall, doodle, bubble });
}

/** A custom theme starting from `base` (the theme sheet's Custom tab begins from the current theme). */
export const customFrom = (base: ThemeSpec, patch: Partial<ThemeSpec> = {}): ThemeSpec => ({
  ...base,
  ...patch,
  id: CUSTOM,
  label: 'Custom',
  classic: false,
});

export const sameTheme = (a: ThemeSpec, b: ThemeSpec) => serializeTheme(a) === serializeTheme(b);
