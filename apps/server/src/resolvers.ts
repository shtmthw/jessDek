import type { User } from '@prisma/client';
import { filter, pipe } from 'graphql-yoga';
import { requireUser, type Context } from './context.js';
import { signSession } from './auth.js';
import { config } from './config.js';
import { fail } from './errors.js';
import { pubsub, userTopic } from './pubsub.js';
import * as cards from './services/cards.js';
import * as conversations from './services/conversations.js';
import * as deck from './services/deck.js';
import * as media from './services/media.js';
import * as messages from './services/messages.js';
import * as reactions from './services/reactions.js';
import * as requests from './services/requests.js';
import { blockedBetween, listBlocked } from './services/blocks.js';
import * as safety from './services/safety.js';
import * as themes from './services/themes.js';
import { announceUser, isOnline } from './services/presence.js';
import * as users from './services/users.js';
import type { MessageWithSender, ServerEvent } from './types.js';

const iso = (d: Date) => d.toISOString();

export const resolvers = {
  Query: {
    me: async (_: unknown, __: unknown, ctx: Context) =>
      ctx.userId ? users.getUser(ctx.userId) : null,
    conversations: (_: unknown, __: unknown, ctx: Context) =>
      conversations.listConversations(requireUser(ctx)),
    conversation: (_: unknown, { id }: { id: string }, ctx: Context) =>
      conversations.getConversation(requireUser(ctx), id),
    messages: (
      _: unknown,
      args: { conversationId: string; before?: string | null; limit?: number | null },
      ctx: Context,
    ) => messages.listMessages(requireUser(ctx), args.conversationId, args.before, args.limit),
    searchUsers: (_: unknown, { query }: { query: string }, ctx: Context) =>
      users.searchUsers(requireUser(ctx), query),
    mediaConfig: (_: unknown, __: unknown, ctx: Context) => (requireUser(ctx), { ...config.media }),
    blockedUsers: (_: unknown, __: unknown, ctx: Context) => listBlocked(requireUser(ctx)),
    card: (_: unknown, { username }: { username: string }, ctx: Context) =>
      cards.getCard(ctx.userId, username),
    invites: (_: unknown, __: unknown, ctx: Context) => requests.listInvites(requireUser(ctx)),
    deckStart: (_: unknown, __: unknown, ctx: Context) => deck.deckStart(requireUser(ctx)),
    deckCards: (
      _: unknown,
      args: { dir: 'LEFT' | 'RIGHT'; cursor: string; limit?: number | null },
      ctx: Context,
    ) => deck.deckCards(requireUser(ctx), args.dir, args.cursor, args.limit),
    deckCard: (_: unknown, { id }: { id: string }, ctx: Context) =>
      deck.deckCard(requireUser(ctx), id),
  },

  Mutation: {
    signUp: async (_: unknown, { input }: { input: unknown }, ctx: Context) => {
      const user = await users.signUp(input);
      ctx.session.token = await signSession(user.id);
      return user;
    },
    signIn: async (
      _: unknown,
      { input }: { input: { identifier: string; password: string } },
      ctx: Context,
    ) => {
      const user = await users.signIn(input, ctx.ip);
      ctx.session.token = await signSession(user.id);
      return user;
    },
    signOut: (_: unknown, __: unknown, ctx: Context) => {
      ctx.session.token = null;
      return true;
    },
    updateProfile: async (_: unknown, { input }: { input: unknown }, ctx: Context) => {
      const user = await users.updateProfile(requireUser(ctx), input);
      await announceUser(user);
      return user;
    },
    updateAvatar: async (_: unknown, { input }: { input: unknown }, ctx: Context) => {
      const user = await users.updateAvatar(requireUser(ctx), input);
      await announceUser(user);
      return user;
    },

    updateCard: (_: unknown, { input }: { input: unknown }, ctx: Context) =>
      cards.updateCard(requireUser(ctx), input),
    dismissWelcome: (_: unknown, __: unknown, ctx: Context) =>
      users.dismissWelcome(requireUser(ctx)),

    startDirect: (_: unknown, { username }: { username: string }, ctx: Context) =>
      conversations.startDirect(requireUser(ctx), username),
    respondToRequest: (
      _: unknown,
      args: { conversationId: string; accept: boolean },
      ctx: Context,
    ) => requests.respondToRequest(requireUser(ctx), args.conversationId, args.accept),
    respondToInvite: (
      _: unknown,
      args: { conversationId: string; accept: boolean },
      ctx: Context,
    ) => requests.respondToInvite(requireUser(ctx), args.conversationId, args.accept),
    cancelInvite: (_: unknown, args: { conversationId: string; userId: string }, ctx: Context) =>
      requests.cancelInvite(requireUser(ctx), args.conversationId, args.userId),
    createGroup: (_: unknown, args: { name: string; usernames: string[] }, ctx: Context) =>
      conversations.createGroup(requireUser(ctx), args.name, args.usernames),
    addMembers: (_: unknown, args: { conversationId: string; usernames: string[] }, ctx: Context) =>
      conversations.addMembers(requireUser(ctx), args.conversationId, args.usernames),
    renameGroup: (_: unknown, args: { conversationId: string; name: string }, ctx: Context) =>
      conversations.renameGroup(requireUser(ctx), args.conversationId, args.name),
    leaveGroup: (_: unknown, { conversationId }: { conversationId: string }, ctx: Context) =>
      conversations.leaveGroup(requireUser(ctx), conversationId),
    removeMember: (_: unknown, args: { conversationId: string; userId: string }, ctx: Context) =>
      conversations.removeMember(requireUser(ctx), args.conversationId, args.userId),
    setChatTheme: (
      _: unknown,
      args: { conversationId: string; theme?: string | null },
      ctx: Context,
    ) => themes.setChatTheme(requireUser(ctx), args.conversationId, args.theme),
    setMemberColor: (
      _: unknown,
      args: { conversationId: string; color?: string | null },
      ctx: Context,
    ) => themes.setMemberColor(requireUser(ctx), args.conversationId, args.color),
    hideConversation: (_: unknown, { conversationId }: { conversationId: string }, ctx: Context) =>
      conversations.hideConversation(requireUser(ctx), conversationId),
    muteConversation: (
      _: unknown,
      args: { conversationId: string; muted: boolean },
      ctx: Context,
    ) => conversations.muteConversation(requireUser(ctx), args.conversationId, args.muted),
    blockUser: (_: unknown, { userId }: { userId: string }, ctx: Context) =>
      safety.blockUser(requireUser(ctx), userId),
    unblockUser: (_: unknown, { userId }: { userId: string }, ctx: Context) =>
      safety.unblockUser(requireUser(ctx), userId),

    sendMessage: (
      _: unknown,
      args: {
        conversationId: string;
        body: string;
        attachments?: unknown;
        replyToId?: string | null;
      },
      ctx: Context,
    ) =>
      messages.sendMessage(
        requireUser(ctx),
        args.conversationId,
        args.body,
        args.attachments,
        args.replyToId,
      ),
    react: (_: unknown, args: { messageId: string; emoji?: string | null }, ctx: Context) =>
      reactions.react(requireUser(ctx), args.messageId, args.emoji),
    requestMedia: (
      _: unknown,
      args: { attachmentId: string; part: 'FILE' | 'POSTER' },
      ctx: Context,
    ) => media.requestMedia(ctx, args.attachmentId, args.part),
    sendSignal: (_: unknown, { input }: { input: unknown }, ctx: Context) =>
      media.sendSignal(ctx, input),
    openRelay: (
      _: unknown,
      args: { requestId: string; holderPeerId: string; key?: string | null },
      ctx: Context,
    ) => media.openRelay(ctx, args.requestId, args.holderPeerId, args.key),
    markRead: (_: unknown, { conversationId }: { conversationId: string }, ctx: Context) =>
      conversations.markRead(requireUser(ctx), conversationId),
    setTyping: (_: unknown, { conversationId }: { conversationId: string }, ctx: Context) =>
      messages.setTyping(requireUser(ctx), conversationId),
  },

  Subscription: {
    events: {
      subscribe: (_: unknown, __: unknown, ctx: Context) => {
        if (!ctx.userId) throw fail('UNAUTHENTICATED', 'Please sign in to continue');
        const me = ctx.peerId;
        // Peer-targeted events (media requests and signals) reach only the tab they name.
        return pipe(
          pubsub.subscribe(userTopic(ctx.userId)),
          filter((e: ServerEvent) => !('toPeerId' in e) || e.toPeerId === me),
        );
      },
      resolve: (event: ServerEvent) => event,
    },
  },

  ChatEvent: {
    __resolveType: (event: ServerEvent) => event.__typename,
  },

  ConversationUpdated: {
    // Resolved per subscriber so titles / unread counts are always from their point of view.
    conversation: (event: { conversationId: string }, _: unknown, ctx: Context) =>
      ctx.userId ? conversations.getConversation(ctx.userId, event.conversationId) : null,
  },

  InviteChanged: {
    invite: (event: { conversationId: string }, _: unknown, ctx: Context) =>
      ctx.userId ? requests.getInvite(ctx.userId, event.conversationId) : null,
  },

  GroupInvite: {
    id: (i: requests.InviteView) => i.conversationId,
    createdAt: (i: requests.InviteView) => iso(i.createdAt),
  },

  MessageRequest: {
    sentAt: (r: { sentAt: Date | null }) => (r.sentAt ? iso(r.sentAt) : null),
    respondedAt: (r: { respondedAt: Date | null }) => (r.respondedAt ? iso(r.respondedAt) : null),
  },

  MemberInvite: {
    createdAt: (i: { createdAt: Date }) => iso(i.createdAt),
    respondedAt: (i: { respondedAt: Date | null }) => (i.respondedAt ? iso(i.respondedAt) : null),
  },

  PresenceChanged: {
    lastSeenAt: (e: { lastSeenAt: Date | null }) => (e.lastSeenAt ? iso(e.lastSeenAt) : null),
  },

  Viewer: {
    welcomed: (u: { welcomedAt: Date | null }) => u.welcomedAt !== null,
  },

  User: {
    // Presence never crosses a block, in either direction, and never reaches signed-out
    // visitors (the public card page).
    online: async (u: User, _: unknown, ctx: Context) =>
      !ctx.userId || (await blockedBetween(ctx.userId, u.id)) ? false : isOnline(u.id),
    lastSeenAt: async (u: User, _: unknown, ctx: Context) =>
      !ctx.userId || (await blockedBetween(ctx.userId, u.id)) ? null : iso(u.lastSeenAt),
  },

  Conversation: {
    lastMessageAt: (c: conversations.ConversationView) => iso(c.lastMessageAt),
    createdAt: (c: conversations.ConversationView) => iso(c.createdAt),
    themeSetAt: (c: conversations.ConversationView) => (c.themeSetAt ? iso(c.themeSetAt) : null),
  },

  Message: {
    createdAt: (m: MessageWithSender) => iso(m.createdAt),
    attachments: (m: MessageWithSender) => m.attachments ?? [],
    // A quoted message is loaded one level deep: its own quote and reactions aren't.
    replyTo: (m: Partial<MessageWithSender>) => m.replyTo ?? null,
    reactions: (m: Partial<MessageWithSender>) => m.reactions ?? [],
  },

  Reaction: {
    reactedAt: (r: { updatedAt: Date }) => iso(r.updatedAt),
  },

  ReactionPreview: {
    reactedAt: (r: { updatedAt: Date }) => iso(r.updatedAt),
  },
};
