import { SLOTS, slotIds, type SlotId } from './catalog';

/**
 * An avatar recipe: which item fills each slot. This is what the server stores (as JSON), so keep
 * it small and forgiving: anything missing or unknown falls back to the default for that slot.
 */
export type Recipe = { v: 1; style: 'character' | 'initials' } & Record<SlotId, string>;

/** Everyone starts as this character until they customise. */
export const DEFAULT_RECIPE: Readonly<Recipe> = Object.freeze({
  v: 1,
  style: 'character',
  skin: 'peach',
  face: 'soft',
  eyes: 'dot',
  eyeColor: 'ink',
  brows: 'none',
  nose: 'curve',
  mouth: 'smile',
  cheeks: 'blush',
  mark: 'none',
  clip: 'none',
  clipColor: 'jade',
  hair: 'short',
  hairColor: 'black',
  hat: 'none',
  hatColor: 'red',
  glasses: 'none',
  glassesColor: 'ink',
  earrings: 'none',
  earringColor: 'gold',
  neck: 'none',
  neckColor: 'rose',
  top: 'tee',
  topColor: 'indigo',
  topAccent: 'jade',
  pet: 'none',
  line: 'bold',
  build: 'classic',
});

const SLOT_KEYS = Object.keys(SLOTS) as SlotId[];

/** Fills gaps and drops anything this build doesn't know. */
export function normalizeRecipe(input: unknown): Recipe {
  const src = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const out = { ...DEFAULT_RECIPE } as Recipe;
  out.style = src.style === 'initials' ? 'initials' : 'character';
  for (const slot of SLOT_KEYS) {
    const value = src[slot];
    if (typeof value === 'string' && slotIds(slot).includes(value)) out[slot] = value;
  }
  return out;
}

// Recipes arrive as JSON strings from the server and are rendered many times over (every message
// run, every list row), so parsing is cached per distinct string.
const cache = new Map<string, Recipe>();
const CACHE_MAX = 400;

/** `null`/`undefined` (never customised) and anything unreadable give the default character. */
export function parseRecipe(raw: string | null | undefined): Recipe {
  if (!raw) return DEFAULT_RECIPE as Recipe;
  const hit = cache.get(raw);
  if (hit) return hit;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  const recipe = normalizeRecipe(parsed);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(raw, recipe);
  return recipe;
}

/** Stable key order, so equal recipes give equal strings. */
export function serializeRecipe(r: Recipe): string {
  const out: Record<string, string | number> = { v: 1, style: r.style };
  for (const slot of SLOT_KEYS) out[slot] = r[slot];
  return JSON.stringify(out);
}

export const sameRecipe = (a: Recipe, b: Recipe) => serializeRecipe(a) === serializeRecipe(b);

/** How likely a random avatar is to have *something* in an optional slot. */
const WEAR_CHANCE: Partial<Record<SlotId, number>> = {
  brows: 0.5,
  mark: 0.25,
  clip: 0.2,
  hat: 0.55,
  glasses: 0.3,
  earrings: 0.35,
  neck: 0.35,
  pet: 0.35,
};

/** A fun random look. Keeps the drawing style (`style`) as it was. */
export function randomRecipe(from: Recipe, rand: () => number = Math.random): Recipe {
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)]!;
  const out = { ...from };
  for (const slot of SLOT_KEYS) {
    // Line weight and build are drawing styles, like initials: Randomize keeps them.
    if (slot === 'line' || slot === 'build') continue;
    const ids = slotIds(slot);
    const chance = WEAR_CHANCE[slot];
    if (chance !== undefined) {
      const rest = ids.filter((id) => id !== 'none');
      out[slot] = rand() < chance && rest.length > 0 ? pick(rest) : 'none';
    } else {
      out[slot] = pick(ids);
    }
  }
  return out;
}
