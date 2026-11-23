import { interestById } from '../card/interests';
import { interestKey, type Interest } from '../card/recipe';

/*
 * AGM, auto-generated messages (CARD_DECK_PLAN.md §4.5): a few openers to pick from in the card
 * view, written from the interests you share. Templates, not AI: free, instant, and the same every
 * time for the same person. `suggestOpeners` is the one place to swap in something smarter later.
 */

/** Openers that fit one interest. `{name}` is their first name. */
const BY_INTEREST: Record<string, readonly string[]> = {
  hiking: [
    'Hey {name}! Fellow hiker here. Got a favourite trail?',
    'Hi {name}! What’s the best hike you’ve done lately?',
  ],
  camping: ['Hi {name}! Tent or cabin person? I’m always looking for a good campsite.'],
  running: ['Hey {name}! Are you training for anything at the moment?'],
  biking: ['Hi {name}! Road, gravel or mountain? I’m always up for a new route.'],
  gardening: ['Hi {name}! What are you growing at the moment?'],
  yoga: ['Hi {name}! How did you get into yoga?'],
  gym: ['Hey {name}! Morning or evening workouts?'],
  football: ['Hey {name}! Who do you support?'],
  dancing: ['Hi {name}! What kind of dancing do you do?'],
  drawing: ['Hi {name}! What do you like to draw?'],
  painting: ['Hi {name}! What are you painting at the moment?'],
  photography: ['Hey {name}! What do you like to shoot?'],
  writing: ['Hi {name}! What are you writing at the moment?'],
  design: ['Hi {name}! What are you designing lately?'],
  music: ['Hey {name}! What have you had on repeat lately?'],
  concerts: ['Hey {name}! Best gig you’ve been to?'],
  guitar: ['Hi {name}! Guitar too! What are you learning at the moment?'],
  piano: ['Hi {name}! What’s the last piece you learned on piano?'],
  games: ['Hey {name}! What are you playing at the moment?'],
  'board-games': ['Hi {name}! Favourite board game? I’m always looking for a new one.'],
  chess: ['Hi {name}! Fancy a game of chess sometime?'],
  coding: ['Hey {name}! What are you building lately?'],
  anime: ['Hey {name}! What are you watching at the moment? I need a new anime.'],
  space: ['Hi {name}! Space nerd here too. Seen anything cool lately?'],
  cooking: ['Hi {name}! What’s your go-to dish?'],
  baking: ['Hey {name}! I saw you’re into baking too. What’s the best thing you’ve made lately?'],
  coffee: ['Hi {name}! How do you take your coffee?'],
  tea: ['Hi {name}! Fellow tea drinker. What’s your favourite?'],
  ramen: ['Hey {name}! Where’s the best ramen you’ve had?'],
  pizza: ['Hi {name}! Important question: what’s on your perfect pizza?'],
  movies: ['Hey {name}! Seen anything good lately?'],
  tv: ['Hi {name}! What are you watching at the moment?'],
  reading: [
    'Hi {name}! Any book you’d recommend?',
    'Hey {name}! What are you reading at the moment?',
  ],
  podcasts: ['Hey {name}! Any podcast I should be listening to?'],
  travel: ['Hi {name}! Where’s the best place you’ve been?'],
  languages: ['Hi {name}! Which languages are you learning?'],
  museums: ['Hi {name}! Been to a good exhibition lately?'],
  cats: ['Hey {name}! Cat person too 🐈 Do you have one?'],
  dogs: ['Hey {name}! Dog person too 🐕 Do you have one?'],
};

/** Openers about one interest that has no lines of its own (custom ones too). */
const ANY_INTEREST = [
  'Hey {name}! I saw you’re into {interest} too. How did you get into it?',
  'Hi {name}! Another {interest} fan 👋 What do you love most about it?',
];

/** Two interests at once. */
const TWO = ['{a} and {b}, same here 😄 Which came first for you?'];

const ABOUT = ['Hi {name}! Your card made me smile. What’s keeping you busy these days?'];

const ANYONE = [
  'Hi {name}! The deck matched us, so hello 👋 How’s your week going?',
  'Hey {name}! Nice to meet you. What are you up to this weekend?',
  'Hi {name}! I liked your card. What are you into lately?',
  'Hey {name}! Say hi back if you fancy a chat 🙂',
];

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** The word for an interest in a sentence: "baking", "board games", or what they wrote. */
export function interestWord(it: Interest): string {
  if (typeof it !== 'string') return it.t;
  const label = interestById(it)?.label ?? it.replace(/-/g, ' ');
  return label.toLocaleLowerCase();
}

/** Their interests that you have too, in the order on their card. */
export function sharedInterests(
  theirs: readonly Interest[],
  mine: readonly Interest[],
): Interest[] {
  const keys = new Set(mine.map(interestKey));
  return theirs.filter((it) => keys.has(interestKey(it)));
}

/** A small, stable number from a string (the same person always gets the same openers). */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');

const upperFirst = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

export interface OpenerInput {
  /** Their id: picks between variants, so it's stable per person. */
  id: string;
  displayName: string;
  /** Their interests, in their card's order. */
  theirs: readonly Interest[];
  /** Yours. */
  mine: readonly Interest[];
  /** Their about text (only whether there is one is used). */
  about?: string;
}

/** 3 or 4 openers, most specific first. */
export function suggestOpeners({ id, displayName, theirs, mine, about }: OpenerInput): string[] {
  const name = firstName(displayName);
  const seed = hash(id);
  const pick = <T>(list: readonly T[], salt: number) => list[(seed + salt) % list.length]!;
  const out: string[] = [];
  const add = (s: string) => {
    const line = s.replace(/\s+/g, ' ').trim();
    if (line && !out.includes(line)) out.push(line);
  };

  const shared = sharedInterests(theirs, mine);
  shared.slice(0, 2).forEach((it, i) => {
    const own = typeof it === 'string' ? BY_INTEREST[it] : undefined;
    add(fill(own ? pick(own, i) : pick(ANY_INTEREST, i), { name, interest: interestWord(it) }));
  });
  if (shared.length >= 2) {
    add(
      fill(pick(TWO, 0), { a: upperFirst(interestWord(shared[0]!)), b: interestWord(shared[1]!) }),
    );
  }
  if (about?.trim()) add(fill(pick(ABOUT, 0), { name }));
  for (let i = 0; out.length < 3 || (out.length < 4 && i < ANYONE.length); i++) {
    if (i >= ANYONE.length * 2) break;
    add(fill(ANYONE[(seed + i) % ANYONE.length]!, { name }));
  }
  return out.slice(0, 4);
}
