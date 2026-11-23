import { Prisma, type User } from '@prisma/client';
import { prisma } from '../db.js';
import { fail } from '../errors.js';
import { RateLimiter } from '../rateLimit.js';
import { blockedBetween } from './blocks.js';
import { cardView, type CardView } from './cards.js';

/**
 * The card deck (CARD_LOADING.md, CARD_DECK_PLAN.md §3). Everything here is keyed to the signed-in
 * user: `me` always comes from the session, never from the client.
 *
 * Only M (the middle card) is random. Swiping is a rotation in id order that wraps. There is no
 * shuffling, and page fetches never use `ORDER BY random()`.
 */

/** S: cards fetched per refill request, per side. */
export const BATCH_SIZE = 5;
/** Largest deck that is loaded whole: 1 + 2 × BufferMaxPerSide (10). */
export const SMALL_DECK_MAX = 21;

/** A fast swiper makes about one request per 5 moves, so this is generous. */
export const deckLimiter = new RateLimiter(240, 60 * 1000);

export type DeckMode = 'EMPTY' | 'SMALL' | 'LARGE';

export interface DeckStart {
  mode: DeckMode;
  n: number;
  cards: CardView[];
  m: CardView | null;
  right: CardView[];
  left: CardView[];
}

export interface DeckPage {
  cards: CardView[];
  wrapped: boolean;
}

/**
 * The match filter, defined once and used by every deck query: someone else who shares at least one
 * interest with me and isn't blocked either way. (`u` is the User being considered.)
 */
const match = (me: string) => Prisma.sql`
  u."id" <> ${me}
  AND u."interestKeys" && (SELECT m."interestKeys" FROM "User" m WHERE m."id" = ${me})
  AND NOT EXISTS (
    SELECT 1 FROM "Block" b
    WHERE (b."blockerId" = ${me} AND b."blockedId" = u."id")
       OR (b."blockerId" = u."id" AND b."blockedId" = ${me})
  )`;

function spend(me: string) {
  if (!deckLimiter.allow(me)) {
    throw fail('RATE_LIMITED', 'You’re moving through the deck very quickly. Try again shortly.');
  }
  deckLimiter.hit(me);
}

/** The cards for these ids, in the same order. Anyone who vanished meanwhile is left out. */
async function cardsFor(me: string, ids: string[]): Promise<CardView[]> {
  if (ids.length === 0) return [];
  const users = await prisma.user.findMany({ where: { id: { in: ids } } });
  const byId = new Map<string, User>(users.map((u) => [u.id, u]));
  return ids.flatMap((id) => {
    const user = byId.get(id);
    return user ? [cardView(user, me)] : [];
  });
}

type Dir = 'LEFT' | 'RIGHT';

/**
 * Up to `limit` ids from one side of `cursor`: RIGHT = greater ids, ascending; LEFT = smaller ids,
 * descending. Past the end of the id range it wraps: the same query again with no bound.
 */
async function sideIds(me: string, dir: Dir, cursor: string, limit: number) {
  const right = dir === 'RIGHT';
  const bound = right ? Prisma.sql`AND u."id" > ${cursor}` : Prisma.sql`AND u."id" < ${cursor}`;
  const order = right ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const first = await prisma.$queryRaw<{ id: string }[]>`
    SELECT u."id" FROM "User" u
    WHERE ${match(me)} ${bound}
    ORDER BY u."id" ${order}
    LIMIT ${limit}`;
  const ids = first.map((r) => r.id);
  if (ids.length >= limit) return { ids, wrapped: false };

  const rest = await prisma.$queryRaw<{ id: string }[]>`
    SELECT u."id" FROM "User" u
    WHERE ${match(me)}
    ORDER BY u."id" ${order}
    LIMIT ${limit - ids.length}`;
  // The deck can be too small for a clean wrap (the client never asks this of a large one): never
  // repeat a card inside one answer.
  const seen = new Set(ids);
  for (const r of rest) if (!seen.has(r.id)) ids.push(r.id);
  return { ids, wrapped: true };
}

/** Starts a deck: a random M, how many matches there are, and the first cards (spec §4.1). */
export async function deckStart(me: string): Promise<DeckStart> {
  spend(me);
  // `count(*) OVER ()` is evaluated before ORDER BY / LIMIT, so `n` is the total number of matches.
  const picked = await prisma.$queryRaw<{ id: string; n: number }[]>`
    SELECT u."id", (count(*) OVER ())::int AS n
    FROM "User" u
    WHERE ${match(me)}
    ORDER BY random()
    LIMIT 1`;
  const first = picked[0];
  if (!first) return { mode: 'EMPTY', n: 0, cards: [], m: null, right: [], left: [] };
  const { id: mId, n } = first;

  if (n <= SMALL_DECK_MAX) {
    const all = await prisma.$queryRaw<{ id: string }[]>`
      SELECT u."id" FROM "User" u
      WHERE ${match(me)}
      ORDER BY u."id" ASC`;
    const ids = all.map((r) => r.id);
    const at = Math.max(0, ids.indexOf(mId));
    const rotated = [...ids.slice(at), ...ids.slice(0, at)];
    return { mode: 'SMALL', n, cards: await cardsFor(me, rotated), m: null, right: [], left: [] };
  }

  const [right, left] = await Promise.all([
    sideIds(me, 'RIGHT', mId, BATCH_SIZE),
    sideIds(me, 'LEFT', mId, BATCH_SIZE),
  ]);
  const cards = await cardsFor(me, [mId, ...right.ids, ...left.ids]);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const pick = (ids: string[]) => ids.flatMap((id) => byId.get(id) ?? []);
  return {
    mode: 'LARGE',
    n,
    cards: [],
    m: byId.get(mId) ?? null,
    right: pick(right.ids),
    left: pick(left.ids),
  };
}

const CURSOR = /^[a-zA-Z0-9]{1,40}$/;

/** More cards from one end of a large deck (spec §4.2). */
export async function deckCards(
  me: string,
  dir: Dir,
  cursor: string,
  limit: number | null | undefined,
): Promise<DeckPage> {
  if (dir !== 'LEFT' && dir !== 'RIGHT')
    throw fail('BAD_USER_INPUT', 'Invalid direction', { field: 'dir' });
  if (typeof cursor !== 'string' || !CURSOR.test(cursor)) {
    throw fail('BAD_USER_INPUT', 'Invalid cursor', { field: 'cursor' });
  }
  const k = Number.isFinite(limit) ? Math.trunc(limit as number) : BATCH_SIZE;
  const take = Math.min(BATCH_SIZE, Math.max(1, k));
  spend(me);
  const { ids, wrapped } = await sideIds(me, dir, cursor, take);
  return { cards: await cardsFor(me, ids), wrapped };
}

/**
 * One person's card as the deck shows it (spec §4.3). Null is the "410 Gone" case: they're not
 * available to you any more (a block, either way), so the client drops the card.
 */
export async function deckCard(me: string, id: string): Promise<CardView | null> {
  if (typeof id !== 'string' || !CURSOR.test(id) || id === me) return null;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return null;
  if (await blockedBetween(me, id)) return null;
  return cardView(user, me);
}
