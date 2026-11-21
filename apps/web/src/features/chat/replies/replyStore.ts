import { useSyncExternalStore } from 'react';
import type { ReplyTo } from '@/lib/gql';
import { onSignOut } from '@/lib/sessionHooks';

/**
 * The message each chat's composer is replying to. Kept per chat for the session, so switching
 * chats (and coming back) keeps it, like the draft text; a reload starts fresh.
 */
const replies = new Map<string, ReplyTo>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getReply = (conversationId: string): ReplyTo | null =>
  replies.get(conversationId) ?? null;

export function setReply(conversationId: string, quote: ReplyTo | null) {
  if ((replies.get(conversationId) ?? null) === quote) return;
  if (quote) replies.set(conversationId, quote);
  else replies.delete(conversationId);
  emit();
}

export const useReply = (conversationId: string): ReplyTo | null =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => getReply(conversationId),
    () => null,
  );

// The next person on this device never sees what the last one was replying to.
onSignOut(() => {
  replies.clear();
  emit();
});
