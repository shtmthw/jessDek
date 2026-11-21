import { useEffect, type RefObject } from 'react';

/**
 * Marks a sideways-scrolling strip with `data-more-start` / `data-more-end` while there is more
 * to scroll that way, so CSS (`.edge-fade`) can fade that edge instead of slicing a label in half.
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.toggleAttribute('data-more-start', el.scrollLeft > 2);
      el.toggleAttribute('data-more-end', max - el.scrollLeft > 2);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    // Older browsers (and test DOMs) without ResizeObserver still get the scroll updates.
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro?.disconnect();
    };
  }, [ref]);
}
