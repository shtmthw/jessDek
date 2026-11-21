import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { getDraft, setDraft } from '@/lib/drafts';
import { normalizeRecipe, parseRecipe, sameRecipe, serializeRecipe, type Recipe } from './recipe';

export interface Look {
  recipe: Recipe;
  color: string;
}

const HISTORY_MAX = 60;

const sameLook = (a: Look, b: Look) => a.color === b.color && sameRecipe(a.recipe, b.recipe);

/** Avatar edits in progress live with the message drafts, so sign-out clears them too. */
const draftKey = (userId: string) => `avatar:${userId}`;

function readDraft(userId: string): Look | null {
  const raw = getDraft(draftKey(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { recipe?: unknown; color?: unknown };
    if (typeof parsed.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(parsed.color)) return null;
    return { recipe: normalizeRecipe(parsed.recipe), color: parsed.color };
  } catch {
    return null;
  }
}

interface State {
  look: Look;
  /** Earlier looks, oldest first. */
  history: Look[];
}

type Action = { type: 'change'; next: Look | ((prev: Look) => Look) } | { type: 'undo' };

function reducer(state: State, action: Action): State {
  if (action.type === 'undo') {
    const prev = state.history[state.history.length - 1];
    return prev ? { look: prev, history: state.history.slice(0, -1) } : state;
  }
  const next = typeof action.next === 'function' ? action.next(state.look) : action.next;
  if (sameLook(state.look, next)) return state;
  return { look: next, history: [...state.history.slice(-(HISTORY_MAX - 1)), state.look] };
}

/**
 * The studio's working copy of an avatar: what's on screen, an undo history, and how it differs
 * from what's saved. Unsaved edits survive leaving the page (or a reload) until saved or discarded.
 */
export function useAvatarDraft(user: { id: string; avatar: string | null; avatarColor: string }) {
  // What the server has. A save (here or in another tab) updates the viewer, and with it this.
  const saved = useMemo<Look>(
    () => ({ recipe: parseRecipe(user.avatar), color: user.avatarColor }),
    [user.avatar, user.avatarColor],
  );

  const [initial] = useState(() => readDraft(user.id));
  const [{ look, history }, dispatch] = useReducer(reducer, null, () => ({
    look: initial ?? saved,
    history: [],
  }));

  const dirty = !sameLook(look, saved);

  // Keep the stored draft in step: there while it differs from what's saved, gone once it doesn't.
  useEffect(() => {
    setDraft(
      draftKey(user.id),
      dirty
        ? JSON.stringify({ recipe: JSON.parse(serializeRecipe(look.recipe)), color: look.color })
        : '',
    );
  }, [dirty, look, user.id]);

  const change = useCallback(
    (next: Look | ((prev: Look) => Look)) => dispatch({ type: 'change', next }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const discard = useCallback(() => change(saved), [change, saved]);

  return {
    look,
    saved,
    dirty,
    canUndo: history.length > 0,
    /** What's on screen is exactly what was left unsaved last time (no edits since). */
    restored: dirty && initial !== null && sameLook(look, initial),
    change,
    undo,
    discard,
  };
}
