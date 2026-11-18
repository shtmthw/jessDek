import { gql, useApolloClient, useSubscription, type ApolloClient } from '@apollo/client';
import { useEffect, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { appendMessage, removeConversation, upsertConversation } from '@/lib/cacheUpdates';
import { CONVERSATIONS, EVENTS, MARK_READ, MESSAGE_FIELDS, type Message } from '@/lib/gql';
import { isOwnConversationExpected, playSound, primeAudio } from '@/lib/sounds';
import { useViewer } from '../session/ViewerProvider';
import { getActiveConversation } from './active';
import { clearTyping, markTyping } from './typing';

type AnyClient = ApolloClient<object>;

const CONVERSATION_TYPE = gql`
  fragment ConversationType on Conversation {
    type
  }
`;

const conversationType = (client: AnyClient, id: string) =>
  client.cache.readFragment<{ type: 'DIRECT' | 'GROUP' }>({
    id: client.cache.identify({ __typename: 'Conversation', id }),
    fragment: CONVERSATION_TYPE,
  })?.type;

const isKnownConversation = (client: AnyClient, id: string) =>
  client.cache.readQuery({ query: CONVERSATIONS })?.conversations.some((c) => c.id === id);

const isLookingAt = (conversationId: string) =>
  getActiveConversation() === conversationId &&
  document.visibilityState === 'visible' &&
  document.hasFocus();

/** Puts a new message into the cache: history, sidebar preview, ordering and unread badge. */
export function applyMessage(client: AnyClient, viewerId: string, message: Message) {
  const { conversationId } = message;
  appendMessage(client, message);
  clearTyping(conversationId, message.sender.id);

  const conversationCacheId = client.cache.identify({
    __typename: 'Conversation',
    id: conversationId,
  });
  if (!conversationCacheId) return;
  const fromOther = message.sender.id !== viewerId;
  const watching = fromOther && isLookingAt(conversationId);

  // Make sure the Message entity exists before pointing the conversation at it.
  const messageRef = client.cache.writeFragment({
    id: client.cache.identify({ __typename: 'Message', id: message.id }),
    fragment: MESSAGE_FIELDS,
    fragmentName: 'MessageFields',
    data: message,
  });

  client.cache.modify({
    id: conversationCacheId,
    fields: {
      lastMessage: (existing) => messageRef ?? existing,
      lastMessageAt: () => message.createdAt,
      unreadCount: (count: number) => (fromOther && !watching ? count + 1 : count),
    },
  });

  if (watching) void client.mutate({ mutation: MARK_READ, variables: { conversationId } });
}

export function EventsProvider({ children }: { children: ReactNode }) {
  const viewer = useViewer();
  const client = useApolloClient() as AnyClient;
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  // Audio can only start after a user gesture; get ready on the first one.
  useEffect(primeAudio, []);

  useSubscription(EVENTS, {
    // Events are applied to the cache by hand below; caching the raw union payload only adds noise.
    fetchPolicy: 'no-cache',
    onData: ({ data }) => {
      const event = data.data?.events;
      if (!event) return;

      switch (event.__typename) {
        case 'MessageAdded': {
          const { message } = event;
          // Chime for other people's messages, unless you're looking right at that chat.
          if (message.sender.id !== viewer.id && !isLookingAt(message.conversationId))
            playSound(
              conversationType(client, message.conversationId) === 'GROUP' ? 'group' : 'dm',
            );
          applyMessage(client, viewer.id, message);
          break;
        }
        case 'ConversationUpdated':
          if (event.conversation) {
            // A conversation you didn't have before: someone started a chat with you or added you
            // to a group (your own new chats and groups stay silent).
            const isNew = isKnownConversation(client, event.conversation.id) === false;
            if (isNew && !isOwnConversationExpected())
              playSound(event.conversation.type === 'GROUP' ? 'addedToGroup' : 'newChat');
            upsertConversation(client, event.conversation);
          } else {
            const viewing = getActiveConversation() === event.conversationId;
            removeConversation(client, event.conversationId);
            if (viewing) navigateRef.current('/', { replace: true });
          }
          break;
        case 'TypingStarted':
          markTyping(event.conversationId, event.user.id, event.user.displayName);
          break;
        case 'PresenceChanged':
          client.cache.modify({
            id: client.cache.identify({ __typename: 'User', id: event.userId }),
            fields: { online: () => event.online, lastSeenAt: () => event.lastSeenAt },
          });
          break;
      }
    },
  });

  return <>{children}</>;
}
