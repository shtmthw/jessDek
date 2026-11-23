import {
  Prisma,
  type Conversation,
  type ConversationMember,
  type InviteState,
  type RequestState,
  type User,
} from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { fail, parseInput } from '../errors.js';
import { publishToUsers } from '../pubsub.js';
import { RateLimiter } from '../rateLimit.js';
import { blockedBetween, hasBlocked } from './blocks.js';
import { cancelRequestsFor } from './media.js';
import { messageInclude, type MessageWithSender } from '../types.js';

export interface ConversationView {
  id: string;
  type: Conversation['type'];
  name: string | null;
  title: string;
  members: User[];
  peer: User | null;
  lastMessage: MessageWithSender | null;
  lastMessageAt: Date;
  unreadCount: number;
  createdAt: Date;
  /** The viewer muted it: no sounds, not in the tab title. */
  muted: boolean;
  /** The viewer removed this direct chat from their list (it returns with the next message). */
  hidden: boolean;
  /** Direct chats: the viewer blocked the other person. */
  blockedByMe: boolean;
  /** False in a direct chat where either person blocked the other. */
  canMessage: boolean;
  /** Groups: the member who can rename it and remove people. */
  ownerId: string | null;
  /** The newest reaction by the viewer or on the viewer's message, if newer than the last message. */
  lastReaction: ReactionPreviewRow | null;
  /** Chat theme recipe (JSON). Null: Classic. */
  theme: string | null;
  /** Who last changed the theme, and when. */
  themeSetBy: User | null;
  themeSetAt: Date | null;
  /** Groups: colours members picked for themselves. */
  memberColors: Array<{ userId: string; color: string }>;
  /** Direct chats: a message request that hasn't been accepted. Null: an ordinary chat. */
  request: RequestView | null;
  /** Groups: people invited who haven't joined (pending or declined). */
  invites: MemberInviteView[];
}

export interface RequestView {
  state: RequestState;
  /** The viewer started it (and waits for the answer). */
  sentByMe: boolean;
  sentAt: Date | null;
  respondedAt: Date | null;
}

export interface MemberInviteView {
  user: User;
  invitedBy: User;
  state: InviteState;
  createdAt: Date;
  respondedAt: Date | null;
}

/**
 * New message requests and group invites, per sender: 20 people an hour. Each request is a single
 * message, so this only bounds how many strangers one account can knock on.
 */
export const requestLimiter = new RateLimiter(20, 60 * 60_000);

function spendRequests(userId: string, count: number) {
  if (!requestLimiter.allow(userId))
    throw fail('RATE_LIMITED', 'You’ve reached out to a lot of people. Try again later');
  for (let i = 0; i < count; i++) requestLimiter.hit(userId);
}

/**
 * Which conversations `userId` can see. A message request reaches its recipient only once its one
 * message is sent, and leaves their list for good when they decline it.
 */
export const visibleTo = (userId: string): Prisma.ConversationWhereInput => ({
  members: { some: { userId } },
  OR: [
    { requestState: null },
    { requestedById: userId },
    { requestState: 'PENDING', requestSentAt: { not: null } },
  ],
});

const reactionPreviewInclude = {
  user: true,
  message: { include: messageInclude },
} satisfies Prisma.ReactionInclude;

export type ReactionPreviewRow = Prisma.ReactionGetPayload<{
  include: typeof reactionPreviewInclude;
}>;

/** What the chat list says about reactions: only yours, or ones on your messages. */
const lastReactionFor = (userId: string, conversationId: string, after: Date) =>
  prisma.reaction.findFirst({
    where: {
      updatedAt: { gt: after },
      message: { conversationId },
      OR: [{ userId }, { message: { senderId: userId } }],
    },
    orderBy: { updatedAt: 'desc' },
    include: reactionPreviewInclude,
  });

const groupNameSchema = z
  .string({ required_error: 'Give the group a name' })
  .trim()
  .min(1, 'Give the group a name')
  .max(60, 'Group name is too long');
const usernamesSchema = z
  .array(z.string().trim().toLowerCase().min(1))
  .min(1, 'Pick at least one person')
  .max(99, 'That’s too many people at once');

const include = {
  themeSetBy: true,
  invites: { include: { user: true, invitedBy: true }, orderBy: { createdAt: 'asc' } },
  // Join order, with a tiebreak: automatic member colours follow it, so it must be stable.
  members: { include: { user: true }, orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }] },
  messages: {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 1,
    include: messageInclude,
  },
} satisfies Prisma.ConversationInclude;

type Row = Prisma.ConversationGetPayload<{ include: typeof include }>;

async function toView(userId: string, row: Row): Promise<ConversationView> {
  const me: ConversationMember | undefined = row.members.find((m) => m.userId === userId);
  const unreadCount = me
    ? await prisma.message.count({
        where: {
          conversationId: row.id,
          senderId: { not: userId },
          createdAt: { gt: me.lastReadAt },
        },
      })
    : 0;
  const members = row.members.map((m) => m.user);
  const peer = row.type === 'DIRECT' ? (members.find((u) => u.id !== userId) ?? null) : null;
  const blockedByMe = peer ? await hasBlocked(userId, peer.id) : false;
  // A request isn't a chat yet: no composer, replies, reactions or themes (the sender's one
  // message goes through the request composer instead).
  const canMessage =
    row.requestState === null &&
    (row.type === 'GROUP' || (peer !== null && !(await blockedBetween(userId, peer.id))));
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    title: row.type === 'DIRECT' ? (peer?.displayName ?? 'Deleted user') : (row.name ?? 'Group'),
    members,
    peer,
    lastMessage: row.messages[0] ?? null,
    lastMessageAt: row.lastMessageAt,
    unreadCount,
    createdAt: row.createdAt,
    muted: Boolean(me?.mutedAt),
    hidden: Boolean(me?.hiddenAt),
    blockedByMe,
    canMessage,
    ownerId: row.members.find((m) => m.role === 'OWNER')?.userId ?? null,
    lastReaction: await lastReactionFor(userId, row.id, row.lastMessageAt),
    theme: row.theme,
    themeSetBy: row.themeSetBy,
    themeSetAt: row.themeSetAt,
    memberColors:
      row.type === 'GROUP'
        ? row.members.flatMap((m) => (m.color ? [{ userId: m.userId, color: m.color }] : []))
        : [],
    request: row.requestState
      ? {
          state: row.requestState,
          sentByMe: row.requestedById === userId,
          sentAt: row.requestSentAt,
          respondedAt: row.requestRespondedAt,
        }
      : null,
    invites: row.invites.map((i) => ({
      user: i.user,
      invitedBy: i.invitedBy,
      state: i.state,
      createdAt: i.createdAt,
      respondedAt: i.respondedAt,
    })),
  };
}

/** Throws NOT_FOUND unless `userId` belongs to the conversation (never reveals that it exists). */
export async function requireMember(
  userId: string,
  conversationId: string,
): Promise<ConversationMember> {
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!member) throw fail('NOT_FOUND', 'Conversation not found');
  return member;
}

/**
 * Like `requireMember`, and refuses while the chat is a message request: typing, reactions and
 * themes wait until it's accepted.
 */
export async function requireOpenChat(
  userId: string,
  conversationId: string,
): Promise<ConversationMember> {
  const member = await requireMember(userId, conversationId);
  const { requestState } = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: { requestState: true },
  });
  if (requestState) throw fail('FORBIDDEN', 'That can wait until the request is accepted');
  return member;
}

export async function memberIds(conversationId: string): Promise<string[]> {
  const rows = await prisma.conversationMember.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

export async function listConversations(userId: string): Promise<ConversationView[]> {
  const rows = await prisma.conversation.findMany({
    // Direct chats you removed stay out of the list until something new happens in them.
    where: { AND: [visibleTo(userId), { members: { some: { userId, hiddenAt: null } } }] },
    orderBy: { lastMessageAt: 'desc' },
    include,
  });
  return Promise.all(rows.map((r) => toView(userId, r)));
}

/** Returns null when the user is not a member (used by realtime events after leaving a group). */
export async function getConversation(
  userId: string,
  id: string,
): Promise<ConversationView | null> {
  const row = await prisma.conversation.findFirst({
    where: { id, ...visibleTo(userId) },
    include,
  });
  return row ? toView(userId, row) : null;
}

export async function requireView(userId: string, id: string): Promise<ConversationView> {
  const view = await getConversation(userId, id);
  if (!view) throw fail('NOT_FOUND', 'Conversation not found');
  return view;
}

/** People who blocked `userId` can't be put in a group by them. */
async function refuseBlockers(userId: string, users: User[]) {
  for (const u of users) {
    if (await hasBlocked(u.id, userId)) throw fail('FORBIDDEN', `${u.displayName} can’t be added`);
  }
}

async function usersByUsername(usernames: string[]): Promise<User[]> {
  const unique = [...new Set(usernames)];
  const users = await prisma.user.findMany({ where: { username: { in: unique } } });
  const found = new Set(users.map((u) => u.username));
  const missing = unique.find((u) => !found.has(u));
  if (missing) throw fail('NOT_FOUND', `No one is using the username “${missing}”`);
  return users;
}

const notify = (ids: Iterable<string>, conversationId: string) =>
  publishToUsers(ids, { __typename: 'ConversationUpdated', conversationId });

/** Tells invitees their invite to this group changed (it's resolved per person, null once gone). */
export const notifyInvites = (ids: Iterable<string>, conversationId: string) =>
  publishToUsers(ids, { __typename: 'InviteChanged', conversationId });

/**
 * Opens the direct chat with someone. A new one starts as a message request: the starter can send
 * one message, text only, and the other person accepts or declines it.
 */
export async function startDirect(userId: string, username: string): Promise<ConversationView> {
  const handle = username.trim().toLowerCase().replace(/^@/, '');
  if (!handle) throw fail('BAD_USER_INPUT', 'Enter a username', { field: 'username' });
  const other = await prisma.user.findUnique({ where: { username: handle } });
  if (!other) throw fail('NOT_FOUND', `No one is using the username “${handle}”`);
  if (other.id === userId) throw fail('BAD_USER_INPUT', 'You can’t start a chat with yourself');

  const directKey = [userId, other.id].sort().join(':');
  let conversation = await prisma.conversation.findUnique({ where: { directKey } });
  // Someone who blocked you can't be reached by a new chat. (An existing one still opens.)
  if (!conversation && (await hasBlocked(other.id, userId)))
    throw fail('FORBIDDEN', 'You can’t message this person');
  if (!conversation) {
    try {
      conversation = await prisma.conversation.create({
        data: {
          type: 'DIRECT',
          directKey,
          createdById: userId,
          requestState: 'PENDING',
          requestedById: userId,
          members: { create: [{ userId }, { userId: other.id }] },
        },
      });
    } catch (err) {
      // Both people started the chat at the same moment: the unique key picked a winner.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        conversation = await prisma.conversation.findUnique({ where: { directKey } });
      } else throw err;
    }
  }
  if (!conversation) throw fail('NOT_FOUND', 'Conversation not found');

  const toOther = conversation.requestedById !== userId;
  const takeover =
    conversation.requestState === 'PENDING' && toOther && !conversation.requestSentAt;
  const reopened = conversation.requestState === 'DECLINED' && toOther;
  if (takeover) {
    // They opened a chat with you but never wrote: you're the one writing first, so the request
    // is yours. (The atomic claim in sendMessage still allows only one message between you.)
    await prisma.conversation.updateMany({
      where: { id: conversation.id, requestState: 'PENDING', requestSentAt: null },
      data: { requestedById: userId },
    });
  } else if (reopened) {
    // You declined their request, and now you're reaching out: they wanted to talk, so it opens.
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { requestState: null, requestRespondedAt: new Date() },
    });
  }
  // Starting a chat you had removed brings it back.
  await prisma.conversationMember.updateMany({
    where: { conversationId: conversation.id, userId, hiddenAt: { not: null } },
    data: { hiddenAt: null },
  });
  // Your other tabs learn about it. The other person only does once there's something to see
  // (the request's message), when a declined request opens up again, or when their empty request
  // just became yours (their tabs drop it until your message arrives).
  notify(reopened || takeover ? [userId, other.id] : [userId], conversation.id);
  return requireView(userId, conversation.id);
}

export async function createGroup(
  userId: string,
  name: unknown,
  usernames: unknown,
): Promise<ConversationView> {
  const groupName = parseInput(groupNameSchema, name, 'name');
  const handles = parseInput(usernamesSchema, usernames, 'usernames').map((u) =>
    u.replace(/^@/, ''),
  );
  const users = (await usersByUsername(handles)).filter((u) => u.id !== userId);
  if (users.length === 0)
    throw fail('BAD_USER_INPUT', 'Pick at least one person other than yourself');
  await refuseBlockers(userId, users);
  spendRequests(userId, users.length);

  // Only the creator is a member. Everyone else is invited and joins if they want to.
  const conversation = await prisma.conversation.create({
    data: {
      type: 'GROUP',
      name: groupName,
      createdById: userId,
      members: { create: [{ userId, role: 'OWNER' }] },
      invites: { create: users.map((u) => ({ userId: u.id, invitedById: userId })) },
    },
  });
  notify([userId], conversation.id);
  notifyInvites(
    users.map((u) => u.id),
    conversation.id,
  );
  return requireView(userId, conversation.id);
}

async function requireGroup(userId: string, conversationId: string) {
  await requireMember(userId, conversationId);
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
  });
  if (conversation.type !== 'GROUP') throw fail('BAD_USER_INPUT', 'That only works in group chats');
  return conversation;
}

export async function addMembers(
  userId: string,
  conversationId: string,
  usernames: unknown,
): Promise<ConversationView> {
  await requireGroup(userId, conversationId);
  const handles = parseInput(usernamesSchema, usernames, 'usernames').map((u) =>
    u.replace(/^@/, ''),
  );
  const users = await usersByUsername(handles);
  const existing = new Set(await memberIds(conversationId));
  const invited = new Map(
    (await prisma.groupInvite.findMany({ where: { conversationId } })).map((i) => [i.userId, i]),
  );
  const fresh = users.filter((u) => !existing.has(u.id));
  if (fresh.length === 0) throw fail('CONFLICT', 'They’re already in this group');
  // A declined invite is final for this group.
  const declined = fresh.find((u) => invited.get(u.id)?.state === 'DECLINED');
  if (declined) throw fail('CONFLICT', `${declined.displayName} declined an invite to this group`);
  const toInvite = fresh.filter((u) => !invited.has(u.id));
  if (toInvite.length === 0) throw fail('CONFLICT', 'They’re already invited');
  await refuseBlockers(userId, toInvite);
  spendRequests(userId, toInvite.length);

  await prisma.groupInvite.createMany({
    data: toInvite.map((u) => ({ conversationId, userId: u.id, invitedById: userId })),
    skipDuplicates: true,
  });
  notify(await memberIds(conversationId), conversationId);
  notifyInvites(
    toInvite.map((u) => u.id),
    conversationId,
  );
  return requireView(userId, conversationId);
}

export async function renameGroup(
  userId: string,
  conversationId: string,
  name: unknown,
): Promise<ConversationView> {
  await requireGroup(userId, conversationId);
  const groupName = parseInput(groupNameSchema, name, 'name');
  await prisma.conversation.update({ where: { id: conversationId }, data: { name: groupName } });
  notify(await memberIds(conversationId), conversationId);
  return requireView(userId, conversationId);
}

export async function leaveGroup(userId: string, conversationId: string): Promise<boolean> {
  await requireGroup(userId, conversationId);
  await prisma.conversationMember.delete({
    where: { conversationId_userId: { conversationId, userId } },
  });
  cancelRequestsFor(conversationId, userId);
  const remaining = await prisma.conversationMember.findMany({
    where: { conversationId },
    orderBy: { joinedAt: 'asc' },
  });
  if (remaining.length === 0) {
    // The invites go with the group; whoever still had one sees it disappear.
    const invitees = await prisma.groupInvite.findMany({
      where: { conversationId, state: 'PENDING' },
      select: { userId: true },
    });
    await prisma.conversation.delete({ where: { id: conversationId } });
    notifyInvites(
      invitees.map((i) => i.userId),
      conversationId,
    );
  } else if (!remaining.some((m) => m.role === 'OWNER')) {
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: remaining[0]!.userId } },
      data: { role: 'OWNER' },
    });
  }
  // The leaver is told too, so their other tabs drop the chat.
  notify([userId, ...remaining.map((m) => m.userId)], conversationId);
  return true;
}

/** The group's owner takes someone out of the group. Their earlier messages stay. */
export async function removeMember(
  userId: string,
  conversationId: string,
  targetId: string,
): Promise<ConversationView> {
  await requireGroup(userId, conversationId);
  const me = await requireMember(userId, conversationId);
  if (me.role !== 'OWNER') throw fail('FORBIDDEN', 'Only the group’s owner can remove people');
  if (targetId === userId) throw fail('BAD_USER_INPUT', 'Leave the group instead');
  const target = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: targetId } },
  });
  if (!target) throw fail('NOT_FOUND', 'They’re not in this group');
  await prisma.conversationMember.delete({
    where: { conversationId_userId: { conversationId, userId: targetId } },
  });
  cancelRequestsFor(conversationId, targetId);
  // They're told too, so the chat leaves their list on every device.
  notify([targetId, ...(await memberIds(conversationId))], conversationId);
  return requireView(userId, conversationId);
}

/** Removes a direct chat from your list. It comes back with the next message, or if you start it again. */
export async function hideConversation(userId: string, conversationId: string): Promise<boolean> {
  await requireMember(userId, conversationId);
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
  });
  if (conversation.type !== 'DIRECT') throw fail('BAD_USER_INPUT', 'Leave the group instead');
  if (conversation.requestState === 'PENDING' && conversation.requestedById !== userId)
    throw fail('BAD_USER_INPUT', 'Decline the request instead');
  const now = new Date();
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { hiddenAt: now, lastReadAt: now },
  });
  notify([userId], conversationId); // your other tabs drop it too
  return true;
}

export async function muteConversation(
  userId: string,
  conversationId: string,
  muted: boolean,
): Promise<ConversationView> {
  await requireMember(userId, conversationId);
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { mutedAt: muted ? new Date() : null },
  });
  notify([userId], conversationId);
  return requireView(userId, conversationId);
}

/** The direct chat between two people, if there is one. */
export async function directBetween(a: string, b: string) {
  return prisma.conversation.findUnique({ where: { directKey: [a, b].sort().join(':') } });
}

export const notifyConversation = notify;

export async function markRead(userId: string, conversationId: string): Promise<ConversationView> {
  await requireMember(userId, conversationId);
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReadAt: new Date() },
  });
  notify([userId], conversationId); // keeps the viewer's other tabs in sync
  return requireView(userId, conversationId);
}
