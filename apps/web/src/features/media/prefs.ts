import { useSyncExternalStore } from 'react';

/** Device preferences for photos and videos (kept across sign-outs, like the sounds switch). */
export type AutoDownload = 'all' | 'photos' | 'off';

interface Prefs {
  'media:autodownload': AutoDownload;
  'media:relayOnly': boolean;
  'media:intro-seen': boolean;
}
type Key = keyof Prefs;

const DEFAULTS: Prefs = {
  'media:autodownload': 'photos',
  'media:relayOnly': false,
  'media:intro-seen': false,
};

const listeners = new Set<() => void>();
const memory = new Map<Key, unknown>();

export function getPref<K extends Key>(key: K): Prefs[K] {
  if (memory.has(key)) return memory.get(key) as Prefs[K];
  let value: Prefs[K] = DEFAULTS[key];
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === typeof DEFAULTS[key]) value = parsed as Prefs[K];
      if (key === 'media:autodownload' && !['all', 'photos', 'off'].includes(parsed as string))
        value = DEFAULTS[key];
    }
  } catch {
    /* storage blocked or junk: defaults */
  }
  memory.set(key, value);
  return value;
}

export function setPref<K extends Key>(key: K, value: Prefs[K]): void {
  memory.set(key, value);
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: lasts for this session only */
  }
  listeners.forEach((l) => l());
}

// Another tab changed a preference.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key && e.key in DEFAULTS) {
      memory.delete(e.key as Key);
      listeners.forEach((l) => l());
    }
  });
}

export function usePref<K extends Key>(key: K): [Prefs[K], (value: Prefs[K]) => void] {
  const value = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => getPref(key),
    () => DEFAULTS[key],
  );
  return [value, (v) => setPref(key, v)];
}

/** Tests only. */
export function resetPrefsCache(): void {
  memory.clear();
}
