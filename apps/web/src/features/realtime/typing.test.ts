import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTyping, markTyping, resetTyping, useTypers, useTypingNames } from './typing';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  resetTyping();
  vi.useRealTimers();
});

describe('typing store', () => {
  it('tracks who is typing with their avatar colour, per conversation', () => {
    const { result } = renderHook(() => ({ typers: useTypers('c1'), names: useTypingNames('c1') }));
    expect(result.current.typers).toEqual([]);

    act(() => markTyping('c1', 'u1', 'Alice Moreno', '#6366f1'));
    act(() => markTyping('c1', 'u2', 'Bob Carter', '#22c55e'));
    act(() => markTyping('c2', 'u3', 'Someone Else', '#000000'));
    expect(result.current.typers).toEqual([
      { id: 'u1', name: 'Alice Moreno', color: '#6366f1' },
      { id: 'u2', name: 'Bob Carter', color: '#22c55e' },
    ]);
    expect(result.current.names).toEqual(['Alice Moreno', 'Bob Carter']);
  });

  it('forgets people when they send or stop for a few seconds', () => {
    const { result } = renderHook(() => useTypers('c1'));
    act(() => markTyping('c1', 'u1', 'Alice', '#111111'));
    act(() => markTyping('c1', 'u2', 'Bob', '#222222'));

    act(() => clearTyping('c1', 'u1')); // they sent their message
    expect(result.current.map((t) => t.id)).toEqual(['u2']);

    act(() => void vi.advanceTimersByTime(3600)); // and Bob stopped
    expect(result.current).toEqual([]);
  });

  it('keeps a person shown while they keep typing, without re-rendering for it', () => {
    const { result } = renderHook(() => useTypers('c1'));
    act(() => markTyping('c1', 'u1', 'Alice', '#111111'));
    const first = result.current;

    act(() => void vi.advanceTimersByTime(3000));
    act(() => markTyping('c1', 'u1', 'Alice', '#111111')); // next keystroke
    expect(result.current).toBe(first); // same reference: nothing changed on screen

    act(() => void vi.advanceTimersByTime(3000)); // 6s after the first ping, 3s after the last
    expect(result.current.map((t) => t.id)).toEqual(['u1']);
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current).toEqual([]);
  });

  it('picks up a changed avatar colour', () => {
    const { result } = renderHook(() => useTypers('c1'));
    act(() => markTyping('c1', 'u1', 'Alice', '#111111'));
    act(() => markTyping('c1', 'u1', 'Alice', '#999999'));
    expect(result.current[0]!.color).toBe('#999999');
  });
});
