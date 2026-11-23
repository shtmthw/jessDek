import type { User } from '@prisma/client';
import { prisma } from '../db.js';
import { publishToUsers } from '../pubsub.js';
import { withoutBlocked } from './blocks.js';

// Online state is tracked per process by counting open subscription sockets per user.
// (A multi-instance deployment would need a shared store such as Redis.)
const connections = new Map<string, number>();

export const isOnline = (userId: string) => (connections.get(userId) ?? 0) > 0;

/**
 * Everyone who shares at least one conversation with `userId`. A message request doesn't count:
 * strangers never see each other come and go, or each other's profile changes, until it's accepted.
 */
export async function peersOf(userId: string): Promise<string[]> {
  const rows = await prisma.conversationMember.findMany({
    where: {
      userId: { not: userId },
      conversation: { requestState: null, members: { some: { userId } } },
    },
    select: { userId: true },
    distinct: ['userId'],
  });
  return rows.map((r) => r.userId);
}

async function broadcast(userId: string, online: boolean, lastSeenAt: Date) {
  // People in a block relation with this user never learn when they come and go.
  const peers = await withoutBlocked(userId, await peersOf(userId));
  publishToUsers(peers, { __typename: 'PresenceChanged', userId, online, lastSeenAt });
}

export async function userConnected(userId: string): Promise<void> {
  const n = connections.get(userId) ?? 0;
  connections.set(userId, n + 1);
  if (n === 0) await broadcast(userId, true, new Date());
}

export async function userDisconnected(userId: string): Promise<void> {
  const n = connections.get(userId) ?? 0;
  if (n > 1) {
    connections.set(userId, n - 1);
    return;
  }
  connections.delete(userId);
  const lastSeenAt = new Date();
  await prisma.user.update({ where: { id: userId }, data: { lastSeenAt } }).catch(() => undefined);
  await broadcast(userId, false, lastSeenAt);
}

/** Tells `viewers` where `userId` stands now: hidden (blocked) or their real state. */
export async function announcePresence(userId: string, viewers: string[], hidden: boolean) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastSeenAt: true },
  });
  if (!user) return;
  publishToUsers(viewers, {
    __typename: 'PresenceChanged',
    userId,
    online: hidden ? false : isOnline(userId),
    lastSeenAt: hidden ? null : user.lastSeenAt,
  });
}

/** Tells the user's other tabs, and everyone who shares a chat with them, about a new name or avatar. */
export async function announceUser(user: User): Promise<void> {
  publishToUsers([user.id, ...(await peersOf(user.id))], { __typename: 'UserUpdated', user });
}
