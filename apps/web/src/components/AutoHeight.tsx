import { animate, motion, useMotionValue } from 'motion/react';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion';

/** Size changes this close together are the content animating its own height. */
const CONTINUOUS_MS = 50;

/**
 * Lets its content change size without a jump. A sudden change (new rows, a section swapped in)
 * springs to the new height. Content that animates its own height (a `Reveal` opening) is followed
 * exactly, in the same frame: springing after it would lag and clip whatever sits at the bottom.
 * A small inset keeps focus rings inside the clipped area.
 *
 * It clips only while the height is catching up. At rest nothing is hidden, so content that reaches
 * past its box on purpose (a card leaning towards the pointer, a sticker hanging off its edge, a
 * shadow) isn't cut along a hard line.
 */
export function AutoHeight({ children, className }: { children: ReactNode; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const height = useMotionValue<number | 'auto'>('auto');

  useLayoutEffect(() => {
    const el = inner.current;
    const box = outer.current;
    if (!el || !box || typeof ResizeObserver === 'undefined') return;
    let last = -Infinity;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const next = entry.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight;
      const now = performance.now();
      const continuous = now - last < CONTINUOUS_MS;
      last = now;
      if (height.get() === 'auto' || continuous) {
        // Written straight to the element too: this runs before the frame is painted, and motion
        // would only draw it next frame.
        height.jump(next);
        box.style.height = `${next}px`;
        box.style.overflow = '';
        return;
      }
      // Clip straight away, before this frame is painted. (offsetHeight: the layout height,
      // unaffected by a dialog scaling in around it.)
      if (Math.abs(box.offsetHeight - next) > 1) box.style.overflow = 'hidden';
      animate(height, next, {
        ...spring.panel,
        onComplete: () => {
          box.style.overflow = '';
        },
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [height]);

  return (
    <motion.div ref={outer} className="-m-1" style={{ height }}>
      <div ref={inner} className={cn('p-1', className)}>
        {children}
      </div>
    </motion.div>
  );
}
