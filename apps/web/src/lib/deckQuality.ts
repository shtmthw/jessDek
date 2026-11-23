import { useSyncExternalStore } from 'react';

/**
 * How the Discover deck is drawn on this device (DECK_QUALITY_PLAN.md). `full`: every card in full.
 * `light`: simpler cards and snappier motion, easier on older phones and laptops. Per device, like
 * the theme: it's about this device's hardware, not the account.
 */
export type DeckQuality = 'full' | 'light';

const KEY = 'deck-quality';
const listeners = new Set<() => void>();
/** Set when storage couldn't save the choice (private mode, full quota): it lasts this session. */
let unsaved: DeckQuality | null = null;

const parse = (v: string | null): DeckQuality => (v === 'light' ? 'light' : 'full');

export function getDeckQuality(): DeckQuality {
  if (unsaved) return unsaved;
  try {
    return parse(localStorage.getItem(KEY));
  } catch {
    return 'full';
  }
}

export function setDeckQuality(quality: DeckQuality) {
  try {
    localStorage.setItem(KEY, quality);
    unsaved = null;
  } catch {
    unsaved = quality;
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // Another tab changed it.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) cb();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

export function useDeckQuality(): [DeckQuality, (q: DeckQuality) => void] {
  const quality = useSyncExternalStore(subscribe, getDeckQuality, () => 'full' as const);
  return [quality, setDeckQuality];
}
