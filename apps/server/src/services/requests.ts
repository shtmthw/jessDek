import type { Prisma, User } from '@prisma/client';
import { prisma } from '../db.js';
import { fail } from '../errors.js';
import { publishToUsers } from '../pubsub.js';
import {
  memberIds,
  notifyConversation,
  notifyInvites,
  requireView,
  type ConversationView,
} from './conversations.js';
import { announcePresence } from './presence.js';

/**
 * Answering message requests and group invites. Whoever sent one always learns the answer
 * (`RequestAnswered`), and a "no" is final: the request can't be sent again, and the group can't
 * invite them again.
 */

export interface InviteView {
  conversationId: string;
  name: string;
  invitedBy: User;
  members: User[];
  createdAt: Date;
}

function answered(
  to: string | null,
  conversationId: string,
  kind: 'DIRECT' | 'GROUP',
  groupName: string | null,
  user: User,
  accepted: boolean,
) {
  if (!to) return;
  publishToUsers([to], {
    __typename: 'RequestAnswered',
    conversationId,
    kind,
    groupName,
    user,
    accepted,
  });
}

/**
 * The recipient of a message request accepts it (it becomes an ordinary chat) or declines it (it
 * leaves their list, and the sender's chat says so). Returns the chat after accepting, null after
 * declining.
 */
export async function respondToRequest(
  userId: string,
  conversationId: string,
  accept: boolean,
): Promise<ConversationView | null> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, members: { some: { userId } } },
  });
  // A request you can't see yet (nothing sent) is reported the same as no chat at all.
  if (
    !conversation ||
    conversation.requestState !== 'PENDING' ||
    conversation.requestedById === userId ||
    !conversation.requestSentAt
  )
    throw fail('NOT_FOUND', 'There’s no request to answer');

  const now = new Date();
  const changed = await prisma.conversation.updateMany({
    where: { id: conversationId, requestState: 'PENDING' },
    data: accept
      ? { requestState: null, requestRespondedAt: now }
      : { requestState: 'DECLINED', requestRespondedAt: now },
  });
  // Answered on another device a moment ago.
  if (changed.count === 0) throw fail('CONFLICT', 'This request was already answered');
  if (!accept) {
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { hiddenAt: now, lastReadAt: now },
    });
  }

  const sender = conversation.requestedById;
  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  notifyConversation([userId, ...(sender ? [sender] : [])], conversationId);
  if (accept && sender) {
    // Now that it's a chat, each sees the other come and go.
    await Promise.all([
      announcePresence(userId, [sender], false),
      announcePresence(sender, [userId], false),
    ]);
  }
  answered(sender, conversationId, 'DIRECT', null, me, accept);
  return accept ? requireView(userId, conversationId) : null;
}

/** Declines a pending request `from` sent `to` (used when `to` blocks `from`). Quiet: no event to `from`. */
export async function declineRequestsFrom(to: string, from: string): Promise<void> {
  const now = new Date();
  const dm = await prisma.conversation.findUnique({
    where: { directKey: [to, from].sort().join(':') },
  });
  if (dm?.requestState === 'PENDING' && dm.requestedById === from) {
    await prisma.conversation.update({
      where: { id: dm.id },
      data: { requestState: 'DECLINED', requestRespondedAt: now },
    });
    await prisma.conversationMember.updateMany({
      where: { conversationId: dm.id, userId: to },
      data: { hiddenAt: now },
    });
  }
  // Their pending invites to you go too.
  const invites = await prisma.groupInvite.findMany({
    where: { userId: to, invitedById: from, state: 'PENDING' },
  });
  if (invites.length) {
    await prisma.groupInvite.updateMany({
      where: { userId: to, invitedById: from, state: 'PENDING' },
      data: { state: 'DECLINED', respondedAt: now },
    });
    for (const invite of invites) {
      notifyInvites([to], invite.conversationId);
      notifyConversation(await memberIds(invite.conversationId), invite.conversationId);
    }
  }
}

const inviteInclude = {
  invitedBy: true,
  conversation: {
    include: {
      members: { include: { user: true }, orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }] },
    },
  },
} satisfies Prisma.GroupInviteInclude;

type InviteRow = Prisma.GroupInviteGetPayload<{ include: typeof inviteInclude }>;

const toInviteView = (row: InviteRow): InviteView => ({
  conversationId: row.conversationId,
  name: row.conversation.name ?? 'Group',
  invitedBy: row.invitedBy,
  members: row.conversation.members.map((m) => m.user),
  createdAt: row.createdAt,
});

/** Your pending group invites, newest first. */
export async function listInvites(userId: string): Promise<InviteView[]> {
  const rows = await prisma.groupInvite.findMany({
    where: { userId, state: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    include: inviteInclude,
  });
  return rows.map(toInviteView);
}

/** Your pending invite to this group, or null (answered, cancelled, or the group is gone). */
export async function getInvite(
  userId: string,
  conversationId: string,
): Promise<InviteView | null> {
  const row = await prisma.groupInvite.findFirst({
    where: { userId, conversationId, state: 'PENDING' },
    include: inviteInclude,
  });
  return row ? toInviteView(row) : null;
}

/** Join the group (you become a member) or decline (final for this group). */
export async function respondToInvite(
  userId: string,
  conversationId: string,
  accept: boolean,
): Promise<ConversationView | null> {
  const invite = await prisma.groupInvite.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    include: { conversation: { select: { name: true } } },
  });
  if (!invite || invite.state !== 'PENDING') throw fail('NOT_FOUND', 'This invite isn’t open');

  const now = new Date();
  if (accept) {
    await prisma.$transaction(async (tx) => {
      // Only one answer counts, even from two tabs at once.
      const gone = await tx.groupInvite.deleteMany({
        where: { conversationId, userId, state: 'PENDING' },
      });
      if (gone.count === 0) throw fail('CONFLICT', 'This invite was already answered');
      await tx.conversationMember.create({
        data: { conversationId, userId, joinedAt: now, lastReadAt: now },
      });
    });
  } else {
    const changed = await prisma.groupInvite.updateMany({
      where: { conversationId, userId, state: 'PENDING' },
      data: { state: 'DECLINED', respondedAt: now },
    });
    if (changed.count === 0) throw fail('CONFLICT', 'This invite was already answered');
  }

  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const members = await memberIds(conversationId);
  notifyInvites([userId], conversationId);
  notifyConversation(members, conversationId);
  if (accept) {
    const others = members.filter((id) => id !== userId);
    await announcePresence(userId, others, false);
  }
  // The inviter may have left the group since; they still get the answer.
  answered(invite.invitedById, conversationId, 'GROUP', invite.conversation.name, me, accept);
  return accept ? requireView(userId, conversationId) : null;
}

/** The inviter or the group's owner takes back a pending invite. */
export async function cancelInvite(
  userId: string,
  conversationId: string,
  targetId: string,
): Promise<ConversationView> {
  const me = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!me) throw fail('NOT_FOUND', 'Conversation not found');
  const invite = await prisma.groupInvite.findUnique({
    where: { conversationId_userId: { conversationId, userId: targetId } },
  });
  if (!invite || invite.state !== 'PENDING') throw fail('NOT_FOUND', 'They don’t have an invite');
  if (invite.invitedById !== userId && me.role !== 'OWNER')
    throw fail('FORBIDDEN', 'Only whoever invited them, or the group’s owner, can cancel it');
  await prisma.groupInvite.deleteMany({
    where: { conversationId, userId: targetId, state: 'PENDING' },
  });
  notifyInvites([targetId], conversationId);
  notifyConversation(await memberIds(conversationId), conversationId);
  return requireView(userId, conversationId);
}
