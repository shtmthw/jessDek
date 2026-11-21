import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  expectOwnConversation,
  isOwnConversationExpected,
  playSound,
  setSoundsEnabled,
  soundsEnabled,
} from './sounds';

/** In-memory storage: newer Node versions ship a global localStorage that shadows jsdom's. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

describe('notification sounds', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('are on by default and remember being turned off', () => {
    expect(soundsEnabled()).toBe(true);
    setSoundsEnabled(false);
    expect(soundsEnabled()).toBe(false);
    expect(localStorage.getItem('sounds')).toBe('off');
    setSoundsEnabled(true);
    expect(soundsEnabled()).toBe(true);
  });

  it('do nothing (and never throw) where Web Audio is unavailable', () => {
    expect(() => playSound('dm')).not.toThrow();
    expect(() => playSound('addedToGroup', { force: true })).not.toThrow();
  });

  it('stay quiet for a few seconds after you create a chat yourself', () => {
    vi.useFakeTimers();
    expect(isOwnConversationExpected()).toBe(false);
    expectOwnConversation();
    expect(isOwnConversationExpected()).toBe(true);
    vi.advanceTimersByTime(7000);
    expect(isOwnConversationExpected()).toBe(false);
  });
});
