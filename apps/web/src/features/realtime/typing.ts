import { useSyncExternalStore } from 'react';

const TYPING_MS = 3500;
const EMPTY: string[] = [];
const NO_TYPERS: Typer[] = [];

/** Someone who is typing right now. */
export interface Typer {
  id: string;
  name: string;
  color?: string;
  /** Their avatar recipe (JSON); null or missing for the default character. */
  avatar?: string | null;
}

interface Entry extends Typer {
  timer: ReturnType<typeof setTimeout>;
}

const byConversation = new Map<string, Map<string, Entry>>();
const nameSnapshots = new Map<string, string[]>();
const typerSnapshots = new Map<string, Typer[]>();
const listeners = new Set<() => void>();

const emit = (conversationId: string) => {
  const entries = byConversation.get(conversationId);
  const typers = entries ? [...entries.values()] : [];
  nameSnapshots.set(conversationId, typers.length > 0 ? typers.map((e) => e.name) : EMPTY);
  typerSnapshots.set(
    conversationId,
    typers.length > 0
      ? typers.map(({ id, name, color, avatar }) => ({ id, name, color, avatar }))
      : NO_TYPERS,
  );
  listeners.forEach((l) => l());
};

export function clearTyping(conversationId: string, userId: string) {
  const entries = byConversation.get(conversationId);
  const entry = entries?.get(userId);
  if (!entries || !entry) return;
  clearTimeout(entry.timer);
  entries.delete(userId);
  emit(conversationId);
}

export function markTyping(
  conversationId: string,
  userId: string,
  name: string,
  color?: string,
  avatar?: string | null,
) {
  let entries = byConversation.get(conversationId);
  if (!entries) byConversation.set(conversationId, (entries = new Map()));
  const existing = entries.get(userId);
  clearTimeout(existing?.timer);
  entries.set(userId, {
    id: userId,
    name,
    color,
    avatar,
    timer: setTimeout(() => clearTyping(conversationId, userId), TYPING_MS),
  });
  // Another keystroke from someone already shown changes nothing on screen: stay quiet.
  if (!existing || existing.name !== name || existing.color !== color || existing.avatar !== avatar)
    emit(conversationId);
}

/** Display names of people currently typing in a conversation (stable reference until it changes). */
export const useTypingNames = (conversationId: string): string[] =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => nameSnapshots.get(conversationId) ?? EMPTY,
    () => EMPTY,
  );

/** Who is typing, with their avatar colours (stable reference until it changes). */
export const useTypers = (conversationId: string): Typer[] =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => typerSnapshots.get(conversationId) ?? NO_TYPERS,
    () => NO_TYPERS,
  );

/** Tests only. */
export function resetTyping(): void {
  for (const entries of byConversation.values())
    for (const e of entries.values()) clearTimeout(e.timer);
  byConversation.clear();
  nameSnapshots.clear();
  typerSnapshots.clear();
}
