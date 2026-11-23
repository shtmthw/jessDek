import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { deckLimiter } from '../src/services/deck.js';
import { Client, newApp, resetDb, signUp, type GqlResult } from './helpers.js';

/**
 * The card deck (CARD_LOADING.md §3-4, CARD_DECK_PLAN.md §3): who matches, how a deck starts, how
 * the two ends page and wrap, and who is kept out. Acceptance tests 1, 4, 7, 8 and 10 of the spec.
 */

let app: FastifyInstance;
beforeAll(async () => {
  app = await newApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(resetDb);

const F = `id recipe shared user { username displayName }`;
const START = `{ deckStart { mode n cards { ${F} } m { ${F} } right { ${F} } left { ${F} } } }`;
const PAGE = `query($d: DeckDir!, $c: ID!, $l: Int) { deckCards(dir: $d, cursor: $c, limit: $l) { wrapped cards { ${F} } } }`;
const CARD = `query($id: ID!) { deckCard(id: $id) { ${F} } }`;
const SAVE = `mutation($r: String) { updateCard(input: { recipe: $r }) { id } }`;
const BLOCK = `mutation($u: ID!) { blockUser(userId: $u) { id } }`;

const recipe = (...interests: unknown[]) => JSON.stringify({ v: 1, interests });

/** Signs up `name` (through the API) and saves a card with these interests. */
async function person(name: string, interests: unknown[] = ['chess']) {
  const client = new Client(app);
  const user = await signUp(client, name);
  const res = await client.gql(SAVE, { r: recipe(...interests) });
  expect(res.errors).toBeUndefined();
  return { client, ...user };
}

/**
 * `count` people with ids u0001, u0004, u0007 … (gaps on purpose: the deck must never assume
 * neighbouring ids). Made straight in the database: signing up is slow.
 */
async function crowd(count: number, keys = ['id:chess'], prefix = 'u') {
  const ids = Array.from(
    { length: count },
    (_, i) => `${prefix}${String(i * 3 + 1).padStart(4, '0')}`,
  );
  await prisma.user.createMany({
    data: ids.map((id) => ({
      id,
      username: `${prefix}_${id.slice(1)}`,
      displayName: `Person ${id}`,
      email: `${id}@crowd.test`,
      passwordHash: 'x',
      interestKeys: keys,
    })),
  });
  return ids;
}

const startOf = async (c: Client) => (await c.gql(START)).data!.deckStart;
const idsOf = (cards: Array<{ id: string }>) => cards.map((c) => c.id);

/** `k` ids next to `m` in a circle of ascending ids: right = after it, left = before it (nearest first). */
function around(all: string[], m: string, dir: 'right' | 'left', k: number) {
  const i = all.indexOf(m);
  const n = all.length;
  return Array.from(
    { length: k },
    (_, j) => all[(((dir === 'right' ? i + 1 + j : i - 1 - j) % n) + n) % n]!,
  );
}

describe('deckStart', () => {
  it.each([0, 1, 3, 4, 5, 21])('n = %i: the whole deck comes in one go (or none)', async (n) => {
    const me = await person('viewer');
    const all = await crowd(n);
    const d = await startOf(me.client);
    expect(d.n).toBe(n);
    if (n === 0) {
      expect(d).toMatchObject({ mode: 'EMPTY', cards: [], m: null, right: [], left: [] });
      return;
    }
    expect(d.mode).toBe('SMALL');
    expect(d.m).toBeNull();
    expect(d.right).toEqual([]);
    expect(d.left).toEqual([]);
    // M first, then ascending ids with wrap: a rotation of the sorted list.
    const ids = idsOf(d.cards);
    expect(ids).toHaveLength(n);
    expect(ids).toEqual([ids[0], ...around(all, ids[0]!, 'right', n - 1)]);
    expect(new Set(ids)).toEqual(new Set(all));
  });

  it.each([22, 100])(
    'n = %i is large mode: M plus five each side, wrapped in id order',
    async (n) => {
      const me = await person('viewer');
      const all = await crowd(n);
      const d = await startOf(me.client);
      expect(d).toMatchObject({ mode: 'LARGE', n, cards: [] });
      const m = d.m.id as string;
      expect(idsOf(d.right)).toEqual(around(all, m, 'right', 5));
      expect(idsOf(d.left)).toEqual(around(all, m, 'left', 5));
    },
  );

  it('picks M at random from the matches (and only M)', async () => {
    const me = await person('viewer');
    await crowd(30);
    const seen = new Set<string>();
    for (let i = 0; i < 25; i++) seen.add((await startOf(me.client)).m.id);
    expect(seen.size).toBeGreaterThan(3);
  });

  it('counts the viewer out, and everyone with no shared interest', async () => {
    const me = await person('viewer', ['chess', 'hiking']);
    await crowd(3, ['id:hiking']);
    await crowd(2, ['id:knitting'], 'k');
    await crowd(2, [], 'z');
    await crowd(1, ['id:chess', 'id:knitting'], 'b');
    const d = await startOf(me.client);
    expect(d.n).toBe(4); // 3 hikers + 1 who also plays chess
    expect(idsOf(d.cards)).not.toContain(me.id);
    expect(d.cards.every((c: any) => /^(u|b)\d/.test(c.id))).toBe(true);
  });

  it('is empty for someone with no interests', async () => {
    const me = await person('viewer', []);
    await crowd(5);
    expect(await startOf(me.client)).toMatchObject({ mode: 'EMPTY', n: 0 });
  });

  it('needs a signed-in user', async () => {
    const res = await new Client(app).gql(START);
    expect(res.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
  });
});

describe('deckCards', () => {
  const page = async (c: Client, dir: 'LEFT' | 'RIGHT', cursor: string, limit?: number) =>
    (await c.gql(PAGE, { d: dir, c: cursor, l: limit })).data!.deckCards as {
      wrapped: boolean;
      cards: Array<{ id: string }>;
    };

  it('pages right in ascending id order and left in descending order', async () => {
    const me = await person('viewer');
    const all = await crowd(40);
    const right = await page(me.client, 'RIGHT', all[10]!);
    expect(right.wrapped).toBe(false);
    expect(idsOf(right.cards)).toEqual(all.slice(11, 16));
    const left = await page(me.client, 'LEFT', all[10]!);
    expect(left.wrapped).toBe(false);
    expect(idsOf(left.cards)).toEqual(all.slice(5, 10).reverse());
  });

  it('continues from the smallest id past the end, with no repeats and no skips', async () => {
    const me = await person('viewer');
    const all = await crowd(40);
    const right = await page(me.client, 'RIGHT', all[37]!);
    expect(right.wrapped).toBe(true);
    expect(idsOf(right.cards)).toEqual([all[38], all[39], all[0], all[1], all[2]]);
    const atEnd = await page(me.client, 'RIGHT', all[39]!);
    expect(idsOf(atEnd.cards)).toEqual(all.slice(0, 5));
    const left = await page(me.client, 'LEFT', all[1]!);
    expect(left.wrapped).toBe(true);
    expect(idsOf(left.cards)).toEqual([all[0], all[39], all[38], all[37], all[36]]);
  });

  it('goes all the way round the circle exactly once', async () => {
    const me = await person('viewer');
    const all = await crowd(33);
    const d = await startOf(me.client);
    const m = d.m.id as string;
    const seen = [m, ...idsOf(d.right)];
    while (seen.length < all.length) {
      const next = await page(me.client, 'RIGHT', seen.at(-1)!);
      seen.push(...idsOf(next.cards));
    }
    const lap = seen.slice(0, all.length);
    expect(new Set(lap).size).toBe(all.length);
    expect(lap).toEqual([m, ...around(all, m, 'right', all.length - 1)]);
  });

  it('clamps the limit to 1…5', async () => {
    const me = await person('viewer');
    const all = await crowd(40);
    expect((await page(me.client, 'RIGHT', all[0]!, 100)).cards).toHaveLength(5);
    expect((await page(me.client, 'RIGHT', all[0]!, 0)).cards).toHaveLength(1);
    expect((await page(me.client, 'RIGHT', all[0]!, -4)).cards).toHaveLength(1);
    expect((await page(me.client, 'RIGHT', all[0]!, 3)).cards).toHaveLength(3);
    expect((await page(me.client, 'RIGHT', all[0]!)).cards).toHaveLength(5);
  });

  it('rejects a cursor that is not an id', async () => {
    const me = await person('viewer');
    for (const bad of ['x\'; DROP TABLE "User"; --', '', 'a b', 'ü', 'x'.repeat(41)]) {
      const res: GqlResult = await me.client.gql(PAGE, { d: 'RIGHT', c: bad });
      expect(res.errors?.[0]?.extensions?.code, bad).toBe('BAD_USER_INPUT');
    }
    expect(await prisma.user.count()).toBe(1);
  });

  it('never repeats a card within one answer, even in a tiny deck', async () => {
    const me = await person('viewer');
    const all = await crowd(3);
    const res = await page(me.client, 'RIGHT', all[2]!, 5);
    expect(idsOf(res.cards)).toEqual(all);
  });

  it('is empty when nobody matches', async () => {
    const me = await person('viewer');
    await crowd(30, ['id:knitting']);
    expect(await page(me.client, 'RIGHT', 'u0001')).toEqual({ wrapped: true, cards: [] });
  });
});

describe('who is kept out', () => {
  it('leaves out people in a block either way, from start and from paging', async () => {
    const me = await person('viewer');
    const ids = await crowd(30);
    const blockedByMe = await person('byme');
    const blocksMe = await person('blocksme');
    expect((await me.client.gql(BLOCK, { u: blockedByMe.id })).errors).toBeUndefined();
    expect((await blocksMe.client.gql(BLOCK, { u: me.id })).errors).toBeUndefined();

    const d = await startOf(me.client);
    expect(d.n).toBe(30);
    const everyone = new Set<string>();
    let cursor = ids[0]!;
    for (let i = 0; i < 12; i++) {
      const p = (await me.client.gql(PAGE, { d: 'RIGHT', c: cursor })).data!.deckCards;
      p.cards.forEach((c: any) => everyone.add(c.id));
      cursor = p.cards.at(-1).id;
    }
    expect(everyone.has(blockedByMe.id)).toBe(false);
    expect(everyone.has(blocksMe.id)).toBe(false);
    expect(everyone.size).toBe(30);
  });

  it('a block made mid-session shows up as null (the 410 case) for a card already loaded', async () => {
    const me = await person('viewer');
    const them = await person('them');
    expect((await me.client.gql(CARD, { id: them.id })).data!.deckCard.user.username).toBe('them');
    await them.client.gql(BLOCK, { u: me.id });
    expect((await me.client.gql(CARD, { id: them.id })).data!.deckCard).toBeNull();
    // …and the other way round.
    const third = await person('third');
    await me.client.gql(BLOCK, { u: third.id });
    expect((await me.client.gql(CARD, { id: third.id })).data!.deckCard).toBeNull();
  });

  it('deckCard is null for yourself, for nobody and for junk', async () => {
    const me = await person('viewer');
    for (const id of [me.id, 'nobody', "x'--"]) {
      expect((await me.client.gql(CARD, { id })).data?.deckCard ?? null, id).toBeNull();
    }
  });
});

describe('security', () => {
  it('has no way to name who you are: `me` is the session', async () => {
    const me = await person('viewer');
    const other = await person('other', ['chess']);
    const res = await me.client.gql(`{ deckStart(me: "${other.id}") { n } }`);
    expect(res.errors?.[0]?.message).toMatch(/Unknown argument/);
    const res2 = await me.client.gql(
      `query($c: ID!) { deckCards(dir: RIGHT, cursor: $c, userId: "x") { wrapped } }`,
      {
        c: 'u0001',
      },
    );
    expect(res2.errors?.[0]?.message).toMatch(/Unknown argument/);
  });

  it('shows display fields only', async () => {
    const me = await person('viewer');
    await crowd(3);
    const d = await startOf(me.client);
    for (const c of d.cards) {
      expect(Object.keys(c).sort()).toEqual(['id', 'recipe', 'shared', 'user']);
      expect(c.shared).toBeNull();
    }
    for (const field of ['email', 'passwordHash', 'interestKeys']) {
      const res = await me.client.gql(`{ deckStart { cards { user { ${field} } } } }`);
      expect(res.errors?.[0]?.message, field).toMatch(/Cannot query field/);
      const card = await me.client.gql(`{ deckStart { cards { ${field} } } }`);
      expect(card.errors?.[0]?.message, field).toMatch(/Cannot query field/);
    }
  });

  it('rate-limits a runaway client', async () => {
    const me = await person('viewer');
    await crowd(30);
    let last: GqlResult | undefined;
    for (let i = 0; i < 241; i++) last = await me.client.gql(PAGE, { d: 'RIGHT', c: 'u0001' });
    expect(last?.errors?.[0]?.extensions?.code).toBe('RATE_LIMITED');
    deckLimiter.clear();
  });
});

describe('interest keys follow the card', () => {
  const keysOf = async (id: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { id } })).interestKeys.sort();

  it('are written on every save: built-ins as id:, custom words lower-cased as t:', async () => {
    const me = await person('viewer', [
      'chess',
      { t: 'Mechanical Keebs', e: '⌨️' },
      'hiking',
      'chess',
    ]);
    expect(await keysOf(me.id)).toEqual(['id:chess', 'id:hiking', 't:mechanical keebs']);
    await me.client.gql(SAVE, { r: recipe('yoga') });
    expect(await keysOf(me.id)).toEqual(['id:yoga']);
    await me.client.gql(SAVE, { r: null });
    expect(await keysOf(me.id)).toEqual([]);
  });

  it('match people on a shared interest, custom words without regard to case', async () => {
    const a = await person('alice', [{ t: 'Synths' }]);
    const b = await person('bob', [{ t: 'synths' }, 'cats']);
    const c = await person('carol', ['cats']);
    expect((await startOf(a.client)).cards.map((x: any) => x.user.username)).toEqual(['bob']);
    expect((await startOf(b.client)).cards.map((x: any) => x.user.username).sort()).toEqual([
      'alice',
      'carol',
    ]);
    expect((await startOf(c.client)).cards.map((x: any) => x.user.username)).toEqual(['bob']);
  });

  it('a change to the card changes who matches straight away', async () => {
    const a = await person('alice', ['chess']);
    await person('bob', ['hiking']);
    expect((await startOf(a.client)).n).toBe(0);
    await a.client.gql(SAVE, { r: recipe('chess', 'hiking') });
    expect((await startOf(a.client)).n).toBe(1);
  });

  it('are backfilled by the migration for cards saved before the deck existed', async () => {
    // Re-run the migration's UPDATE on a card stored the way an older save left it.
    const me = await person('viewer', []);
    await prisma.user.update({
      where: { id: me.id },
      data: { card: recipe('chess', { t: 'Trail Maps' }, 'chess'), interestKeys: [] },
    });
    await prisma.$executeRawUnsafe(`
      UPDATE "User" u SET "interestKeys" = COALESCE((
        SELECT array_agg(DISTINCT s.k) FROM (
          SELECT CASE WHEN jsonb_typeof(e) = 'string' THEN 'id:' || (e #>> '{}')
                      WHEN jsonb_typeof(e) = 'object' AND e ? 't' THEN 't:' || lower(e ->> 't') END AS k
          FROM jsonb_array_elements(CASE WHEN jsonb_typeof(u."card"::jsonb -> 'interests') = 'array'
                                         THEN u."card"::jsonb -> 'interests' ELSE '[]'::jsonb END) AS e) s
        WHERE s.k IS NOT NULL), ARRAY[]::TEXT[])
      WHERE u."card" IS NOT NULL`);
    expect(await keysOf(me.id)).toEqual(['id:chess', 't:trail maps']);
  });
});
