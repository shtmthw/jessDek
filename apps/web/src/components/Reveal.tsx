import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { exit, spring } from '@/lib/motion';

/**
 * Grows open from nothing and folds away again (inside `AnimatePresence`), so whatever sits below
 * glides instead of jumping. Put spacing on `className` (padding) rather than margins outside, so it
 * opens and closes with the rest. A small inset keeps focus rings inside the clipped area.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className="-m-1 overflow-hidden p-1"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0, transition: exit.collapse }}
      transition={spring.panel}
    >
      <div className={className}>{children}</div>
    </motion.div>
  );
}
