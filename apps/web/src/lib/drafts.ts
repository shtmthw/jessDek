import { useSyncExternalStore } from 'react';

/** Unsent text per conversation. Kept in localStorage so a reload or a chat switch never loses it. */
const PREFIX = 'draft:';
const cache = new Map<string, string>();
const listeners = new Set<() => void>();

function read(id: string): string {
  const hit = cache.get(id);
  if (hit !== undefined) return hit;
  let value = '';
  try {
    value = localStorage.getItem(PREFIX + id) ?? '';
  } catch {
    /* storage blocked: drafts just live in memory */
  }
  cache.set(id, value);
  return value;
}

export const getDraft = read;

export function setDraft(id: string, text: string) {
  if (read(id) === text) return;
  cache.set(id, text);
  try {
    if (text.trim()) localStorage.setItem(PREFIX + id, text);
    else localStorage.removeItem(PREFIX + id);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

/** Forget every draft (on sign-out, so the next person on this device never sees them). */
export function clearDrafts() {
  cache.clear();
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export const useDraft = (id: string): string =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => read(id),
    () => '',
  );
