import type { Transition } from 'motion/react';

/**
 * One motion vocabulary for the whole app: soft springs that settle with a little weight.
 * `visualDuration` is how long the motion *looks* like it takes; `bounce` is how much it overshoots.
 */
export const spring = {
  /** Default for things arriving: bubbles, rows, popovers. */
  soft: { type: 'spring', visualDuration: 0.34, bounce: 0.22 },
  /** Small, immediate feedback: thumbs, badges. */
  snappy: { type: 'spring', visualDuration: 0.24, bounce: 0.18 },
  /** A switch knob gliding across: unhurried enough to follow, with a gentle settle. */
  toggle: { type: 'spring', visualDuration: 0.32, bounce: 0.16 },
  /** A playful pop for counts and status dots. */
  pop: { type: 'spring', visualDuration: 0.3, bounce: 0.4 },
  /** Whole panes and sheets: weighty, almost no overshoot. */
  panel: { type: 'spring', visualDuration: 0.42, bounce: 0.06 },
  /** Your own message lifting out of the composer: the signature moment. */
  send: { type: 'spring', visualDuration: 0.4, bounce: 0.3 },
} satisfies Record<string, Transition>;

/** Exits are quicker than entrances and never bounce. */
export const exit = {
  fast: { duration: 0.12, ease: [0.4, 0, 1, 1] },
  base: { duration: 0.18, ease: [0.4, 0, 1, 1] },
  /** Collapsing height eases in and out, so whatever sits below glides up instead of snapping. */
  collapse: { duration: 0.26, ease: [0.4, 0, 0.2, 1] },
} satisfies Record<string, Transition>;

export const easeOut = [0.22, 1, 0.36, 1] as const;

/**
 * A transform as one string (always the same functions, so any two interpolate). Motion hands an
 * animation of `transform` (or `opacity`) to the browser, which runs it on the compositor, so a busy
 * main thread can't stall it; separate `x`/`y`/`scale` values are stepped in JS every frame. Use it
 * for things that open while the page is doing work (dialogs, menus). Not on elements that also use
 * `whileHover`/`whileTap` or drag with separate values: a `transform` string overrides those. End
 * on `tf()`, never `'none'`: motion turns `none` into the other keyframe with its numbers zeroed.
 */
export const tf = ({ x = 0, y = 0, scale = 1 }: { x?: number; y?: number; scale?: number } = {}) =>
  `translate(${x}px, ${y}px) scale(${scale})`;
