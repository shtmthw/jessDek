import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { getDraft, setDraft } from '@/lib/drafts';
import { normalizeCard, parseCard, sameCard, serializeCard, type CardRecipe } from './recipe';

const HISTORY_MAX = 80;
/** Edits with the same `merge` key this close together are one undo step (typing, nudging). */
const MERGE_MS = 1200;

/** Card edits in progress live with the message drafts, so sign-out clears them too. */
const draftKey = (userId: string) => `card:${userId}`;

function readDraft(userId: string): CardRecipe | null {
  const raw = getDraft(draftKey(userId));
  if (!raw) return null;
  try {
    return normalizeCard(JSON.parse(raw));
  } catch {
    return null;
  }
}

interface State {
  card: CardRecipe;
  /** Earlier cards, oldest first. */
  history: CardRecipe[];
  /** The last change's merge key and time, to fold a burst of small edits into one step. */
  last: { key: string; at: number } | null;
}

export type CardChange = CardRecipe | ((prev: CardRecipe) => CardRecipe);

type Action = { type: 'change'; next: CardChange; merge?: string; at: number } | { type: 'undo' };

function reducer(state: State, action: Action): State {
  if (action.type === 'undo') {
    const prev = state.history[state.history.length - 1];
    return prev ? { card: prev, history: state.history.slice(0, -1), last: null } : state;
  }
  const next = typeof action.next === 'function' ? action.next(state.card) : action.next;
  // Compare the raw about too: a trailing space is "the same card" once saved, but it must still
  // reach the text box, or typing a space between words would be swallowed.
  if (sameCard(state.card, next) && state.card.about === next.about) return state;
  const merging =
    action.merge !== undefined &&
    state.last?.key === action.merge &&
    action.at - state.last.at < MERGE_MS &&
    state.history.length > 0;
  return {
    card: next,
    history: merging ? state.history : [...state.history.slice(-(HISTORY_MAX - 1)), state.card],
    last: action.merge !== undefined ? { key: action.merge, at: action.at } : null,
  };
}

/**
 * The studio's working copy of a card: what's on screen, an undo history, and how it differs from
 * what's saved. Unsaved edits survive leaving the page (or a reload) until saved or discarded.
 */
export function useCardDraft(userId: string, savedRaw: string | null) {
  const saved = useMemo(() => parseCard(savedRaw), [savedRaw]);
  const [initial] = useState(() => readDraft(userId));
  const [{ card, history }, dispatch] = useReducer(reducer, null, () => ({
    card: initial ?? saved,
    history: [],
    last: null,
  }));

  const dirty = !sameCard(card, saved);

  // Keep the stored draft in step: there while it differs from what's saved, gone once it doesn't.
  useEffect(() => {
    setDraft(draftKey(userId), dirty ? serializeCard(card) : '');
  }, [dirty, card, userId]);

  /** `merge`: edits with the same key in quick succession become one undo step. */
  const change = useCallback(
    (next: CardChange, merge?: string) => dispatch({ type: 'change', next, merge, at: Date.now() }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const discard = useCallback(() => change(saved), [change, saved]);

  return {
    card,
    saved,
    dirty,
    canUndo: history.length > 0,
    /** What's on screen is exactly what was left unsaved last time (no edits since). */
    restored: dirty && initial !== null && sameCard(card, initial),
    change,
    undo,
    discard,
  };
}
