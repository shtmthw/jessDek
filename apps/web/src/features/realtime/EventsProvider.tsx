import {
  gql,
  useApolloClient,
  useSubscription,
  type ApolloClient,
  type Reference,
} from '@apollo/client';
import { useEffect, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  handleMediaRequested,
  handleMediaSignal,
  hasActiveSends,
  hasUnsentMedia,
  initMedia,
} from '@/features/media';
import { onPresence, onReconnect } from '@/features/media/downloads';
import { forgetConversation } from '@/features/media/store';
import { appendMessage, removeConversation, upsertConversation } from '@/lib/cacheUpdates';
import { useConnectionState } from '@/lib/connection';
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

const CONVERSATION_MUTED = gql`
  fragment ConversationMuted on Conversation {
    muted
  }
`;

const isMuted = (client: AnyClient, id: string) =>
  client.cache.readFragment<{ muted: boolean }>({
    id: client.cache.identify({ __typename: 'Conversation', id }),
    fragment: CONVERSATION_MUTED,
  })?.muted === true;

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
      unreadCount: (count: number, { readField }) => {
        // Already counted: the conversation arrived (e.g. a removed chat coming back) with this
        // message as its latest, and its unread count from the server includes it.
        const last = readField<Reference>('lastMessage');
        if (last && readField<string>('id', last) === message.id) return count;
        return fromOther && !watching ? count + 1 : count;
      },
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

  // Photos and videos: this tab serves and fetches them device to device while signed in.
  useEffect(() => initMedia(client), [client]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      // Closing now would cut off someone downloading from this tab, or lose media not sent yet.
      if (hasActiveSends() || hasUnsentMedia()) e.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);

  // Back from a dropped connection: whatever was waiting for a holder gets another go.
  const connection = useConnectionState();
  const lastConnection = useRef(connection);
  useEffect(() => {
    if (lastConnection.current === 'closed' && connection === 'connected') onReconnect();
    lastConnection.current = connection;
  }, [connection]);

  useSubscription(EVENTS, {
    // Events are applied to the cache by hand below; caching the raw union payload only adds noise.
    fetchPolicy: 'no-cache',
    onData: ({ data }) => {
      const event = data.data?.events;
      if (!event) return;

      switch (event.__typename) {
        case 'MessageAdded': {
          const { message } = event;
          // Chime for other people's messages, unless you're looking right at that chat or muted it.
          if (
            message.sender.id !== viewer.id &&
            !isLookingAt(message.conversationId) &&
            !isMuted(client, message.conversationId)
          )
            playSound(
              conversationType(client, message.conversationId) === 'GROUP' ? 'group' : 'dm',
            );
          applyMessage(client, viewer.id, message);
          break;
        }
        case 'ConversationUpdated':
          if (event.conversation?.hidden) {
            // You removed this chat on another device.
            const viewing = getActiveConversation() === event.conversationId;
            removeConversation(client, event.conversationId);
            if (viewing) navigateRef.current('/', { replace: true });
          } else if (event.conversation) {
            // A conversation you didn't have before: someone started a chat with you or added you
            // to a group (your own new chats and groups stay silent). A chat you'd removed coming
            // back with a new message isn't new: the message makes its own sound.
            const isNew = isKnownConversation(client, event.conversation.id) === false;
            const returning =
              event.conversation.type === 'DIRECT' && event.conversation.lastMessage;
            if (isNew && !returning && !isOwnConversationExpected() && !event.conversation.muted)
              playSound(event.conversation.type === 'GROUP' ? 'addedToGroup' : 'newChat');
            upsertConversation(client, event.conversation);
          } else {
            const viewing = getActiveConversation() === event.conversationId;
            removeConversation(client, event.conversationId);
            void forgetConversation(event.conversationId);
            if (viewing) navigateRef.current('/', { replace: true });
          }
          break;
        case 'TypingStarted':
          markTyping(
            event.conversationId,
            event.user.id,
            event.user.displayName,
            event.user.avatarColor,
          );
          break;
        case 'PresenceChanged':
          client.cache.modify({
            id: client.cache.identify({ __typename: 'User', id: event.userId }),
            fields: { online: () => event.online, lastSeenAt: () => event.lastSeenAt },
          });
          if (event.online) onPresence(event.userId);
          break;
        case 'MediaRequested':
          void handleMediaRequested(event);
          break;
        case 'MediaSignal':
          handleMediaSignal(event);
          break;
      }
    },
  });

  return <>{children}</>;
}
