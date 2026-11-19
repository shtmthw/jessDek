import type { Item } from './art';
import {
  EYE_COLORS,
  GLASSES_COLORS,
  HAIR_COLORS,
  ITEM_COLORS,
  SKINS,
  type Swatch,
} from './palettes';
import { CLIPS, EARRINGS, GLASSES } from './parts/accessories';
import { NECKS, TOPS } from './parts/clothes';
import { BROWS, BUILDS, CHEEKS, EYES, FACES, LINES, MARKS, MOUTHS, NOSES } from './parts/face';
import { HAIRS } from './parts/hair';
import { HATS } from './parts/hats';
import { PETS } from './parts/pets';

/**
 * Every customisable slot, in recipe order. `items` slots pick a drawing; `colors` slots pick a
 * swatch. The first entry of each list is never assumed to be the default (see DEFAULT_RECIPE).
 */
export const SLOTS = {
  skin: { kind: 'colors', swatches: SKINS },
  face: { kind: 'items', items: FACES as Record<string, { label: string }> },
  eyes: { kind: 'items', items: EYES as Record<string, Item> },
  eyeColor: { kind: 'colors', swatches: EYE_COLORS },
  brows: { kind: 'items', items: BROWS as Record<string, Item> },
  nose: { kind: 'items', items: NOSES as Record<string, Item> },
  mouth: { kind: 'items', items: MOUTHS as Record<string, Item> },
  cheeks: { kind: 'items', items: CHEEKS as Record<string, Item> },
  mark: { kind: 'items', items: MARKS as Record<string, Item> },
  clip: { kind: 'items', items: CLIPS as Record<string, Item> },
  clipColor: { kind: 'colors', swatches: ITEM_COLORS },
  hair: { kind: 'items', items: HAIRS as Record<string, Item> },
  hairColor: { kind: 'colors', swatches: HAIR_COLORS },
  hat: { kind: 'items', items: HATS as Record<string, Item> },
  hatColor: { kind: 'colors', swatches: ITEM_COLORS },
  glasses: { kind: 'items', items: GLASSES as Record<string, Item> },
  glassesColor: { kind: 'colors', swatches: GLASSES_COLORS },
  earrings: { kind: 'items', items: EARRINGS as Record<string, Item> },
  earringColor: { kind: 'colors', swatches: ITEM_COLORS },
  neck: { kind: 'items', items: NECKS as Record<string, Item> },
  neckColor: { kind: 'colors', swatches: ITEM_COLORS },
  top: { kind: 'items', items: TOPS as Record<string, Item> },
  topColor: { kind: 'colors', swatches: ITEM_COLORS },
  topAccent: { kind: 'colors', swatches: ITEM_COLORS },
  pet: { kind: 'items', items: PETS as Record<string, Item> },
  /** Outline weight for the whole drawing: the classic bold line, or the finer one the specials use. */
  line: { kind: 'items', items: LINES as Record<string, { label: string }> },
  /** Neck and shoulders. Only the specials use `slim`; the studio doesn't offer it. */
  build: { kind: 'items', items: BUILDS as Record<string, { label: string }> },
} as const satisfies Record<
  string,
  | { kind: 'items'; items: Record<string, { label: string }> }
  | { kind: 'colors'; swatches: readonly Swatch[] }
>;

export type SlotId = keyof typeof SLOTS;

/** The ids a slot accepts, in display order. */
export function slotIds(slot: SlotId): string[] {
  const s = SLOTS[slot];
  return s.kind === 'items' ? Object.keys(s.items) : s.swatches.map((w) => w.id);
}

export function slotLabel(slot: SlotId, id: string): string {
  const s = SLOTS[slot];
  if (s.kind === 'items') return s.items[id]?.label ?? id;
  return s.swatches.find((w) => w.id === id)?.label ?? id;
}
