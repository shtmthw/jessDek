import type { Transition } from 'motion/react';

/**
 * One motion vocabulary for the whole app: soft springs that settle with a little weight.
 * `visualDuration` is how long the motion *looks* like it takes; `bounce` is how much it overshoots.
 */
export const spring = {
  /** Default for things arriving: bubbles, rows, popovers. */
  soft: { type: 'spring', visualDuration: 0.34, bounce: 0.22 },
  /** Small, immediate feedback: toggles, thumbs, badges. */
  snappy: { type: 'spring', visualDuration: 0.24, bounce: 0.18 },
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
} satisfies Record<string, Transition>;

export const easeOut = [0.22, 1, 0.36, 1] as const;
