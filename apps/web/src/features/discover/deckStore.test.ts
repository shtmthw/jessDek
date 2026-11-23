import { describe, expect, it, vi } from 'vitest';
import {
  BUFFER_MAX_PER_SIDE,
  DeckStore,
  mod,
  type DeckEvent,
  type DeckStartData,
} from './deckStore';

/**
 * The deck's loading rules (CARD_LOADING.md §5, acceptance tests 2, 3, 4, 5, 6 and 9) against a fake
 * server that pages the way services/deck.ts does: keyset in id order, wrapping at the ends.
 */

type C = { id: string };
/** No test needs anywhere near this many page requests. */
const MAX_CALLS = 500;
const tick = () => new Promise((r) => setTimeout(r, 0));

function fakeServer(count: number, { deferred = false } = {}) {
  // Gaps between ids on purpose: neighbours are never computed, only paged.
  let ids: string[] = Array.from(
    { length: count },
    (_, i) => `u${String(i * 3 + 1).padStart(4, '0')}`,
  );
  const page = (dir: 'LEFT' | 'RIGHT', cursor: string, limit: number): C[] => {
    const asc = [...ids].sort();
    const ordered = dir === 'RIGHT' ? asc : [...asc].reverse();
    const first = ordered
      .filter((id) => (dir === 'RIGHT' ? id > cursor : id < cursor))
      .slice(0, limit);
    const out = [...first];
    if (out.length < limit)
      for (const id of ordered.slice(0, limit - first.length)) if (!out.includes(id)) out.push(id);
    return out.map((id) => ({ id }));
  };
  const pending: Array<{
    dir: 'LEFT' | 'RIGHT';
    cursor: string;
    resolve: () => void;
    fail: () => void;
  }> = [];
  const calls: Array<{ dir: 'LEFT' | 'RIGHT'; cursor: string; limit: number }> = [];
  const fetchPage = vi.fn((dir: 'LEFT' | 'RIGHT', cursor: string, limit: number) => {
    calls.push({ dir, cursor, limit });
    // A store stuck re-asking would otherwise spin through microtasks forever and eat all memory
    // (it never yields, so test timeouts can't fire). Refuse instead, so that bug fails fast.
    if (calls.length > MAX_CALLS)
      return Promise.reject(new Error('runaway: too many page requests'));
    if (!deferred) return Promise.resolve(page(dir, cursor, limit));
    return new Promise<C[]>((resolve, reject) =>
      pending.push({
        dir,
        cursor,
        resolve: () => resolve(page(dir, cursor, limit)),
        fail: () => reject(new Error('offline')),
      }),
    );
  });
  const start = (mIndex: number): DeckStartData<C> => {
    const sorted = [...ids].sort();
    const n = sorted.length;
    if (n === 0) return { mode: 'EMPTY', n: 0, cards: [], m: null, right: [], left: [] };
    const m = sorted[mIndex]!;
    if (n <= 21) {
      const at = sorted.indexOf(m);
      return {
        mode: 'SMALL',
        n,
        cards: [...sorted.slice(at), ...sorted.slice(0, at)].map((id) => ({ id })),
        m: null,
        right: [],
        left: [],
      };
    }
    return {
      mode: 'LARGE',
      n,
      cards: [],
      m: { id: m },
      right: page('RIGHT', m, 5),
      left: page('LEFT', m, 5),
    };
  };
  return {
    get ids() {
      return [...ids].sort();
    },
    drop: (id: string) => (ids = ids.filter((x) => x !== id)),
    fetchPage,
    calls,
    pending,
    start,
    /** Answers every request waiting (in the order they were made). */
    async flush() {
      while (pending.length) pending.shift()!.resolve();
      await tick();
    },
  };
}

async function deck(count: number, mIndex = 0, opts: { deferred?: boolean } = {}) {
  const server = fakeServer(count, opts);
  const events: DeckEvent[] = [];
  const fetchStart = vi.fn(async () => server.start(mIndex));
  const store = new DeckStore<C>(fetchStart, server.fetchPage, { onEvent: (e) => events.push(e) });
  await store.ensureStarted();
  await tick();
  return { server, store, events, fetchStart };
}

const fanIds = (store: DeckStore<C>) => store.slots(2).map((s) => s.card?.id ?? null);
const middle = (store: DeckStore<C>) => store.current()!.id;
const noRepeats = (store: DeckStore<C>) => {
  const ids = store.slots(3).flatMap((s) => (s.card ? [s.card.id] : []));
  return new Set(ids).size === ids.length;
};

describe('starting', () => {
  it('an empty deck has no fan and asks for nothing', async () => {
    const { store, server } = await deck(0);
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', mode: 'empty', n: 0 });
    expect(store.slots(2)).toEqual([]);
    expect(store.moveRight()).toBe(false);
    expect(server.fetchPage).not.toHaveBeenCalled();
  });

  it('a large deck starts with five each side and asks for nothing more', async () => {
    const { store, server } = await deck(40, 20);
    const s = store.getSnapshot();
    expect(s.mode).toBe('large');
    expect(s.right).toHaveLength(5);
    expect(s.left).toHaveLength(5);
    expect(server.fetchPage).not.toHaveBeenCalled();
  });

  it('Back to CD: an open deck is reused, not dealt again (acceptance 9)', async () => {
    const { store, fetchStart, server } = await deck(40, 3);
    store.step(4);
    await tick();
    const before = store.getSnapshot();
    const calls = server.fetchPage.mock.calls.length;
    // The fan unmounts (card view) and mounts again (Back to deck): it calls ensureStarted.
    await store.ensureStarted();
    expect(fetchStart).toHaveBeenCalledTimes(1);
    expect(server.fetchPage.mock.calls.length).toBe(calls);
    expect(store.getSnapshot()).toBe(before);
  });

  it('restart deals a new deck and ignores answers meant for the old one', async () => {
    const { store, server, fetchStart } = await deck(40, 3, { deferred: true });
    store.moveRight(); // a right refill is now waiting
    expect(server.pending).toHaveLength(1);
    await store.restart();
    await server.flush(); // the old answer arrives late
    expect(fetchStart).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().right).toHaveLength(5);
    expect(store.getSnapshot().inFlight).toEqual({ left: null, right: null });
  });
});

describe('small decks (acceptance 2)', () => {
  it.each([5, 7, 21])(
    'n = %i: everything arrives at once, loops, and never asks for more',
    async (n) => {
      const { store, server } = await deck(n, 2);
      const ring = store.getSnapshot().ring.map((c) => c.id);
      expect(ring).toHaveLength(n);
      for (let i = 0; i < 3 * n; i++) {
        expect(store.moveRight()).toBe(true);
        expect(middle(store)).toBe(ring[mod(i + 1, n)]);
        expect(noRepeats(store)).toBe(true);
      }
      for (let i = 0; i < 2 * n; i++) expect(store.moveLeft()).toBe(true);
      expect(server.fetchPage).not.toHaveBeenCalled();
    },
  );

  it.each([
    [1, [0]],
    [2, [0, 1]],
    [3, [-1, 0, 1]],
    [4, [-1, 0, 1, 2]],
  ])('n = %i shows positions %j, nobody twice, and stops at the ends', async (n, positions) => {
    const { store, server } = await deck(n, 0);
    expect(store.slots(2).map((s) => s.k)).toEqual(positions);
    expect(store.slots(3).map((s) => s.k)).toEqual(positions); // nothing hides beyond the edges either
    const ids = fanIds(store);
    expect(new Set(ids).size).toBe(n);
    // Walk to the right end, then bounce.
    const right = Math.max(...positions);
    for (let i = 0; i < right; i++) expect(store.moveRight()).toBe(true);
    expect(store.moveRight()).toBe(false);
    // …and to the left end.
    for (let i = 0; i < n - 1; i++) expect(store.moveLeft()).toBe(true);
    expect(store.moveLeft()).toBe(false);
    expect(store.reach()).toEqual({ left: 0, right: n - 1 });
    expect(server.fetchPage).not.toHaveBeenCalled();
  });

  it('n = 5 or 6 never draws a card twice in the animation slots (±3)', async () => {
    for (const n of [5, 6]) {
      const { store } = await deck(n, 0);
      for (let i = 0; i < n; i++) {
        expect(noRepeats(store)).toBe(true);
        store.moveRight();
      }
    }
  });
});

describe('large decks', () => {
  it('30 moves right: one refill on the first move, then one per 5 moves; no side over 10 (acceptance 3)', async () => {
    const { store, events } = await deck(100, 50);
    const refillMoves: number[] = [];
    for (let i = 1; i <= 30; i++) {
      const before = events.filter((e) => e.type === 'refill').length;
      expect(store.moveRight()).toBe(true);
      await tick();
      if (events.filter((e) => e.type === 'refill').length > before) refillMoves.push(i);
      const s = store.getSnapshot();
      expect(s.right.length).toBeLessThanOrEqual(BUFFER_MAX_PER_SIDE);
      expect(s.left.length).toBeLessThanOrEqual(BUFFER_MAX_PER_SIDE);
    }
    expect(refillMoves).toEqual([1, 6, 11, 16, 21, 26]);
    expect(store.metrics()).toMatchObject({ moves: 30, refills: 6, bufferEmpty: 0 });
  });

  it('wraps past the largest id to the smallest, with no repeats and no skips (acceptance 4)', async () => {
    const { store, server } = await deck(30, 27);
    const ring = server.ids;
    const seen = [middle(store)];
    for (let i = 0; i < 40; i++) {
      expect(store.moveRight()).toBe(true);
      await tick();
      seen.push(middle(store));
    }
    expect(seen).toEqual(Array.from({ length: 41 }, (_, i) => ring[mod(27 + i, 30)]));
  });

  it('going back after eviction fetches exactly the evicted cards, in order (acceptance 5)', async () => {
    const { store, server } = await deck(60, 30);
    const ring = server.ids;
    for (let i = 0; i < 30; i++) {
      store.moveRight();
      await tick();
    }
    expect(store.getSnapshot().left).toHaveLength(BUFFER_MAX_PER_SIDE); // the rest were evicted
    expect(middle(store)).toBe(ring[60 % 60]); // 30 + 30 wraps to index 0
    server.calls.length = 0;
    const seen: string[] = [];
    for (let i = 0; i < 30; i++) {
      expect(store.moveLeft()).toBe(true);
      await tick();
      seen.push(middle(store));
    }
    expect(seen).toEqual(Array.from({ length: 30 }, (_, i) => ring[mod(-1 - i, 60)]));
    // The first left refill started from the farthest card kept on the left, right after the evicted ones.
    const first = server.calls.find((c) => c.dir === 'LEFT')!;
    expect(first.cursor).toBe(ring[mod(-BUFFER_MAX_PER_SIDE, 60)]);
  });

  it('20 rapid moves: one request in flight per side at most, and nobody twice in the fan (acceptance 6)', async () => {
    const { store, server } = await deck(80, 10, { deferred: true });
    let moved = 0;
    for (let i = 0; i < 20; i++) {
      // A burst: answers only arrive every third move.
      if (i % 3 === 2) await server.flush();
      if (store.moveRight()) moved += 1;
      const waiting = server.pending.map((p) => p.dir);
      expect(waiting.filter((d) => d === 'RIGHT').length).toBeLessThanOrEqual(1);
      expect(waiting.filter((d) => d === 'LEFT').length).toBeLessThanOrEqual(1);
      expect(noRepeats(store)).toBe(true);
    }
    await server.flush();
    expect(moved).toBe(20);
    expect(store.metrics().bufferEmpty).toBe(0);
  });

  it('holds M (and counts buffer_empty) when the next card has not arrived', async () => {
    const { store, server, events } = await deck(80, 10, { deferred: true });
    for (let i = 0; i < 5; i++) expect(store.moveRight()).toBe(true);
    expect(store.getSnapshot().right).toHaveLength(0);
    const m = middle(store);
    expect(store.moveRight()).toBe(false);
    expect(middle(store)).toBe(m);
    expect(events.some((e) => e.type === 'buffer_empty')).toBe(true);
    expect(store.metrics().bufferEmpty).toBe(1);
    // An edge that's on its way draws as a skeleton.
    expect(store.cardAt(1)).toBeNull();
    await server.flush();
    expect(store.moveRight()).toBe(true);
  });

  it('drops a stale refill whose side changed meanwhile', async () => {
    const { store, server, events } = await deck(80, 40, { deferred: true });
    store.moveLeft(); // left: 4 → a left refill goes out
    expect(server.pending.map((p) => p.dir)).toEqual(['LEFT']);
    const before = store.getSnapshot().left.map((c) => c.id);
    // Change direction until the left side's farthest card is evicted.
    for (let i = 0; i < 8; i++) {
      store.moveRight();
      if (server.pending.some((p) => p.dir === 'RIGHT')) {
        const i2 = server.pending.findIndex((p) => p.dir === 'RIGHT');
        server.pending.splice(i2, 1)[0]!.resolve();
        await tick();
      }
    }
    const leftNow = store.getSnapshot().left.map((c) => c.id);
    expect(leftNow.at(-1)).not.toBe(before.at(-1));
    await server.flush(); // the old left answer
    expect(events.some((e) => e.type === 'stale' && e.side === 'left')).toBe(true);
    expect(store.getSnapshot().left.map((c) => c.id)).toEqual(leftNow);
  });

  it('a failed refill is retried on the next move, not in a loop', async () => {
    const { store, server } = await deck(80, 10, { deferred: true });
    store.moveRight();
    server.pending.shift()!.fail();
    await tick();
    expect(store.getSnapshot().inFlight.right).toBeNull();
    expect(server.calls).toHaveLength(1);
    store.moveRight();
    expect(server.calls).toHaveLength(2);
  });

  it('skips repeats when the deck shrank, and does not ask again from the same card', async () => {
    const { store, server } = await deck(23, 0);
    // Everyone but the loaded ones leaves: a refill can only bring back cards already here.
    const loaded = new Set([
      middle(store),
      ...store.getSnapshot().right.map((c) => c.id),
      ...store.getSnapshot().left.map((c) => c.id),
    ]);
    for (const id of server.ids) if (!loaded.has(id)) server.drop(id);
    store.moveRight();
    await tick();
    await tick();
    expect(noRepeats(store)).toBe(true);
    const calls = server.calls.length;
    await tick();
    expect(server.calls.length).toBe(calls); // no request loop
    expect(calls).toBeLessThanOrEqual(2);
  });
});

describe('someone gone (410)', () => {
  it('large: removing M brings the next card in and tops that side up', async () => {
    const { store, server } = await deck(60, 30);
    const next = store.getSnapshot().right[0]!.id;
    store.remove(middle(store));
    await tick();
    expect(middle(store)).toBe(next);
    expect(store.getSnapshot().n).toBe(59);
    expect(noRepeats(store)).toBe(true);
    expect(server.calls.some((c) => c.dir === 'RIGHT')).toBe(true);
  });

  it('large: removing a side card closes the gap', async () => {
    const { store } = await deck(60, 30);
    const [a, b, c] = store.getSnapshot().left.map((x) => x.id);
    store.remove(b!);
    expect(
      store
        .getSnapshot()
        .left.slice(0, 2)
        .map((x) => x.id),
    ).toEqual([a, c]);
  });

  it('small: the deck shrinks without repeats, and a 5-card deck stops looping at 4', async () => {
    const { store } = await deck(5, 0);
    expect(store.getSnapshot().loop).toBe(true);
    store.moveRight();
    const gone = middle(store);
    const after = store.cardAt(1)!.id;
    store.remove(gone);
    expect(middle(store)).toBe(after);
    expect(store.getSnapshot()).toMatchObject({ n: 4, loop: false });
    expect(store.slots(2).map((s) => s.k)).toEqual([-1, 0, 1, 2]);
    expect(noRepeats(store)).toBe(true);
  });

  it('removing the last card leaves an empty deck', async () => {
    const { store } = await deck(1, 0);
    store.remove(middle(store));
    expect(store.getSnapshot().mode).toBe('empty');
    expect(store.slots(2)).toEqual([]);
  });
});

describe('metrics', () => {
  it('counts cards loaded but never shown', async () => {
    const { store } = await deck(40, 20);
    // 11 loaded, the fan shows 5: 6 never seen.
    expect(store.metrics().unused).toBe(6);
    store.moveRight();
    await tick();
    expect(store.metrics().unused).toBe(10); // 1 more seen, 5 more loaded
    expect(store.metrics().refillP95Ms).not.toBeNull();
  });
});
