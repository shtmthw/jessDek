/** Named colours the recipe refers to. Order is display order in the studio. */

export interface Swatch {
  id: string;
  label: string;
  color: string;
}

export const SKINS = [
  { id: 'ivory', label: 'Ivory', color: '#ffeee3' },
  { id: 'peach', label: 'Peach', color: '#fde3d3' },
  { id: 'sand', label: 'Sand', color: '#f6d1b1' },
  { id: 'beige', label: 'Beige', color: '#ebbd95' },
  { id: 'honey', label: 'Honey', color: '#dba476' },
  { id: 'caramel', label: 'Caramel', color: '#c78a59' },
  { id: 'bronze', label: 'Bronze', color: '#a96b40' },
  { id: 'chestnut', label: 'Chestnut', color: '#8a5433' },
  { id: 'espresso', label: 'Espresso', color: '#6b3f28' },
  { id: 'deep', label: 'Deep', color: '#4b2b1c' },
] as const satisfies readonly Swatch[];

export const HAIR_COLORS = [
  { id: 'black', label: 'Black', color: '#24201f' },
  { id: 'dark-brown', label: 'Dark brown', color: '#40291d' },
  { id: 'brown', label: 'Brown', color: '#6d4429' },
  { id: 'light-brown', label: 'Light brown', color: '#a06f45' },
  { id: 'auburn', label: 'Auburn', color: '#8f3a22' },
  { id: 'ginger', label: 'Ginger', color: '#da7837' },
  { id: 'blonde', label: 'Blonde', color: '#eec66c' },
  { id: 'platinum', label: 'Platinum', color: '#f4e7c1' },
  { id: 'grey', label: 'Grey', color: '#a4a7ae' },
  { id: 'white', label: 'White', color: '#f6f3ee' },
  { id: 'pink', label: 'Pink', color: '#f6a1c6' },
  { id: 'blue', label: 'Blue', color: '#72a9f2' },
  { id: 'purple', label: 'Purple', color: '#a98aec' },
  { id: 'mint', label: 'Mint', color: '#84dcc2' },
  { id: 'cherry', label: 'Cherry', color: '#d94848' },
  { id: 'ash', label: 'Ash', color: '#e4ddcb' },
] as const satisfies readonly Swatch[];

export const EYE_COLORS = [
  { id: 'ink', label: 'Dark', color: '#18181b' },
  { id: 'brown', label: 'Brown', color: '#5c3720' },
  { id: 'hazel', label: 'Hazel', color: '#8b6a2c' },
  { id: 'green', label: 'Green', color: '#3f7f4f' },
  { id: 'blue', label: 'Blue', color: '#3a70ba' },
  { id: 'grey', label: 'Grey', color: '#6b7280' },
  { id: 'violet', label: 'Violet', color: '#7c4dbe' },
] as const satisfies readonly Swatch[];

/** Shared by headwear, tops, neck accessories, hair clips and earrings. */
export const ITEM_COLORS = [
  { id: 'indigo', label: 'Indigo', color: '#6366f1' },
  { id: 'sky', label: 'Sky', color: '#4cc0f5' },
  { id: 'teal', label: 'Teal', color: '#2bbfab' },
  { id: 'green', label: 'Green', color: '#5fcf7f' },
  { id: 'jade', label: 'Jade', color: '#3fa56b' },
  { id: 'yellow', label: 'Yellow', color: '#fcd34d' },
  { id: 'gold', label: 'Gold', color: '#f2c14e' },
  { id: 'orange', label: 'Orange', color: '#fb923c' },
  { id: 'red', label: 'Red', color: '#ef5350' },
  { id: 'rose', label: 'Rose', color: '#f47cb4' },
  { id: 'blush', label: 'Blush', color: '#f5c3d2' },
  { id: 'lilac', label: 'Lilac', color: '#b49cf8' },
  { id: 'tan', label: 'Tan', color: '#c9965e' },
  { id: 'denim', label: 'Denim', color: '#45679e' },
  { id: 'white', label: 'White', color: '#fdfdfb' },
  { id: 'cream', label: 'Cream', color: '#f7f3ea' },
  { id: 'grey', label: 'Grey', color: '#a1a1aa' },
  { id: 'charcoal', label: 'Charcoal', color: '#3f3f46' },
  { id: 'black', label: 'Black', color: '#252528' },
] as const satisfies readonly Swatch[];

export const GLASSES_COLORS = [
  { id: 'ink', label: 'Black', color: '#18181b' },
  { id: 'tortoise', label: 'Tortoise', color: '#7a4a2a' },
  { id: 'gold', label: 'Gold', color: '#d6a93b' },
  { id: 'rose', label: 'Rose', color: '#f472b6' },
  { id: 'sky', label: 'Sky', color: '#38bdf8' },
  { id: 'red', label: 'Red', color: '#ef4444' },
  { id: 'white', label: 'White', color: '#f8fafc' },
] as const satisfies readonly Swatch[];

export const colorOf = (list: readonly Swatch[], id: string) =>
  (list.find((s) => s.id === id) ?? list[0]!).color;

/** The circle behind the character (the user's `avatarColor`). Same list the server hands out at sign-up. */
export const BACKGROUNDS = [
  { id: '#6366f1', label: 'Indigo', color: '#6366f1' },
  { id: '#0ea5e9', label: 'Sky', color: '#0ea5e9' },
  { id: '#14b8a6', label: 'Teal', color: '#14b8a6' },
  { id: '#22c55e', label: 'Green', color: '#22c55e' },
  { id: '#eab308', label: 'Amber', color: '#eab308' },
  { id: '#f97316', label: 'Orange', color: '#f97316' },
  { id: '#ec4899', label: 'Pink', color: '#ec4899' },
  { id: '#a855f7', label: 'Purple', color: '#a855f7' },
] as const satisfies readonly Swatch[];
