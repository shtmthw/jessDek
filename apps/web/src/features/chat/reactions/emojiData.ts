import data from './emoji-data.json';

/** One emoji: the character, its name, and extra words to find it by. */
export type Entry = [emoji: string, name: string, words: string];
export interface Group {
  name: string;
  emojis: Entry[];
}

export const GROUPS = data as unknown as Group[];
/**
 * Every query word must start one of the emoji's words ("hea red" finds the red heart). Names
 * beat tags: "party" puts the partying face before things merely tagged "party".
 */
export function search(query: string, groups: readonly Group[] = GROUPS): Entry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const scored: Array<[score: number, entry: Entry]> = [];
  for (const g of groups) {
    for (const e of g.emojis) {
      const name = e[1].split(/[\s:,-]+/);
      const tags = e[2] ? e[2].split(' ') : [];
      const inName = (t: string) => name.some((w) => w.startsWith(t));
      if (!terms.every((t) => inName(t) || tags.some((w) => w.startsWith(t)))) continue;
      const score = e[1].startsWith(terms.join(' ')) ? 0 : terms.every(inName) ? 1 : 2;
      scored.push([score, e]);
    }
  }
  // Array.prototype.sort is stable: within a score, emojis keep their usual order.
  return scored.sort((a, b) => a[0] - b[0]).map(([, e]) => e);
}
