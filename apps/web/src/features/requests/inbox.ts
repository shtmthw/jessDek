import { useQuery } from '@apollo/client';
import { useMemo } from 'react';
import type { AnyClient } from '@/lib/cacheUpdates';
import { CONVERSATIONS, INVITES, type Conversation, type GroupInvite } from '@/lib/gql';

/** A message request someone sent you: it lives under Requests, not in your chats. */
export const isIncomingRequest = (c: Pick<Conversation, 'request'>) =>
  c.request?.state === 'PENDING' && !c.request.sentByMe;

/** You started this request and can still send its one message. */
export const canSendRequest = (c: Pick<Conversation, 'request'>) =>
  c.request?.state === 'PENDING' && c.request.sentByMe && !c.request.sentAt;

export const firstName = (name: string) => name.split(' ')[0] ?? name;

/** Message requests to you (newest first) and your pending group invites. */
export function useRequestInbox() {
  const { data: list } = useQuery(CONVERSATIONS, { fetchPolicy: 'cache-first' });
  const { data: inviteData, loading } = useQuery(INVITES, { fetchPolicy: 'cache-and-network' });
  return useMemo(() => {
    const requests = (list?.conversations ?? [])
      .filter(isIncomingRequest)
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    const invites = inviteData?.invites ?? [];
    return { requests, invites, count: requests.length + invites.length, loading };
  }, [list, inviteData, loading]);
}

/** Puts a live invite into the cached list, or takes it out (`invite` null: it's gone). */
export function applyInvite(client: AnyClient, conversationId: string, invite: GroupInvite | null) {
  client.cache.updateQuery({ query: INVITES }, (data) => {
    if (!data) return invite ? { invites: [invite] } : undefined;
    const rest = data.invites.filter((i) => i.conversationId !== conversationId);
    return { invites: invite ? [invite, ...rest] : rest };
  });
}
