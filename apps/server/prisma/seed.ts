// Demo data for local development and README screenshots.
// Safe to run repeatedly: it does nothing if any user already exists.
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth.js';
import { AVATAR_COLORS } from '../src/services/users.js';

const prisma = new PrismaClient();
const PASSWORD = 'password123';

/** An avatar recipe in the shape the web client draws (AVATAR_PLAN.md §2); unset slots use the defaults. */
const look = (slots: Record<string, string>) =>
  JSON.stringify({ v: 1, style: 'character', ...slots });

// Alice keeps the default character, so the demo shows what everyone starts with.
const people = [
  { username: 'alice', displayName: 'Alice Moreno', avatar: null },
  {
    username: 'bob',
    displayName: 'Bob Carter',
    avatar: look({
      skin: 'bronze',
      hair: 'curly',
      hairColor: 'dark-brown',
      eyes: 'happy',
      mouth: 'grin',
      hat: 'beanie',
      hatColor: 'orange',
      top: 'hoodie',
      topColor: 'grey',
      pet: 'puppy',
    }),
  },
  {
    username: 'carol',
    displayName: 'Carol Nakamura',
    avatar: look({
      skin: 'sand',
      hair: 'bob',
      hairColor: 'black',
      eyes: 'sparkle',
      eyeColor: 'brown',
      glasses: 'round',
      cheeks: 'both',
      earrings: 'pearls',
      top: 'cardigan',
      topColor: 'lilac',
    }),
  },
  {
    username: 'dave',
    displayName: 'Dave Okafor',
    avatar: look({
      skin: 'espresso',
      hair: 'afro',
      hairColor: 'black',
      brows: 'thick',
      mouth: 'teeth',
      glasses: 'shades',
      glassesColor: 'gold',
      top: 'jersey',
      topColor: 'teal',
      neck: 'chain',
    }),
  },
  {
    username: 'erin',
    displayName: 'Erin Walsh',
    avatar: look({
      skin: 'ivory',
      hair: 'space-buns',
      hairColor: 'ginger',
      cheeks: 'freckles',
      mark: 'star',
      mouth: 'cat',
      hat: 'clips',
      hatColor: 'yellow',
      top: 'overalls',
      topColor: 'denim',
      pet: 'frog',
    }),
  },
];

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

/** Card recipes in the shape the web client draws (CARDS_PLAN.md §2); unset keys use the defaults. */
const card = (o: Record<string, unknown>) => JSON.stringify({ v: 1, ...o });

// Alice keeps the default card; Bob's and Carol's links are public.
const cards: Record<string, { card: string; cardShared: boolean }> = {
  bob: {
    cardShared: true,
    card: card({
      about: 'Weekend hiker, weekday coffee snob.\nAsk me about trail maps.',
      interests: ['hiking', 'camping', 'coffee', { t: 'Trail maps', e: '🗺️' }],
      bg: 'mint-fizz',
      pattern: 'waves',
      layout: 'banner',
      accent: 'teal',
      border: 'thick',
      borderColor: 'ink',
      corners: 'round',
      chips: 'pill',
      button: 'solid',
      divider: 'wavy',
      font: 'bubbly',
      stickers: [
        { k: 'sun', x: 0.88, y: 0.06, s: 0.9, r: 10 },
        { e: '🥾', x: 0.1, y: 0.47, s: 0.6, r: -14 },
      ],
    }),
  },
  carol: {
    cardShared: true,
    card: card({
      about:
        'Product designer. I collect fonts and houseplants.\nHappy to give feedback on anything!',
      interests: ['design', 'drawing', 'gardening', 'museums', 'tea'],
      bg: 'candy',
      layout: 'centered',
      name: 'both',
      accent: 'rose',
      border: 'stitched',
      borderColor: 'accent',
      frame: 'blob',
      ring: 'thick',
      chips: 'sticker',
      button: 'pill',
      divider: 'dotted',
      font: 'storybook',
      finish: 'gloss',
      stickers: [
        { k: 'flower', c: 'rose', x: 0.86, y: 0.08, s: 0.9, r: 12 },
        { k: 'sparkle', c: 'yellow', x: 0.13, y: 0.3, s: 0.6, r: 0 },
        { k: 'tape', c: 'lilac', x: 0.5, y: 0.01, s: 1.1, r: 0 },
      ],
    }),
  },
  dave: {
    cardShared: false,
    card: card({
      about: 'Backend person. Night owl.\nWill debug for snacks.',
      interests: ['coding', 'games', 'ramen', { t: 'Mechanical keebs', e: '⌨️' }],
      bg: 'galaxy',
      pattern: 'stars',
      patternTone: 'white',
      layout: 'side',
      accent: 'lilac',
      border: 'foil',
      finish: 'holo',
      frame: 'hexagon',
      ring: 'rainbow',
      chips: 'outline',
      button: 'outline',
      divider: 'stars',
      font: 'pixel',
      stickers: [{ k: 'controller', c: 'lilac', x: 0.86, y: 0.52, s: 0.8, r: -12 }],
    }),
  },
  erin: {
    cardShared: false,
    card: card({
      about: 'Bakes too much. Shares everything.',
      interests: ['baking', 'cats', 'reading', 'yoga'],
      bg: 'lemon',
      pattern: 'dots',
      accent: 'orange',
      border: 'ticket',
      chips: 'tag',
      button: 'soft',
      divider: 'dashed',
      font: 'handwritten',
      frame: 'stamp',
      stickers: [
        { k: 'donut', c: 'rose', x: 0.85, y: 0.08, s: 0.9, r: 14 },
        { k: 'cat', x: 0.12, y: 0.62, s: 0.7, r: -10 },
      ],
    }),
  },
};

async function main() {
  if ((await prisma.user.count()) > 0) {
    console.log('Seed skipped: database already has users.');
    return;
  }
  const passwordHash = await hashPassword(PASSWORD);
  const users: Record<string, string> = {};
  for (const [i, p] of people.entries()) {
    const u = await prisma.user.create({
      data: {
        ...p,
        email: `${p.username}@example.com`,
        passwordHash,
        avatarColor: AVATAR_COLORS[(i * 3) % AVATAR_COLORS.length]!,
        ...cards[p.username],
      },
    });
    users[p.username] = u.id;
  }
  const id = (name: string) => users[name]!;

  /** A reply (index of the quoted line in the same chat) and reactions: person → [emoji, minutes ago]. */
  interface Extra {
    replyTo?: number;
    reactions?: Record<string, [string, number]>;
  }

  async function chat(
    data: {
      type: 'DIRECT' | 'GROUP';
      name?: string;
      members: string[];
      readUpTo?: Record<string, number>;
    },
    lines: Array<[string, string, number, Extra?]>, // [sender, text, minutes ago, extras]
  ) {
    const memberIds = data.members.map(id);
    const last = lines.at(-1)?.[2] ?? 0;
    const conv = await prisma.conversation.create({
      data: {
        type: data.type,
        name: data.name,
        directKey: data.type === 'DIRECT' ? [...memberIds].sort().join(':') : null,
        createdById: memberIds[0]!,
        createdAt: minutesAgo(60 * 24 * 3),
        lastMessageAt: minutesAgo(last),
        members: {
          create: memberIds.map((userId, i) => ({
            userId,
            role: i === 0 ? 'OWNER' : 'MEMBER',
            // Members are "read up to" N minutes ago; default: everything is read.
            lastReadAt: minutesAgo(data.readUpTo?.[data.members[i]!] ?? 0),
          })),
        },
      },
    });
    const ids: string[] = [];
    for (const [sender, body, ago, extra] of lines) {
      const replyToId = extra?.replyTo === undefined ? null : ids[extra.replyTo]!;
      const message = await prisma.message.create({
        data: {
          conversationId: conv.id,
          senderId: id(sender),
          body,
          createdAt: minutesAgo(ago),
          replyToId,
        },
      });
      ids.push(message.id);
      for (const [who, [emoji, reactedAgo]] of Object.entries(extra?.reactions ?? {})) {
        await prisma.reaction.create({
          data: {
            messageId: message.id,
            userId: id(who),
            emoji,
            createdAt: minutesAgo(reactedAgo),
            updatedAt: minutesAgo(reactedAgo),
          },
        });
      }
    }
  }

  const day = 60 * 24;
  await chat({ type: 'DIRECT', members: ['alice', 'bob'], readUpTo: { alice: 0 } }, [
    ['bob', 'Morning! Did you get a chance to look at the new designs?', day + 190],
    ['alice', 'Yes — I like the simpler sidebar a lot.', day + 185],
    ['bob', 'Great. Shipping the mobile layout today.', day + 180],
    ['alice', 'Hey Bob, how is the mobile layout going?', 42],
    ['bob', 'Pretty well! Messages now arrive instantly instead of polling.', 38],
    ['alice', 'Nice. Does it work when the phone is offline for a bit?', 35],
    [
      'bob',
      'It reconnects on its own and shows a little banner while it does.',
      33,
      { replyTo: 5, reactions: { alice: ['🙌', 30] } },
    ],
    ['bob', 'Want to try it on your phone?', 32],
    // Bob's reaction comes after the last message, so the chat list mentions it.
    ['alice', 'Absolutely, send me the link 🚀', 6, { reactions: { bob: ['❤️', 4] } }],
  ]);

  await chat(
    {
      type: 'GROUP',
      name: 'Weekend hike 🥾',
      members: ['alice', 'bob', 'carol', 'dave'],
      readUpTo: { alice: 25 },
    },
    [
      ['carol', 'Forecast looks clear for Saturday!', 190],
      ['dave', 'I can drive. Leaving at 7:30?', 120, { reactions: { carol: ['🙏', 110] } }],
      ['bob', '7:30 works for me', 90, { replyTo: 1 }],
      [
        'carol',
        'Bringing sandwiches for everyone',
        28,
        { reactions: { alice: ['❤️', 26], bob: ['😂', 25], dave: ['❤️', 24] } },
      ],
      ['dave', 'Legend. I’ll grab the coffee.', 22],
      ['bob', 'Trail map is in the shared folder', 18],
    ],
  );

  await chat({ type: 'DIRECT', members: ['alice', 'carol'], readUpTo: { alice: 0 } }, [
    ['alice', 'Thanks for reviewing the PR!', day * 2 + 30],
    ['carol', 'Anytime. Left two small comments.', day * 2 + 20],
  ]);

  await chat(
    {
      type: 'GROUP',
      name: 'Design crit',
      members: ['erin', 'alice', 'carol'],
      readUpTo: { alice: 0 },
    },
    [
      ['erin', 'Posted the latest mockups in the doc.', day + 400],
      ['carol', 'Love the calmer palette.', day + 380, { reactions: { alice: ['💯', day + 370] } }],
    ],
  );

  console.log(
    `Seeded ${people.length} users (password for all: "${PASSWORD}"): ${people.map((p) => p.username).join(', ')}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
