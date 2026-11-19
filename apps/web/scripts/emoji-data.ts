/**
 * Builds the emoji list the reaction picker offers: `npm run emoji-data -w apps/web`.
 *
 * It keeps only emojis that most devices can draw (Emoji 15.0 and older) and that the server
 * accepts as a single RGI emoji, and only the fields the picker needs. Re-run it after updating
 * `emojibase-data`; the output is committed so the app never ships the full data set.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

interface Emoji {
  label: string;
  emoji: string;
  group?: number;
  order?: number;
  version: number;
  tags?: string[];
}

const require = createRequire(import.meta.url);
const all = JSON.parse(
  readFileSync(require.resolve('emojibase-data/en/data.json'), 'utf8'),
) as Emoji[];

const MAX_VERSION = 15;
const SKIP_GROUPS = new Set([2]); // "component": skin-tone and hair swatches, not emojis on their own
// Same check as the server (apps/server/src/services/reactions.ts).
const ONE_EMOJI = new RegExp('^\\p{RGI_Emoji}$', 'v');

/** Group order and names as the picker shows them. */
export const GROUPS = [
  [0, 'Smileys & emotion'],
  [1, 'People & body'],
  [3, 'Animals & nature'],
  [4, 'Food & drink'],
  [5, 'Travel & places'],
  [6, 'Activities'],
  [7, 'Objects'],
  [8, 'Symbols'],
  [9, 'Flags'],
] as const;

const keep = all
  .filter(
    (e) =>
      e.group !== undefined &&
      !SKIP_GROUPS.has(e.group) &&
      e.version <= MAX_VERSION &&
      ONE_EMOJI.test(e.emoji),
  )
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

const out = GROUPS.map(([id, name]) => ({
  name,
  // [emoji, name, extra search words]: the tags that aren't already in the name.
  emojis: keep
    .filter((e) => e.group === id)
    .map((e) => {
      const name = e.label.toLowerCase();
      const own = new Set(name.split(/[\s:,]+/));
      return [e.emoji, name, [...new Set(e.tags ?? [])].filter((t) => !own.has(t)).join(' ')];
    }),
}));

const file = fileURLToPath(
  new URL('../src/features/chat/reactions/emoji-data.json', import.meta.url),
);
writeFileSync(file, `${JSON.stringify(out)}\n`);
const count = out.reduce((n, g) => n + g.emojis.length, 0);
console.log(`Wrote ${count} emojis in ${out.length} groups to ${file}`);
