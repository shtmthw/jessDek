import { animate, useMotionValue, type MotionValue } from 'motion/react';
import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';
import { spring } from '@/lib/motion';

/** Hold this long without moving to open the message's actions. */
export const LONG_PRESS_MS = 380;
/** Movement before a touch counts as a drag (and stops being a press). */
const SLOP_PX = 10;
/** How far a bubble must travel before letting go starts a reply. */
export const SWIPE_THRESHOLD_PX = 56;
const SWIPE_MAX_PX = 92;
/** Touches this close to the left edge belong to the pane's swipe-back. */
const EDGE_PX = 32;

const buzz = (ms: number) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not allowed here: no buzz */
  }
};

type Mode = 'pending' | 'swipe' | 'scroll' | 'long';

interface Gesture {
  id: number;
  x0: number;
  y0: number;
  mode: Mode;
  /** Past the reply threshold right now. */
  armed: boolean;
  timer: number;
}

/**
 * Touch gestures on a message bubble:
 *  - **long-press** opens its actions (the bubble sinks a touch while you hold)
 *  - **swipe right** drags it sideways; let go past the threshold to reply (with a tick on the way)
 *
 * Vertical movement is left to the browser (scrolling the chat), and the mouse is left alone:
 * desktop uses the hover toolbar and right-click.
 */
export function useBubbleGestures({
  enabled,
  onLongPress,
  onSwipe,
}: {
  enabled: boolean;
  onLongPress: (bubble: HTMLElement) => void;
  onSwipe: () => void;
}): {
  /** Horizontal offset of the bubble while swiping. */
  x: MotionValue<number>;
  /** The bubble's scale while pressing. */
  press: MotionValue<number>;
  handlers: {
    onPointerDown: (e: PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: PointerEvent<HTMLElement>) => void;
    onPointerUp: (e: PointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: PointerEvent<HTMLElement>) => void;
    onClickCapture: (e: MouseEvent<HTMLElement>) => void;
  };
  /** The last pointer to touch the bubble was a finger or a pen (not a mouse). */
  wasTouch: () => boolean;
} {
  const x = useMotionValue(0);
  const press = useMotionValue(1);
  const g = useRef<Gesture | null>(null);
  const swallowClick = useRef(false);
  const touch = useRef(false);
  const latest = useRef({ onLongPress, onSwipe });
  latest.current = { onLongPress, onSwipe };

  useEffect(() => () => window.clearTimeout(g.current?.timer), []);

  const settle = () => {
    animate(x, 0, spring.snappy);
    animate(press, 1, spring.pop);
  };

  function onPointerDown(e: PointerEvent<HTMLElement>) {
    touch.current = e.pointerType !== 'mouse';
    swallowClick.current = false;
    if (!enabled || e.pointerType === 'mouse' || e.button !== 0) return;
    if (e.clientX <= EDGE_PX) return;
    const el = e.currentTarget;
    const timer = window.setTimeout(() => {
      const s = g.current;
      if (!s || s.mode !== 'pending') return;
      s.mode = 'long';
      swallowClick.current = true; // letting go mustn't also count as a tap
      buzz(10);
      animate(press, 1, spring.pop);
      latest.current.onLongPress(el.querySelector<HTMLElement>('[data-bubble]') ?? el);
    }, LONG_PRESS_MS);
    g.current = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      mode: 'pending',
      armed: false,
      timer,
    };
    // Sink a little while the finger rests, so the hold feels like it's doing something.
    animate(press, 0.97, { duration: LONG_PRESS_MS / 1000, ease: [0.2, 0, 0.2, 1] });
  }

  function onPointerMove(e: PointerEvent<HTMLElement>) {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x0;
    const dy = e.clientY - s.y0;
    if (s.mode === 'pending') {
      if (Math.hypot(dx, dy) < SLOP_PX) return;
      window.clearTimeout(s.timer);
      animate(press, 1, spring.snappy);
      if (dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        s.mode = 'swipe';
        e.currentTarget.setPointerCapture(e.pointerId);
      } else {
        s.mode = 'scroll';
        return;
      }
    }
    if (s.mode !== 'swipe') return;
    const d = Math.max(0, dx - SLOP_PX);
    // Follows the finger up to the threshold, then gives way slowly, like pulling on elastic.
    const v = d <= SWIPE_THRESHOLD_PX ? d : SWIPE_THRESHOLD_PX + (d - SWIPE_THRESHOLD_PX) * 0.3;
    x.set(Math.min(v, SWIPE_MAX_PX));
    const armed = d >= SWIPE_THRESHOLD_PX;
    if (armed && !s.armed) buzz(8);
    s.armed = armed;
  }

  function end(e: PointerEvent<HTMLElement>, cancelled: boolean) {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    window.clearTimeout(s.timer);
    g.current = null;
    if (s.mode === 'swipe') {
      swallowClick.current = true;
      if (s.armed && !cancelled) latest.current.onSwipe();
    }
    if (s.mode !== 'long') settle();
  }

  return {
    x,
    press,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e) => end(e, false),
      onPointerCancel: (e) => end(e, true),
      onClickCapture: (e) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        e.stopPropagation();
        e.preventDefault();
      },
    },
    wasTouch: () => touch.current,
  };
}
