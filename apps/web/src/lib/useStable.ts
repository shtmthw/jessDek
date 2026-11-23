import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * A function that never changes but always calls the latest `fn`. Pass it to memoised children so a
 * parent's re-render (with a fresh inline callback) doesn't re-render them.
 */
export function useStable<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
