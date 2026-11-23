import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDeckQuality, setDeckQuality, useDeckQuality } from './deckQuality';

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

describe('deck quality', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });
  afterEach(() => {
    vi.restoreAllMocks();
    setDeckQuality('full'); // clears any session-only choice a test left behind
    vi.unstubAllGlobals();
  });

  it('is full by default', () => {
    expect(getDeckQuality()).toBe('full');
  });

  it('remembers light, and back to full', () => {
    setDeckQuality('light');
    expect(getDeckQuality()).toBe('light');
    expect(localStorage.getItem('deck-quality')).toBe('light');
    setDeckQuality('full');
    expect(getDeckQuality()).toBe('full');
    expect(localStorage.getItem('deck-quality')).toBe('full');
  });

  it('treats anything unknown as full', () => {
    localStorage.setItem('deck-quality', 'ultra');
    expect(getDeckQuality()).toBe('full');
    localStorage.setItem('deck-quality', '');
    expect(getDeckQuality()).toBe('full');
  });

  it('still works for this session when storage refuses to save (private mode, full quota)', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    setDeckQuality('light');
    expect(getDeckQuality()).toBe('light');
    setDeckQuality('full');
    expect(getDeckQuality()).toBe('full');
  });

  it('falls back to full when storage can’t be read at all', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(getDeckQuality()).toBe('full');
  });

  it('updates every component using it', () => {
    const a = renderHook(() => useDeckQuality());
    const b = renderHook(() => useDeckQuality());
    expect(a.result.current[0]).toBe('full');
    act(() => a.result.current[1]('light'));
    expect(a.result.current[0]).toBe('light');
    expect(b.result.current[0]).toBe('light');
  });

  it('follows a change made in another tab', () => {
    const { result } = renderHook(() => useDeckQuality());
    act(() => {
      localStorage.setItem('deck-quality', 'light');
      window.dispatchEvent(new StorageEvent('storage', { key: 'deck-quality', newValue: 'light' }));
    });
    expect(result.current[0]).toBe('light');
  });

  it('follows another tab clearing storage', () => {
    localStorage.setItem('deck-quality', 'light');
    const { result } = renderHook(() => useDeckQuality());
    expect(result.current[0]).toBe('light');
    act(() => {
      localStorage.clear();
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
    });
    expect(result.current[0]).toBe('full');
  });

  it('stops listening once unmounted', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useDeckQuality());
    const added = add.mock.calls.filter(([type]) => String(type) === 'storage').length;
    unmount();
    expect(remove.mock.calls.filter(([type]) => String(type) === 'storage').length).toBe(added);
  });
});
