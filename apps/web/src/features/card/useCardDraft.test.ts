import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDrafts, getDraft } from '@/lib/drafts';
import { DEFAULT_CARD, serializeCard } from './recipe';
import { useCardDraft } from './useCardDraft';

describe('useCardDraft', () => {
  beforeEach(() => {
    clearDrafts();
    vi.useRealTimers();
  });

  it('starts from what is saved and tracks changes against it', () => {
    const saved = serializeCard({ ...DEFAULT_CARD, bg: 'mint' });
    const { result } = renderHook(() => useCardDraft('u1', saved));
    expect(result.current.card.bg).toBe('mint');
    expect(result.current.dirty).toBe(false);
    act(() => result.current.change((c) => ({ ...c, bg: 'sky' })));
    expect(result.current.dirty).toBe(true);
    act(() => result.current.undo());
    expect(result.current.card.bg).toBe('mint');
    expect(result.current.dirty).toBe(false);
  });

  it('folds quick edits with the same merge key into one undo step', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCardDraft('u1', null));
    act(() => result.current.change((c) => ({ ...c, bg: 'sky' })));
    for (const about of ['H', 'Hi', 'Hi!']) {
      act(() => result.current.change((c) => ({ ...c, about }), 'about'));
      vi.advanceTimersByTime(200);
    }
    expect(result.current.card.about).toBe('Hi!');
    act(() => result.current.undo());
    expect(result.current.card.about).toBe('');
    expect(result.current.card.bg).toBe('sky');
  });

  it('keeps a space typed at the end of the about text', () => {
    const { result } = renderHook(() => useCardDraft('u1', null));
    act(() => result.current.change((c) => ({ ...c, about: 'Hello' }), 'about'));
    act(() => result.current.change((c) => ({ ...c, about: 'Hello ' }), 'about'));
    expect(result.current.card.about).toBe('Hello ');
    act(() => result.current.change((c) => ({ ...c, about: 'Hello there' }), 'about'));
    expect(result.current.card.about).toBe('Hello there');
  });

  it('keeps unsaved edits as a draft and picks them up next time', () => {
    const first = renderHook(() => useCardDraft('u1', null));
    act(() => first.result.current.change((c) => ({ ...c, about: 'Hello' })));
    expect(getDraft('card:u1')).toContain('Hello');
    first.unmount();

    const second = renderHook(() => useCardDraft('u1', null));
    expect(second.result.current.card.about).toBe('Hello');
    expect(second.result.current.restored).toBe(true);
    act(() => second.result.current.discard());
    expect(getDraft('card:u1')).toBe('');
  });
});
