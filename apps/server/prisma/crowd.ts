import type { PrismaClient } from '@prisma/client';
import { interestKeysOf, parseCardRecipe } from '../src/services/cards.js';
import { AVATAR_COLORS, parseAvatar } from '../src/services/users.js';
import { AVATAR_SLOTS, CARD_STYLE, COLORS, INTERESTS, STICKERS } from './crowdOptions.js';

/*
 * SEED_CROWD=<n>: n more demo people for the Discover deck (CARD_DECK_PLAN.md). Every card is drawn
 * from the whole style catalog (backgrounds, patterns, fonts, layouts, borders, finishes, frames,
 * rings, dividers, chips, buttons, stickers), and every avatar from the whole avatar kit, so the deck
 * shows how different cards can be. Each person shares interests with two of the demo users, so every
 * demo user gets a full (large) deck. Seeded randomness: the same crowd every time.
 */

type Interest = string | { t: string; e?: string };

/** The demo users, and what Alice gets if her card has no interests (otherwise her deck is empty). */
const DEMO = ['alice', 'bob', 'carol', 'dave', 'erin'];
const ALICE_INTERESTS: Interest[] = [
  'chess',
  'music',
  'travel',
  'photography',
  { t: 'Sourdough', e: '🍞' },
];

const FIRST = [
  'Ava',
  'Bilal',
  'Chiara',
  'Dmitri',
  'Ebony',
  'Farah',
  'Gabriel',
  'Hiro',
  'Ines',
  'Jonas',
  'Keanu',
  'Leila',
  'Mateo',
  'Nadia',
  'Oskar',
  'Priya',
  'Quentin',
  'Rosa',
  'Santiago',
  'Talia',
  'Uma',
  'Viktor',
  'Wen',
  'Ximena',
  'Yusuf',
  'Zoe',
  'Amara',
  'Bruno',
  'Camille',
  'Dev',
  'Elif',
  'Finn',
  'Grace',
  'Hamza',
  'Isla',
  'Jae',
  'Kofi',
  'Lucia',
  'Marco',
  'Noor',
  'Olu',
  'Paloma',
  'Rafael',
  'Sana',
  'Theo',
  'Valentina',
  'Willa',
  'Yara',
  'Zain',
  'Anouk',
];
const LAST = [
  'Abara',
  'Bergström',
  'Castillo',
  'Dubois',
  'Eriksen',
  'Fujita',
  'García',
  'Haddad',
  'Ivanova',
  'Jensen',
  'Kowalski',
  'Lindqvist',
  'Mensah',
  'Novak',
  'Okafor',
  'Petrova',
  'Quinn',
  'Rossi',
  'Sato',
  'Torres',
  'Usman',
  'Varga',
  'Wójcik',
  'Xu',
  'Yilmaz',
  'Zhang',
  'Achebe',
  'Moreau',
  'Nakamura',
  'Oliveira',
  'Park',
  'Reyes',
  'Silva',
  'Tanaka',
  'Weber',
  'Kim',
  'Lopez',
  'Singh',
];
const ABOUTS = [
  'Always up for a chat.',
  'New here, say hi!',
  'Weekend explorer, weekday daydreamer.',
  'Coffee first, then everything else.',
  'Ask me for a recommendation. Any kind.',
  'Night owl. Professional snacker.',
  'I make playlists for every mood.\nCurrently: rainy Tuesday.',
  'Learning something new every month.\nThis month: pottery.',
  'Will trade book recs for plant cuttings.',
  'Here to make friends who like the same weird stuff.',
  'Part-time chef, full-time taste tester.',
  'Dog at home, cat at heart.',
  'Collector of stickers and small joys.',
  'I talk to my plants. They are thriving.',
  'Slow mornings, long walks, good tea.',
  'Ask me about my latest rabbit hole.',
  'Board games on Fridays. Bring snacks.',
  'Trying every ramen place in town.\nSend tips.',
  'Sketchbook always in my bag.',
  'I run so I can eat more pastries.',
  'Introvert who loves a good group chat.',
  'Moved here recently, looking for my people.',
  'Will debug for dumplings.',
  'Film photography, film snacks, film nights.',
  'Happiest near water.',
  'Pun enthusiast. You have been warned.',
  'Big fan of small talk that turns into long talk.',
  'Probably humming something right now.',
  'Weekend baker. Weekday bread eater.',
  'Looking for a co-op partner and a hiking buddy.',
];
const CUSTOM: Interest[] = [
  { t: 'Synthwave', e: '🎹' },
  { t: 'Sourdough', e: '🍞' },
  { t: 'Houseplants', e: '🪴' },
  { t: 'Vinyl', e: '💿' },
  { t: 'Matcha', e: '🍵' },
  { t: 'Crosswords', e: '🧩' },
  { t: 'Film cameras', e: '📷' },
  { t: 'K-dramas', e: '📺' },
  { t: 'Lego', e: '🧱' },
  { t: 'Retro games', e: '👾' },
  { t: 'Thrift finds' },
  { t: 'Night swims' },
];
const EMOJI = [
  '🌈',
  '🍓',
  '🌙',
  '⭐',
  '🍀',
  '🎧',
  '🔥',
  '🌸',
  '🍕',
  '🦋',
  '🐸',
  '🍩',
  '🎮',
  '🌻',
  '🪐',
  '🧁',
  '🐙',
  '✨',
];
/**
 * Where stickers can sit without covering any text, in every layout: the corners (fractions of the
 * card). Not the top-left, where several layouts put the @name; the bottom ones flank the button.
 */
const SPOTS = [
  { x: 0.86, y: 0.07 },
  { x: 0.1, y: 0.91 },
  { x: 0.9, y: 0.91 },
];
/** Slots that are more fun when only some people have them. */
const SOMETIMES = new Set(['hat', 'glasses', 'pet', 'mark', 'clip', 'earrings', 'neck']);

/** mulberry32: a tiny seeded random number generator. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const keyOf = (it: Interest) => (typeof it === 'string' ? `id:${it}` : `t:${it.t.toLowerCase()}`);

function interestsFromCard(stored: string | null): Interest[] {
  try {
    const list = stored ? (JSON.parse(stored) as { interests?: unknown }).interests : null;
    return Array.isArray(list) ? (list as Interest[]) : [];
  } catch {
    return [];
  }
}

function person(i: number, anchors: Interest[][]) {
  const r = random(20261123 + i * 7919);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(r() * list.length)]!;
  const chance = (p: number) => r() < p;
  /** Steps through a list so neighbours in the crowd never look alike. */
  const cycle = <T>(list: readonly T[], k: number): T => list[k % list.length]!;

  const first = pick(FIRST);
  const last = pick(LAST);

  // Interests: one from each of two demo users, then a few of anything.
  const mine = new Map<string, Interest>();
  const add = (it: Interest | undefined) => {
    if (it && mine.size < 6 && !mine.has(keyOf(it))) mine.set(keyOf(it), it);
  };
  if (anchors.length) {
    add(pick(anchors[i % anchors.length]!));
    add(pick(anchors[(i + 2) % anchors.length]!));
  }
  const extra = 1 + Math.floor(r() * 3);
  for (let k = 0; k < extra; k++) add(chance(0.25) ? pick(CUSTOM) : pick(INTERESTS));

  const stickers = [];
  const spots = [...SPOTS].sort(() => r() - 0.5).slice(0, pick([0, 1, 1, 2, 2, 3]));
  for (const spot of spots) {
    const at = {
      x: Math.min(1, Math.max(0, spot.x + (r() - 0.5) * 0.04)),
      y: Math.min(1, Math.max(0, spot.y + (r() - 0.5) * 0.03)),
      s: 0.55 + r() * 0.35,
      r: Math.round((r() - 0.5) * 40),
    };
    stickers.push(
      chance(0.7)
        ? { k: pick(STICKERS), ...at, ...(chance(0.5) ? { c: pick(COLORS) } : {}) }
        : { e: pick(EMOJI), ...at },
    );
  }

  const card = {
    v: 1,
    about: pick(ABOUTS),
    interests: [...mine.values()],
    labels: chance(0.8),
    stickers,
    layout: cycle(CARD_STYLE.layout, i),
    name: pick(CARD_STYLE.name),
    align: chance(0.75) ? 'center' : 'left',
    font: cycle(CARD_STYLE.font, i * 3 + 1),
    // 28 backgrounds stepped by 5 (no common factor): the crowd goes through every one.
    bg: cycle(CARD_STYLE.bg, i * 5 + 2),
    pattern: chance(0.4) ? 'none' : pick(CARD_STYLE.pattern),
    patternTone: pick(CARD_STYLE.patternTone),
    ink: 'auto',
    accent: pick(CARD_STYLE.accent),
    border: pick(CARD_STYLE.border),
    borderColor: chance(0.5) ? 'ink' : chance(0.5) ? 'accent' : pick(CARD_STYLE.borderColor),
    corners: pick(CARD_STYLE.corners),
    finish: chance(0.55) ? 'matte' : pick(CARD_STYLE.finish),
    frame: pick(CARD_STYLE.frame),
    ring: chance(0.4) ? 'none' : pick(CARD_STYLE.ring),
    divider: pick(CARD_STYLE.divider),
    chips: pick(CARD_STYLE.chips),
    button: pick(CARD_STYLE.button),
  };

  const avatar: Record<string, string | number> = { v: 1, style: 'character' };
  for (const [slot, ids] of Object.entries(AVATAR_SLOTS)) {
    const options = ids as readonly string[];
    avatar[slot] =
      SOMETIMES.has(slot) && options.includes('none') && chance(0.55)
        ? 'none'
        : pick(options.filter((id) => !SOMETIMES.has(slot) || id !== 'none'));
  }

  return {
    first,
    last,
    // The server's own checks, so the crowd is exactly what real saves would store.
    card: parseCardRecipe(JSON.stringify(card))!,
    avatar: parseAvatar(JSON.stringify(avatar))!,
    avatarColor: pick(AVATAR_COLORS),
    cardShared: chance(0.3),
  };
}

const ascii = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/ö/g, 'o')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

/** Adds the crowd (skipping anyone already there). Returns how many people were added. */
export async function seedCrowd(prisma: PrismaClient, count: number, passwordHash: string) {
  // Alice keeps the default look, but with nothing to share her deck would be empty.
  const alice = await prisma.user.findUnique({ where: { username: 'alice' } });
  if (alice && interestsFromCard(alice.card).length === 0) {
    const base = alice.card ? (JSON.parse(alice.card) as Record<string, unknown>) : { v: 1 };
    const card = parseCardRecipe(JSON.stringify({ ...base, interests: ALICE_INTERESTS }))!;
    await prisma.user.update({
      where: { id: alice.id },
      data: { card, interestKeys: interestKeysOf(card) },
    });
  }

  const demo = await prisma.user.findMany({ where: { username: { in: DEMO } } });
  const anchors = demo.map((u) => interestsFromCard(u.card)).filter((list) => list.length > 0);
  /** Names are settled within the crowd itself, so a re-run gives everyone the same username. */
  const used = new Set<string>();
  let added = 0;
  for (let i = 0; i < count; i++) {
    const p = person(i, anchors);
    const base = `${ascii(p.first)}_${ascii(p.last)}`.slice(0, 17);
    const username = used.has(base) ? `${base}${i}`.slice(0, 20) : base;
    used.add(username);
    if (await prisma.user.findUnique({ where: { username } })) continue;
    await prisma.user.create({
      data: {
        username,
        displayName: `${p.first} ${p.last}`,
        email: `${username}@example.com`,
        passwordHash,
        avatarColor: p.avatarColor,
        avatar: p.avatar,
        card: p.card,
        cardShared: p.cardShared,
        interestKeys: interestKeysOf(p.card),
        welcomedAt: new Date(),
      },
    });
    added += 1;
  }
  return added;
}
