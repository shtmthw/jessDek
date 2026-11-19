import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearDrafts, getDraft, setDraft } from '@/lib/drafts';
import { DEFAULT_RECIPE, serializeRecipe } from './recipe';
import { useAvatarDraft } from './useAvatarDraft';

const user = { id: 'u1', avatar: null as string | null, avatarColor: '#6366f1' };
const hatOn = { ...DEFAULT_RECIPE, hat: 'beanie' };

beforeEach(() => clearDrafts());

describe('useAvatarDraft', () => {
  it('starts from what is saved and keeps a draft only while it differs', () => {
    const { result } = renderHook(() => useAvatarDraft(user));
    expect(result.current.dirty).toBe(false);

    act(() => result.current.change((l) => ({ ...l, recipe: hatOn })));
    expect(result.current.dirty).toBe(true);
    expect(getDraft('avatar:u1')).toContain('"hat":"beanie"');

    act(() => result.current.undo());
    expect(result.current.dirty).toBe(false);
    expect(result.current.canUndo).toBe(false);
    expect(getDraft('avatar:u1')).toBe('');
  });

  it('follows the server: a save (here or in another tab) makes the look clean', () => {
    const { result, rerender } = renderHook((u: typeof user) => useAvatarDraft(u), {
      initialProps: user,
    });
    act(() => result.current.change((l) => ({ ...l, recipe: hatOn, color: '#ec4899' })));
    expect(result.current.dirty).toBe(true);

    rerender({ ...user, avatar: serializeRecipe(hatOn), avatarColor: '#ec4899' });
    expect(result.current.dirty).toBe(false);

    // A colour-only change from elsewhere shows up as a difference straight away.
    rerender({ ...user, avatar: serializeRecipe(hatOn), avatarColor: '#22c55e' });
    expect(result.current.dirty).toBe(true);
  });

  it('picks up unsaved edits from last time, and says so only until they change', () => {
    setDraft(
      'avatar:u1',
      JSON.stringify({ recipe: JSON.parse(serializeRecipe(hatOn)), color: '#6366f1' }),
    );
    const { result } = renderHook(() => useAvatarDraft(user));
    expect(result.current.look.recipe.hat).toBe('beanie');
    expect(result.current.restored).toBe(true);

    act(() => result.current.change((l) => ({ ...l, recipe: { ...l.recipe, pet: 'frog' } })));
    expect(result.current.dirty).toBe(true);
    expect(result.current.restored).toBe(false);
  });

  it('ignores a stored draft it cannot read', () => {
    setDraft('avatar:u1', '{"recipe":{},"color":"pink"}');
    const { result } = renderHook(() => useAvatarDraft(user));
    expect(result.current.dirty).toBe(false);
    expect(result.current.restored).toBe(false);
  });
});
