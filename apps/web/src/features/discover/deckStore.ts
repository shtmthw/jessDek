/**
 * The card deck's loading state machine: CARD_LOADING.md §5, CARD_DECK_PLAN.md §4.1.
 * Plain TypeScript (no React) so it can be tested on its own; `useDeck` reads it.
 *
 * - M is the middle card (position 0). Left of it are positions −1, −2, …; right are +1, +2, ….
 * - Small decks (n ≤ 21) arrive whole and never ask for more.
 * - Large decks keep each side topped up from the server, one request in flight per side, and at most
 *   BUFFER_MAX_PER_SIDE cards a side. Swiping is a rotation in id order that wraps.
 */

export const BATCH_SIZE = 5;
export const VISIBLE_PER_SIDE = 2;
export const OFFSCREEN_MIN_PER_SIDE = 3;
export const BUFFER_MAX_PER_SIDE = 10;
export const SMALL_DECK_MAX = 1 + 2 * BUFFER_MAX_PER_SIDE;
/** Smallest deck that loops; smaller ones stop at their ends (§5.7). */
export const LOOP_MIN = 1 + 2 * VISIBLE_PER_SIDE;

export type Side = 'left' | 'right';
export type DeckMode = 'empty' | 'small' | 'large';
export type DeckStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface DeckStartData<T> {
  mode: 'EMPTY' | 'SMALL' | 'LARGE';
  n: number;
  cards: T[];
  m: T | null;
  right: T[];
  left: T[];
}

export type FetchStart<T> = () => Promise<DeckStartData<T>>;
/** RIGHT: ids after `cursor`, ascending; LEFT: before it, descending. Nearest first, wrapping. */
export type FetchPage<T> = (dir: 'LEFT' | 'RIGHT', cursor: string, limit: number) => Promise<T[]>;

export type DeckEvent =
  | { type: 'start'; mode: DeckMode; n: number }
  | { type: 'move'; dir: Side }
  | { type: 'refill'; side: Side; cursor: string }
  | { type: 'refilled'; side: Side; added: number; ms: number }
  | { type: 'stale'; side: Side }
  | { type: 'refill_failed'; side: Side }
  /** The card that would become M wasn't loaded yet (spec §7: target ≈ 0). */
  | { type: 'buffer_empty'; side: Side }
  | { type: 'removed'; id: string };

export interface DeckSnapshot<T> {
  status: DeckStatus;
  mode: DeckMode;
  /** Matches when the deck started (the server's count, less anyone removed since). */
  n: number;
  /** Large: the middle card. Small: see `ring` / `pos`. */
  m: T | null;
  /** Large: loaded cards each side of M, nearest first. */
  left: readonly T[];
  right: readonly T[];
  /** Small: every card, the starting M first, then id order with wrap. */
  ring: readonly T[];
  /** Small: where M is, counted from the starting M (can go negative). */
  pos: number;
  /** Small: whether the deck loops (n ≥ 5). */
  loop: boolean;
  inFlight: { left: string | null; right: string | null };
  /** Bumped on every change. */
  version: number;
}

export interface DeckMetrics {
  moves: number;
  refills: number;
  bufferEmpty: number;
  /** Client-side refill latency (request sent → cards appended), p95, in ms. */
  refillP95Ms: number | null;
  /** Cards loaded but never in the visible fan. */
  unused: number;
}

/** `mod` that is never negative (JS `%` keeps the sign of `p`). */
export const mod = (p: number, n: number) => ((p % n) + n) % n;

const EMPTY_SIDES = { left: null, right: null };

export class DeckStore<T extends { id: string }> {
  private status: DeckStatus = 'idle';
  private mode: DeckMode = 'empty';
  private n = 0;
  private m: T | null = null;
  private sides: Record<Side, T[]> = { left: [], right: [] };
  private ring: T[] = [];
  private pos = 0;
  private inFlight: Record<Side, string | null> = { ...EMPTY_SIDES };
  /** A cursor whose last refill added nothing (all repeats, or none left): don't ask again from it. */
  private stalled: Record<Side, string | null> = { ...EMPTY_SIDES };
  private sentAt: Record<Side, number> = { left: 0, right: 0 };
  /** Bumped by every start, so answers meant for an older deck are dropped. */
  private session = 0;
  private version = 0;
  private snap: DeckSnapshot<T>;
  private listeners = new Set<() => void>();

  private counters = { moves: 0, refills: 0, bufferEmpty: 0 };
  private latencies: number[] = [];
  private loaded = new Set<string>();
  private shown = new Set<string>();

  constructor(
    private readonly fetchStart: FetchStart<T>,
    private readonly fetchPage: FetchPage<T>,
    private readonly opts: { onEvent?: (e: DeckEvent) => void; now?: () => number } = {},
  ) {
    this.snap = this.build();
  }

  // ---- reading -------------------------------------------------------------------------------

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };

  getSnapshot = (): DeckSnapshot<T> => this.snap;

  /** Small, non-looping decks: the positions M can take, relative to the starting M. */
  private bounds(): [number, number] {
    const n = this.ring.length;
    const lo = -Math.floor((n - 1) / 2);
    return [lo, lo + n - 1];
  }

  private isLoop() {
    return this.mode === 'small' && this.ring.length >= LOOP_MIN;
  }

  /**
   * The card at position `k` from M: a card, `null` when that position exists but hasn't loaded
   * (draw a skeleton), or `undefined` when there's no such position (an end of a small deck, or no deck).
   */
  cardAt(k: number): T | null | undefined {
    if (this.status !== 'ready') return undefined;
    if (this.mode === 'large') {
      if (k === 0) return this.m;
      const side = k > 0 ? this.sides.right : this.sides.left;
      return side[Math.abs(k) - 1] ?? null;
    }
    if (this.mode === 'small') {
      const n = this.ring.length;
      if (n === 0) return undefined;
      if (this.isLoop()) return this.ring[mod(this.pos + k, n)];
      const [lo, hi] = this.bounds();
      const p = this.pos + k;
      return p < lo || p > hi ? undefined : this.ring[mod(p, n)];
    }
    return undefined;
  }

  /** The middle card, if any. */
  current(): T | null {
    return this.cardAt(0) ?? null;
  }

  /**
   * Positions −range…+range that exist, each card once: where a small looping deck would show a card
   * twice (n = 5 or 6 with range 3), the copy nearer the middle wins.
   */
  slots(range = VISIBLE_PER_SIDE): Array<{ k: number; card: T | null }> {
    const out: Array<{ k: number; card: T | null }> = [];
    const seen = new Set<string>();
    const order = [0];
    for (let d = 1; d <= range; d++) order.push(-d, d);
    for (const k of order) {
      const card = this.cardAt(k);
      if (card === undefined) continue;
      if (card) {
        if (seen.has(card.id)) continue;
        seen.add(card.id);
      }
      out.push({ k, card });
    }
    return out.sort((a, b) => a.k - b.k);
  }

  /** How many moves are possible right now in each direction (Infinity: it loops). */
  reach(): Record<Side, number> {
    if (this.status !== 'ready' || this.mode === 'empty') return { left: 0, right: 0 };
    if (this.mode === 'large') {
      return { left: this.sides.left.length, right: this.sides.right.length };
    }
    if (this.isLoop()) return { left: Infinity, right: Infinity };
    const [lo, hi] = this.bounds();
    return { left: this.pos - lo, right: hi - this.pos };
  }

  /** A loaded card, wherever it sits. */
  find(pred: (card: T) => boolean): T | undefined {
    const all =
      this.mode === 'large' ? [this.m, ...this.sides.left, ...this.sides.right] : this.ring;
    return all.find((c): c is T => Boolean(c) && pred(c as T)) ?? undefined;
  }

  metrics(): DeckMetrics {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const p95 = sorted.length
      ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]!
      : null;
    let unused = 0;
    for (const id of this.loaded) if (!this.shown.has(id)) unused += 1;
    return { ...this.counters, refillP95Ms: p95, unused };
  }

  // ---- starting --------------------------------------------------------------------------------

  /** Starts a deck unless one is already loading or loaded. */
  ensureStarted(): Promise<void> {
    if (this.status === 'loading' || this.status === 'ready') return Promise.resolve();
    return this.restart();
  }

  /** A new deck: a new random M (Shuffle, or after your interests change). */
  async restart(): Promise<void> {
    const session = ++this.session;
    this.status = 'loading';
    this.inFlight = { ...EMPTY_SIDES };
    this.emit();
    try {
      const data = await this.fetchStart();
      if (session !== this.session) return;
      this.load(data);
    } catch {
      if (session !== this.session) return;
      this.status = 'error';
      this.emit();
    }
  }

  /** Forget the deck (e.g. your interests changed): the next `ensureStarted` deals a new one. */
  reset() {
    this.session += 1;
    this.status = 'idle';
    this.mode = 'empty';
    this.n = 0;
    this.m = null;
    this.sides = { left: [], right: [] };
    this.ring = [];
    this.pos = 0;
    this.inFlight = { ...EMPTY_SIDES };
    this.stalled = { ...EMPTY_SIDES };
    this.emit();
  }

  /** Puts a `deckStart` answer in place. */
  load(data: DeckStartData<T>) {
    this.status = 'ready';
    this.n = data.n;
    this.m = null;
    this.sides = { left: [], right: [] };
    this.ring = [];
    this.pos = 0;
    this.inFlight = { ...EMPTY_SIDES };
    this.stalled = { ...EMPTY_SIDES };
    if (data.mode === 'SMALL' && data.cards.length > 0) {
      this.mode = 'small';
      this.ring = [...data.cards];
    } else if (data.mode === 'LARGE' && data.m) {
      this.mode = 'large';
      this.m = data.m;
      // Dedupe guard (§5.5) applies to the first batch too.
      const seen = new Set([data.m.id]);
      const keep = (list: T[]) => list.filter((c) => !seen.has(c.id) && (seen.add(c.id), true));
      this.sides.right = keep(data.right).slice(0, BUFFER_MAX_PER_SIDE);
      this.sides.left = keep(data.left).slice(0, BUFFER_MAX_PER_SIDE);
    } else {
      this.mode = 'empty';
      this.n = 0;
    }
    this.event({ type: 'start', mode: this.mode, n: this.n });
    this.emit();
    // After deckStart each side holds 5 (2 visible + 3 off-screen), so this asks for nothing,
    // unless the server sent fewer.
    this.maybeRefill('right');
    this.maybeRefill('left');
  }

  // ---- moving (§5.3) ---------------------------------------------------------------------------

  /** The card at +1 becomes M. False when it can't (an end, or that card hasn't loaded). */
  moveRight(): boolean {
    return this.move('right');
  }

  /** The card at −1 becomes M. */
  moveLeft(): boolean {
    return this.move('left');
  }

  /** Moves up to `steps` times (positive: right). Returns how many moves happened (signed). */
  step(steps: number): number {
    const dir: Side = steps > 0 ? 'right' : 'left';
    let done = 0;
    for (let i = 0; i < Math.abs(steps); i++) {
      if (!this.move(dir)) break;
      done += 1;
    }
    return steps > 0 ? done : -done;
  }

  private move(dir: Side): boolean {
    if (this.status !== 'ready') return false;
    if (this.mode === 'small') {
      if (!this.isLoop()) {
        const [lo, hi] = this.bounds();
        const next = this.pos + (dir === 'right' ? 1 : -1);
        if (next < lo || next > hi) return false;
      }
      this.pos += dir === 'right' ? 1 : -1;
      this.counters.moves += 1;
      this.event({ type: 'move', dir });
      this.emit();
      return true;
    }
    if (this.mode !== 'large' || !this.m) return false;
    const ahead = this.sides[dir];
    const behind = this.sides[dir === 'right' ? 'left' : 'right'];
    const next = ahead.shift();
    if (!next) {
      // The next card isn't here yet. The spec's M would be a skeleton; we hold M where it is instead,
      // count it (§7 `buffer_empty`) and make sure that side is being fetched.
      this.counters.bufferEmpty += 1;
      this.event({ type: 'buffer_empty', side: dir });
      this.maybeRefill(dir);
      return false;
    }
    behind.unshift(this.m);
    this.m = next;
    this.evict(dir === 'right' ? 'left' : 'right');
    this.counters.moves += 1;
    this.event({ type: 'move', dir });
    this.emit();
    this.maybeRefill(dir);
    return true;
  }

  // ---- loading (§5.4–5.6) -------------------------------------------------------------------------

  private farthest(side: Side): string | null {
    const list = this.sides[side];
    return list.length ? list[list.length - 1]!.id : (this.m?.id ?? null);
  }

  /** Large mode: asks for BATCH_SIZE more cards when fewer than OFFSCREEN_MIN remain off-screen. */
  maybeRefill(side: Side) {
    if (this.mode !== 'large' || this.status !== 'ready') return;
    const offscreen = this.sides[side].length - VISIBLE_PER_SIDE;
    if (offscreen >= OFFSCREEN_MIN_PER_SIDE || this.inFlight[side] !== null) return;
    const cursor = this.farthest(side);
    if (!cursor || this.stalled[side] === cursor) return;
    this.inFlight[side] = cursor;
    this.sentAt[side] = this.now();
    this.counters.refills += 1;
    this.event({ type: 'refill', side, cursor });
    this.emit();
    const session = this.session;
    this.fetchPage(side === 'right' ? 'RIGHT' : 'LEFT', cursor, BATCH_SIZE).then(
      (cards) => {
        if (session === this.session) this.onRefill(side, cursor, cards);
      },
      () => {
        if (session !== this.session) return;
        // Asked again on the next move toward that side, not in a tight loop.
        this.inFlight[side] = null;
        this.event({ type: 'refill_failed', side });
        this.emit();
      },
    );
  }

  /** §5.5. */
  onRefill(side: Side, requestCursor: string, cards: T[]) {
    this.inFlight[side] = null;
    if (requestCursor !== this.farthest(side)) {
      // The side changed meanwhile (eviction or a change of direction): stale.
      this.event({ type: 'stale', side });
      this.emit();
      this.maybeRefill(side);
      return;
    }
    const inBuffer = new Set([
      this.m?.id,
      ...this.sides.left.map((c) => c.id),
      ...this.sides.right.map((c) => c.id),
    ]);
    let added = 0;
    for (const card of cards) {
      if (inBuffer.has(card.id)) continue; // dedupe guard
      inBuffer.add(card.id);
      this.sides[side].push(card);
      added += 1;
    }
    this.evict(side);
    this.latencies.push(this.now() - this.sentAt[side]);
    // A refill that brought nothing new (everything left is already loaded, or the deck shrank):
    // asking again from the same card would just repeat it, so wait until that side changes.
    this.stalled[side] = added === 0 ? requestCursor : null;
    this.event({ type: 'refilled', side, added, ms: this.now() - this.sentAt[side] });
    this.emit();
    this.maybeRefill(side); // fast swipers may need another batch at once
  }

  /** §5.6: keep at most BUFFER_MAX_PER_SIDE a side, dropping the farthest. */
  private evict(side: Side) {
    const list = this.sides[side];
    while (list.length > BUFFER_MAX_PER_SIDE) list.pop();
  }

  // ---- someone gone (§6: the 410 case) ----------------------------------------------------------

  /** Takes a card out (they blocked you, or you them), closing the gap, and tops that side up. */
  remove(id: string) {
    if (this.status !== 'ready') return;
    if (this.mode === 'large') {
      let side: Side | null = null;
      if (this.m?.id === id) {
        const from: Side | null = this.sides.right.length
          ? 'right'
          : this.sides.left.length
            ? 'left'
            : null;
        this.m = from ? this.sides[from].shift()! : null;
        side = from;
      } else {
        for (const s of ['left', 'right'] as const) {
          const i = this.sides[s].findIndex((c) => c.id === id);
          if (i !== -1) {
            this.sides[s].splice(i, 1);
            side = s;
          }
        }
        if (!side) return;
      }
      this.n = Math.max(0, this.n - 1);
      if (!this.m) this.mode = 'empty';
      this.event({ type: 'removed', id });
      this.emit();
      if (side) this.maybeRefill(side);
      return;
    }
    if (this.mode === 'small') {
      const n = this.ring.length;
      const at = mod(this.pos, n);
      const gone = this.ring.findIndex((c) => c.id === id);
      if (gone === -1) return;
      // The new M: the same one, or the card after it when M itself is the one going.
      const keep = gone === at ? this.ring[mod(at + 1, n)]! : this.ring[at]!;
      const rest = this.ring.filter((c) => c.id !== id);
      const k = rest.findIndex((c) => c.id === keep.id);
      this.ring = rest.length ? [...rest.slice(k), ...rest.slice(0, k)] : [];
      this.pos = 0;
      this.n = this.ring.length;
      if (this.ring.length === 0) this.mode = 'empty';
      this.event({ type: 'removed', id });
      this.emit();
    }
  }

  // ---- plumbing -----------------------------------------------------------------------------------

  private now() {
    return (this.opts.now ?? (() => performance.now()))();
  }

  private event(e: DeckEvent) {
    this.opts.onEvent?.(e);
  }

  private build(): DeckSnapshot<T> {
    return {
      status: this.status,
      mode: this.mode,
      n: this.n,
      m: this.m,
      left: [...this.sides.left],
      right: [...this.sides.right],
      ring: [...this.ring],
      pos: this.pos,
      loop: this.isLoop(),
      inFlight: { ...this.inFlight },
      version: this.version,
    };
  }

  private emit() {
    this.version += 1;
    this.snap = this.build();
    // Metrics: everything loaded, and everything that has been in the visible fan.
    for (const c of [this.m, ...this.sides.left, ...this.sides.right, ...this.ring])
      if (c) this.loaded.add(c.id);
    for (const { card } of this.slots(VISIBLE_PER_SIDE)) if (card) this.shown.add(card.id);
    for (const fn of this.listeners) fn();
  }
}
