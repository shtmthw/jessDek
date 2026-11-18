import { motion } from 'motion/react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion';

/**
 * Lets its content change size without a jump: the wrapper springs to the measured height.
 * A small inset keeps focus rings inside the clipped area.
 */
export function AutoHeight({ children, className }: { children: ReactNode; className?: string }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | 'auto'>('auto');

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHeight(entry.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      className="-m-1 overflow-hidden"
      initial={false}
      animate={{ height }}
      transition={spring.panel}
    >
      <div ref={inner} className={cn('p-1', className)}>
        {children}
      </div>
    </motion.div>
  );
}
