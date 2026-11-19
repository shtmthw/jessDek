import type { ApolloClient } from '@apollo/client';
import {
  CONVERSATIONS,
  CONVERSATION_FIELDS,
  MESSAGE_REACTIONS,
  MESSAGES,
  USER_FIELDS,
  type Conversation,
  type Message,
  type Reaction,
  type User,
} from './gql';

type AnyClient = ApolloClient<object>;

/** Adds a message to a conversation's cached history (no-op if it isn't loaded or already there). */
export function appendMessage(client: AnyClient, message: Message) {
  client.cache.updateQuery(
    { query: MESSAGES, variables: { conversationId: message.conversationId } },
    (data) => {
      if (!data) return undefined; // history not loaded yet: opening the chat will fetch it
      if (data.messages.messages.some((m) => m.id === message.id)) return data;
      return { messages: { ...data.messages, messages: [...data.messages.messages, message] } };
    },
  );
}

/** Writes the latest version of a conversation and makes sure it is in the sidebar list. */
export function upsertConversation(client: AnyClient, conversation: Conversation) {
  client.cache.writeFragment({
    id: client.cache.identify({ __typename: 'Conversation', id: conversation.id }),
    fragment: CONVERSATION_FIELDS,
    fragmentName: 'ConversationFields',
    data: conversation,
  });
  client.cache.updateQuery({ query: CONVERSATIONS }, (data) => {
    if (!data) return undefined;
    if (data.conversations.some((c) => c.id === conversation.id)) return data;
    return { conversations: [conversation, ...data.conversations] };
  });
}

/**
 * A person's latest name, colour and avatar. Every message, list row and member that points at them
 * repaints. (Live events arrive with `no-cache`, so nothing is written for us.)
 */
export function applyUser(client: AnyClient, user: User) {
  client.cache.writeFragment({
    id: client.cache.identify({ __typename: 'User', id: user.id }),
    fragment: USER_FIELDS,
    data: { __typename: 'User', ...user },
  });
  // A direct chat's title is the other person's name, worked out by the server: keep it in step.
  client.cache.updateQuery({ query: CONVERSATIONS }, (data) => {
    if (!data?.conversations.some((c) => c.peer?.id === user.id && c.title !== user.displayName))
      return undefined;
    return {
      conversations: data.conversations.map((c) =>
        c.type === 'DIRECT' && c.peer?.id === user.id ? { ...c, title: user.displayName } : c,
      ),
    };
  });
}

/** A message's reactions, as they stand now (it's a no-op for messages that aren't cached). */
export function applyReactions(
  client: AnyClient,
  message: { id: string; reactions: readonly Reaction[] },
) {
  const id = client.cache.identify({ __typename: 'Message', id: message.id });
  // Only messages someone has loaded: a reaction never creates a stray, half-empty message.
  if (
    !id ||
    !client.cache.readFragment({
      id,
      fragment: MESSAGE_REACTIONS,
      fragmentName: 'MessageReactions',
    })
  )
    return;
  client.cache.writeFragment({
    id,
    fragment: MESSAGE_REACTIONS,
    fragmentName: 'MessageReactions',
    data: { __typename: 'Message', id: message.id, reactions: message.reactions },
  });
}

export function removeConversation(client: AnyClient, id: string) {
  client.cache.updateQuery({ query: CONVERSATIONS }, (data) =>
    data ? { conversations: data.conversations.filter((c) => c.id !== id) } : undefined,
  );
  client.cache.evict({ id: client.cache.identify({ __typename: 'Conversation', id }) });
  client.cache.evict({ fieldName: 'messages', args: { conversationId: id } });
  client.cache.gc();
}
