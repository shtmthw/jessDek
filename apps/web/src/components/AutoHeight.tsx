import { motion } from 'motion/react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion';

/**
 * Lets its content change size without a jump: the wrapper springs to the measured height.
 * A small inset keeps focus rings inside the clipped area.
 *
 * It clips only while the height is catching up. At rest nothing is hidden, so content that reaches
 * past its box on purpose (a card leaning towards the pointer, a sticker hanging off its edge, a
 * shadow) isn't cut along a hard line.
 */
export function AutoHeight({ children, className }: { children: ReactNode; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | 'auto'>('auto');

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const next = entry.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight;
      // Clip straight away, before this frame is painted (React renders the new height later).
      const box = outer.current;
      // (offsetHeight: the layout height, unaffected by a dialog scaling in around it.)
      if (box && Math.abs(box.offsetHeight - next) > 1) {
        box.style.overflow = 'hidden';
      }
      setHeight(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      ref={outer}
      className="-m-1"
      initial={false}
      animate={{ height }}
      transition={spring.panel}
      onAnimationComplete={() => {
        if (outer.current) outer.current.style.overflow = '';
      }}
    >
      <div ref={inner} className={cn('p-1', className)}>
        {children}
      </div>
    </motion.div>
  );
}
