import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
  type PanInfo,
} from 'motion/react';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Skeleton } from '@/components/Skeleton';
import { cn } from '@/lib/cn';
import type { Card } from '@/lib/gql';
import { isDialogOpen, isEditable } from '@/lib/keys';
import { CardView } from '../card/CardView';
import { parseCard } from '../card/recipe';
import { CARD_H, CARD_W } from '../card/theme';
import type { DeckSnapshot, DeckStore } from './deckStore';

/*
 * The matching page's fan (CARD_LOADING.md §5.2, the sketch's C4 C3 C1 C2 C0): M in the middle, two
 * cards each side fanned out from the bottom like a hand of cards.
 *
 * The cards sit on an endless strip. `base` is the strip position of the store's M, so the card at k
 * sits at base + k; a move adds to `base` and every card keeps its place on the strip. One motion
 * value, `view` (the strip position drawn in the middle), moves everything: a drag sets it, a move
 * springs it to `base`. Nothing is renumbered under a moving card, so no frame shows one out of place.
 *
 * No card pops through another. Cards stack by how near the middle they are, so the outgoing and
 * incoming cards swap halfway through a move, and just then they part (`PART`) so they don't overlap.
 * At rest they tuck together again, like a deck.
 *
 * Per frame only `transform` and `opacity` change (compositor-only). The stacking order changes in
 * whole steps, when two cards swap, and card faces are never built mid-move.
 */

const RATIO = CARD_H / CARD_W;
/** Drawn up to ±4: ±3 and ±4 are faded out, so cards slide in from and out to the edges. */
const RANGE = 4;
/** The middle card and two each side can be seen and clicked. */
const VISIBLE = 2;
/**
 * How far moves may run ahead of the cards on screen (quick taps). The fan only draws ±RANGE around
 * the store's M, so running further ahead would leave nothing to see.
 */
const MAX_LEAD = 2;

// Keyframes at |position| 0…4 (x and y in card widths, rotate in degrees). Tucked like a hand of
// cards: ±1 under the middle card, ±2 under ±1.
const X = [0, 0.68, 1.1, 1.45, 1.75];
const Y = [0, 0.02, 0.07, 0.14, 0.2];
const ROTATE = [0, 7, 13, 17, 19];
const SCALE = [1, 0.82, 0.68, 0.58, 0.52];
const OPACITY = [1, 1, 1, 0, 0];
/**
 * How far (in card widths) the two cards crossing the middle part, at most, halfway through. Their
 * gap then is X[1] + 2·PART − (half-widths at scales 1 and 0.82) ≈ 0.68 + 0.32 − 0.91 > 0, so the
 * swap of which is on top happens with clear space between them.
 */
const PART = 0.16;

/** Settling after a move: smooth, with only a whisper of overshoot. */
const SETTLE = { type: 'spring', visualDuration: 0.46, bounce: 0.12 } as const;
/** The light deck: shorter and without overshoot, so fewer frames to draw and less trailing. */
const SETTLE_LIGHT = { type: 'spring', visualDuration: 0.34, bounce: 0 } as const;
/** Pushing against an end. */
const BOUNCE = { type: 'spring', visualDuration: 0.34, bounce: 0.32 } as const;
/** Opening: the stack deals out into the fan. */
const DEAL = { type: 'spring', visualDuration: 0.6, bounce: 0.16, delay: 0.04 } as const;
const DEAL_LIGHT = { type: 'spring', visualDuration: 0.45, bounce: 0, delay: 0.04 } as const;

/** `frames` at |position| a (0…RANGE), straight lines between the keyframes. */
function at(frames: readonly number[], a: number) {
  const i = Math.min(RANGE - 1, Math.floor(a));
  return frames[i]! + (frames[i + 1]! - frames[i]!) * (a - i);
}

/** The transform of a card `t` positions from the middle, with the fan `s` spread out (0: stacked). */
function pose(t: number, w: number, s: number) {
  const a = Math.min(RANGE, Math.abs(t));
  const side = t < 0 ? -1 : 1;
  const x = side * (at(X, a) + (a < 1 ? PART * Math.sin(Math.PI * a) : 0)) * w * s;
  const y = at(Y, a) * w * s;
  const rotate = side * at(ROTATE, a) * s;
  const scale = 1 - (1 - at(SCALE, a)) * s;
  return `translate(${x}px, ${y}px) rotate(${rotate}deg) scale(${scale})`;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Past an end, a drag moves a quarter as far. */
function rubber(v: number, lo: number, hi: number) {
  if (v > hi) return hi + (v - hi) * 0.25;
  if (v < lo) return lo + (v - lo) * 0.25;
  return v;
}

/** The motion values every card in the fan shares. */
interface FanMotion {
  /** The strip position drawn in the middle. */
  view: MotionValue<number>;
  /** Card width in px. */
  width: MotionValue<number>;
  /** 0: stacked (dealing), 1: fanned out. */
  spread: MotionValue<number>;
}

/** A card's place: centred in the strip, turning about its bottom edge. */
const slot = (w: number) =>
  ({ width: w, left: `calc(50% - ${w / 2}px)`, top: 0, transformOrigin: '50% 100%' }) as const;

/** The style of the card at strip position `pos`. Motion re-runs these with each render's `pos`. */
function useSlot(pos: number, { view, width, spread }: FanMotion) {
  const t = useTransform(view, (v) => pos - v);
  return {
    transform: useTransform([t, width, spread], ([v, w, s]: number[]) => pose(v!, w!, s!)),
    opacity: useTransform(t, (v) => at(OPACITY, Math.min(RANGE, Math.abs(v)))),
    // Nearer the middle is on top, in whole steps: the order only changes when two cards swap,
    // halfway through a move, just as they part.
    zIndex: useTransform(t, (v) => RANGE + 1 - Math.round(Math.min(RANGE, Math.abs(v)))),
  };
}

/**
 * Whether a card's face is drawn. Cards arriving at the faded-out edges (±3, ±4) draw theirs in the
 * browser's idle time between frames, so a move never stops to build one, even when you keep moving:
 * it's ready before it slides into view. (Without requestIdleCallback: once the fan is still.)
 */
function useDrawn(near: boolean, { view, spread }: FanMotion) {
  const [drawn, setDrawn] = useState(near);
  if (near && !drawn) setDrawn(true);
  useEffect(() => {
    if (drawn) return;
    if (typeof requestIdleCallback === 'function') {
      const idle = requestIdleCallback(() => setDrawn(true), { timeout: 700 });
      return () => cancelIdleCallback(idle);
    }
    let id = 0;
    const check = () => {
      const moving = view.isAnimating() || spread.isAnimating() || view.getVelocity() !== 0;
      if (moving) id = window.setTimeout(check, 100);
      else setDrawn(true);
    };
    id = window.setTimeout(check, 100);
    return () => window.clearTimeout(id);
  }, [drawn, view, spread]);
  return drawn;
}

const CardSkeleton = () => (
  <Skeleton className="w-full rounded-[24px]" style={{ aspectRatio: `${CARD_W} / ${CARD_H}` }} />
);

/** The card itself. Memoised: a move changes every card's place, never what's on it. */
const Face = memo(function Face({ card, w, lite }: { card: Card; w: number; lite: boolean }) {
  return <CardView card={parseCard(card.recipe)} user={card.user} width={w} lite={lite} />;
});

function FanCard({
  card,
  k,
  pos,
  fan,
  w,
  lite,
  onPick,
}: {
  /** Null: that card hasn't loaded yet (a skeleton). */
  card: Card | null;
  /** Position relative to the store's M (0 = M). */
  k: number;
  /** Position on the strip (fixed while the card is in the fan). */
  pos: number;
  fan: FanMotion;
  w: number;
  /** Draw the light card (Discover's "Light" deck). */
  lite: boolean;
  onPick: (k: number, card: Card) => void;
}) {
  const style = { ...slot(w), ...useSlot(pos, fan) };
  const drawn = useDrawn(Math.abs(k) <= VISIBLE, fan);
  if (!card) {
    return (
      <motion.div aria-hidden data-deck-pos={k} data-skeleton className="absolute" style={style}>
        <CardSkeleton />
      </motion.div>
    );
  }
  const name = card.user.displayName;
  return (
    <motion.button
      type="button"
      data-deck-pos={k}
      data-card-id={card.id}
      tabIndex={k === 0 ? 0 : -1}
      aria-hidden={Math.abs(k) > VISIBLE || undefined}
      aria-label={k === 0 ? `Open ${name}’s card` : `Show ${name}’s card`}
      onClick={() => onPick(k, card)}
      className="group absolute rounded-[24px] outline-offset-4 focus-visible:outline-2 focus-visible:outline-brand-text"
      // Its own layer: moving the card only moves a picture of it.
      style={{ ...style, willChange: 'transform, opacity' }}
    >
      <div
        className={cn(
          'transition-transform duration-200 ease-out',
          k === 0 && 'group-hover:-translate-y-1.5',
        )}
      >
        {drawn ? <Face card={card} w={w} lite={lite} /> : <div style={{ height: w * RATIO }} />}
      </div>
    </motion.button>
  );
}

/** Measures the fan's area and picks the card width (and the strip's top) that fit it. */
function useFanBox() {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry!.contentRect;
      setBox((b) => (b.w === r.width && b.h === r.height ? b : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const compact = box.w < 640;
  const w = Math.max(
    120,
    Math.floor(
      Math.min(compact ? 250 : 290, box.w * (compact ? 0.62 : 0.29), (box.h - 16) / (RATIO + 0.1)),
    ),
  );
  const top = Math.max(0, (box.h - w * RATIO) / 2 - w * 0.04);
  return { ref, ready: box.w > 0, compact, w, top };
}

const NAV =
  'flex size-11 items-center justify-center rounded-full border border-border bg-background shadow-sm transition-colors hover:bg-muted disabled:opacity-40 disabled:hover:bg-background';

export function Fan({
  store,
  snap,
  onOpen,
  lite = false,
}: {
  store: DeckStore<Card>;
  snap: DeckSnapshot<Card>;
  onOpen: (card: Card) => void;
  /** The light deck (DECK_QUALITY_PLAN.md): simpler cards and snappier springs. */
  lite?: boolean;
}) {
  const reduced = useReducedMotion() ?? false;
  const { ref, ready, compact, w, top } = useFanBox();
  const width = useMotionValue(w);
  useEffect(() => width.set(w), [w, width]);
  const base = useRef(0);
  const view = useMotionValue(0);
  const spread = useMotionValue(reduced ? 1 : 0);
  const fan = useMemo<FanMotion>(() => ({ view, width, spread }), [view, width, spread]);
  const panned = useRef(false);
  const panFrom = useRef(0);

  // Deal the stack out into the fan. (Switching quality mid-deal just carries on with the new spring.)
  useEffect(() => {
    if (reduced) spread.set(1);
    else animate(spread, 1, lite ? DEAL_LIGHT : DEAL);
  }, [reduced, spread, lite]);

  /**
   * Springs `view` to the store's M. A flick hands over its speed (strip positions per second);
   * otherwise the spring keeps the speed it has, so quick taps flow into each other.
   */
  const settle = (velocity?: number) => {
    if (reduced) view.set(base.current);
    else {
      const spring = lite ? SETTLE_LIGHT : SETTLE;
      animate(view, base.current, velocity === undefined ? spring : { ...spring, velocity });
    }
  };

  /** Moves the deck `steps` cards (positive: right). At an end, bounces. */
  const go = (steps: number, velocity?: number) => {
    const dir = Math.sign(steps);
    const reach = store.reach();
    const room = Math.floor(MAX_LEAD - dir * (base.current - view.get()) + 0.01);
    const n =
      dir * Math.max(0, Math.min(Math.abs(steps), dir > 0 ? reach.right : reach.left, room));
    if (n !== 0) {
      // Same synchronous step as the store's move, so every render sees base and k change together.
      base.current += n;
      store.step(n);
      settle(velocity);
    } else if (dir !== 0 && room > 0) {
      // An end. A large deck's next card may simply not be here yet: this counts `buffer_empty` and
      // makes sure it's on its way.
      store.step(steps);
      if (reduced) settle();
      else animate(view, base.current, { ...BOUNCE, velocity: dir * 5 });
    } else if (!view.isAnimating()) {
      settle(velocity);
    }
  };
  const goRef = useRef(go);
  goRef.current = go;

  // ← → anywhere on the page (not while typing or with a dialog open). Holding a key moves once.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      if (e.defaultPrevented || isDialogOpen() || isEditable(e.target)) return;
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      if (!e.repeat) goRef.current(e.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const stepPx = () => Math.max(40, width.get() * X[1]!);

  function onPanStart() {
    panned.current = true;
    view.stop();
    panFrom.current = view.get();
  }
  function onPan(_: PointerEvent, info: PanInfo) {
    const reach = store.reach();
    // Dragging left brings the cards on the right to the middle: `view` goes up.
    const raw = panFrom.current - info.offset.x / stepPx();
    const b = base.current;
    view.set(rubber(raw, b - Math.min(reach.left, 2.4), b + Math.min(reach.right, 2.4)));
  }
  function onPanEnd(_: PointerEvent, info: PanInfo) {
    const v = -info.velocity.x / stepPx();
    const projected = view.get() + clamp(v * 0.18, -1.5, 1.5);
    go(clamp(Math.round(projected - base.current), -3, 3), v);
  }

  const pick = (k: number, card: Card) => {
    // The end of a drag, not a tap; or a faded-out card at the edge. (Not `pointer-events`: it's
    // inherited, so switching it mid-move restyles the whole card.)
    if (panned.current || Math.abs(k) > VISIBLE) return;
    if (k === 0) onOpen(card);
    else go(k);
  };

  const center = store.current();
  const reach = store.reach();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={ref}
        role="region"
        aria-roledescription="carousel"
        aria-label="Your deck"
        data-quality={lite ? 'light' : 'full'}
        className="relative isolate min-h-0 flex-1 select-none overflow-hidden"
      >
        <motion.div
          className="absolute inset-x-0"
          style={{ top, height: w * RATIO, touchAction: 'pan-y' }}
          onPointerDownCapture={() => (panned.current = false)}
          onPanStart={onPanStart}
          onPan={onPan}
          onPanEnd={onPanEnd}
        >
          {ready
            ? store
                .slots(RANGE)
                .map(({ k, card }) =>
                  card || Math.abs(k) <= VISIBLE ? (
                    <FanCard
                      key={card?.id ?? `skeleton:${base.current + k}`}
                      card={card}
                      k={k}
                      pos={base.current + k}
                      fan={fan}
                      lite={lite}
                      w={w}
                      onPick={pick}
                    />
                  ) : null,
                )
            : null}
        </motion.div>
        <p className="sr-only" aria-live="polite">
          {center ? `${center.user.displayName}, @${center.user.username}` : ''}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-2 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        <div className="flex items-center gap-4">
          <button
            type="button"
            aria-label="Previous card"
            disabled={reach.left === 0 && snap.mode !== 'large'}
            onClick={() => go(-1)}
            className={NAV}
          >
            <ChevronLeft className="size-5" />
          </button>
          <p className="min-w-44 text-center text-sm font-medium">
            {compact ? 'Swipe to move' : 'Swipe, drag or use ← →'}
          </p>
          <button
            type="button"
            aria-label="Next card"
            disabled={reach.right === 0 && snap.mode !== 'large'}
            onClick={() => go(1)}
            className={NAV}
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
        <p className="text-[13px] text-muted-foreground">Tap the middle card to say hi</p>
      </div>
    </div>
  );
}

/** While the deck is dealt: the fan's outline. */
export function FanPlaceholder() {
  const { ref, ready, w, top } = useFanBox();
  return (
    <div
      ref={ref}
      aria-busy
      aria-label="Dealing your deck"
      className="relative isolate min-h-0 flex-1 overflow-hidden"
    >
      {ready ? (
        <div className="absolute inset-x-0" style={{ top }}>
          {/* Middle last, so it's on top. */}
          {[-2, 2, -1, 1, 0].map((k) => (
            <div key={k} className="absolute" style={{ ...slot(w), transform: pose(k, w, 1) }}>
              <CardSkeleton />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
