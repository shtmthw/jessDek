import { DEFAULT_RECIPE, sameRecipe, type Recipe } from './recipe';

/**
 * Ready-made characters in a finer, softer style: doe eyes, tiny mouths, thin lines. Each is an
 * ordinary recipe, so once picked, every slot can still be changed in the other tabs.
 */
export interface Special {
  id: string;
  label: string;
  recipe: Recipe;
}

/** What every special shares: fine lines, pale skin, the mochi face, blush, no nose. */
const BASE: Partial<Recipe> = {
  style: 'character',
  line: 'fine',
  build: 'slim',
  skin: 'ivory',
  face: 'mochi',
  eyes: 'doe',
  eyeColor: 'ink',
  brows: 'none',
  nose: 'none',
  mouth: 'pip',
  cheeks: 'faint',
  mark: 'none',
  clip: 'none',
  clipColor: 'jade',
  hat: 'none',
  hatColor: 'jade',
  glasses: 'none',
  glassesColor: 'ink',
  earrings: 'none',
  earringColor: 'jade',
  neck: 'none',
  neckColor: 'jade',
  topAccent: 'jade',
  pet: 'none',
};

const special = (id: string, label: string, look: Partial<Recipe>): Special => ({
  id,
  label,
  recipe: { ...DEFAULT_RECIPE, ...BASE, ...look } as Recipe,
});

export const SPECIALS: readonly Special[] = [
  special('beanie', 'Knit beanie', {
    hair: 'swoop',
    hairColor: 'ash',
    hat: 'knit',
    eyes: 'dreamy',
    neck: 'tag',
    top: 'sweater',
    topColor: 'white',
  }),
  special('spiky', 'Spiky', {
    hair: 'tousled',
    hairColor: 'black',
    brows: 'soft',
    mouth: 'tiny',
    earrings: 'huggies',
    neck: 'cross',
    neckColor: 'cream',
    top: 'turtleneck',
    topColor: 'jade',
  }),
  special('headphones', 'Headphones', {
    hair: 'curtain',
    hairColor: 'black',
    hat: 'headphones',
    clip: 'sparkle',
    glasses: 'round',
    neck: 'tie',
    top: 'blazer',
    topColor: 'white',
    topAccent: 'green',
  }),
  special('headband', 'Headband', {
    hair: 'hime',
    hairColor: 'black',
    hat: 'headband',
    eyes: 'lashy',
    earrings: 'studs',
    neck: 'beads',
    top: 'cami',
    topColor: 'jade',
  }),
  special('platinum', 'Platinum', {
    hair: 'swept',
    hairColor: 'ash',
    clip: 'sparkle',
    clipColor: 'white',
    mouth: 'tiny',
    earrings: 'huggies',
    top: 'print',
    topColor: 'black',
    topAccent: 'blush',
  }),
  special('snowcap', 'Snow cap', {
    hair: 'sleek',
    hairColor: 'black',
    hat: 'knit',
    hatColor: 'white',
    eyes: 'doewink',
    earrings: 'drops',
    top: 'patch',
    topColor: 'white',
  }),
  special('longhair', 'Long hair', {
    hair: 'veil',
    hairColor: 'ash',
    clip: 'sparkle',
    eyes: 'lashy',
    earrings: 'huggies',
    neck: 'collar',
    neckColor: 'black',
    top: 'sweater',
    topColor: 'white',
  }),
  special('hoodie', 'Hoodie', {
    hair: 'messy',
    hairColor: 'black',
    earrings: 'cuff',
    top: 'hoodie',
    topColor: 'grey',
  }),
  special('braid', 'Pink braid', {
    hair: 'braid',
    hairColor: 'pink',
    hat: 'mini-beret',
    hatColor: 'black',
    clip: 'sparkle',
    earrings: 'drops',
    top: 'checker',
    topColor: 'jade',
    topAccent: 'black',
  }),
];

/** The special this recipe is exactly (untouched since it was picked), if any. */
export const specialOf = (recipe: Recipe) => SPECIALS.find((s) => sameRecipe(s.recipe, recipe));
