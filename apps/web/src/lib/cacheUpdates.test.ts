import { ApolloClient, InMemoryCache } from '@apollo/client';
import { describe, expect, it } from 'vitest';
import { applyReactions, applyUser } from './cacheUpdates';
import {
  CONVERSATIONS,
  MESSAGE_FIELDS,
  type Conversation,
  type Message,
  type Reaction,
  type User,
} from './gql';

const newClient = () =>
  new ApolloClient({
    cache: new InMemoryCache({
      typePolicies: { Message: { fields: { reactions: { merge: false } } } },
    }),
  });

const bob: User = {
  __typename: 'User',
  id: 'bob',
  username: 'bob',
  displayName: 'Bob Carter',
  avatarColor: '#22c55e',
  avatar: null,
  online: true,
  lastSeenAt: null,
};

const message: Message = {
  __typename: 'Message',
  id: 'm1',
  conversationId: 'c1',
  body: 'see you at 7',
  createdAt: '2026-11-19T10:00:00.000Z',
  sender: bob,
  attachments: [],
  replyTo: null,
  reactions: [],
};

const heart: Reaction = {
  __typename: 'Reaction',
  emoji: '❤️',
  reactedAt: '2026-11-19T10:01:00.000Z',
  user: { __typename: 'User', id: 'alice', displayName: 'Alice' },
};

// Live events arrive with `no-cache`: these helpers are what puts them in the cache.
describe('live event cache updates', () => {
  it('applies a reaction change to a loaded message, and ignores ones that are not loaded', () => {
    const client = newClient();
    const id = client.cache.identify({ __typename: 'Message', id: message.id })!;
    client.cache.writeFragment({
      id,
      fragment: MESSAGE_FIELDS,
      fragmentName: 'MessageFields',
      data: message,
    });

    applyReactions(client, { id: 'm1', reactions: [heart] });
    const read = client.cache.readFragment<Message>({
      id,
      fragment: MESSAGE_FIELDS,
      fragmentName: 'MessageFields',
    });
    expect(read?.reactions.map((r) => r.emoji)).toEqual(['❤️']);
    expect(read?.body).toBe('see you at 7');

    applyReactions(client, { id: 'm1', reactions: [] });
    expect(
      client.cache.readFragment<Message>({
        id,
        fragment: MESSAGE_FIELDS,
        fragmentName: 'MessageFields',
      })?.reactions,
    ).toEqual([]);

    applyReactions(client, { id: 'not-loaded', reactions: [heart] });
    expect(client.cache.extract()['Message:not-loaded']).toBeUndefined();
  });

  it('applies a rename everywhere: the person, and the title of your direct chat with them', () => {
    const client = newClient();
    const dm: Conversation = {
      __typename: 'Conversation',
      id: 'c1',
      type: 'DIRECT',
      title: 'Bob Carter',
      name: null,
      unreadCount: 0,
      lastMessageAt: message.createdAt,
      createdAt: message.createdAt,
      peer: bob,
      members: [bob],
      lastMessage: message,
      muted: false,
      hidden: false,
      blockedByMe: false,
      canMessage: true,
      ownerId: null,
      lastReaction: null,
      theme: null,
      themeSetBy: null,
      themeSetAt: null,
      memberColors: [],
      request: null,
      invites: [],
    };
    client.cache.writeQuery({ query: CONVERSATIONS, data: { conversations: [dm] } });

    applyUser(client, { ...bob, displayName: 'Bobby Carter', avatar: '{"v":1,"hair":"afro"}' });
    const list = client.cache.readQuery({ query: CONVERSATIONS })!.conversations;
    expect(list[0]!.title).toBe('Bobby Carter');
    expect(list[0]!.peer?.displayName).toBe('Bobby Carter');
    expect(list[0]!.peer?.avatar).toBe('{"v":1,"hair":"afro"}');
    expect(list[0]!.lastMessage?.sender.displayName).toBe('Bobby Carter');
  });
});
