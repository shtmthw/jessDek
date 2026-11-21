import { useSyncExternalStore } from 'react';

function subscribeQuery(query: string) {
  return (cb: () => void) => {
    if (typeof matchMedia !== 'function') return () => undefined;
    const mql = matchMedia(query);
    mql.addEventListener('change', cb);
    return () => mql.removeEventListener('change', cb);
  };
}

const matches = (query: string) => typeof matchMedia === 'function' && matchMedia(query).matches;

export function useMediaQuery(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    subscribeQuery(query),
    () => (typeof matchMedia === 'function' ? matches(query) : fallback),
    () => fallback,
  );
}

export const DESKTOP_QUERY = '(min-width: 768px)';
/** Two panes side by side (≥768px) versus one pane at a time. */
export const useIsDesktop = () => useMediaQuery(DESKTOP_QUERY, true);

export const isTouchDevice = () => matches('(pointer: coarse)');
export const prefersReducedMotion = () => matches('(prefers-reduced-motion: reduce)');

function subscribeWidth(cb: () => void) {
  window.addEventListener('resize', cb);
  return () => window.removeEventListener('resize', cb);
}
export const useWindowWidth = () =>
  useSyncExternalStore(
    subscribeWidth,
    () => window.innerWidth,
    () => 1024,
  );
