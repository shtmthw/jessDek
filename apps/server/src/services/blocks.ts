import type { User } from '@prisma/client';
import { prisma } from '../db.js';
import { fail } from '../errors.js';

/**
 * Who has blocked whom. Kept in memory per user once loaded (like presence, this assumes a single
 * server instance) because presence and typing ask about it on every event.
 */
interface Relations {
  /** People this user blocked. */
  blocked: Set<string>;
  /** People who blocked this user. */
  blockedBy: Set<string>;
}

const cache = new Map<string, Promise<Relations>>();

function relations(userId: string): Promise<Relations> {
  let hit = cache.get(userId);
  if (!hit) {
    hit = prisma.block
      .findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
      })
      .then((rows) => ({
        blocked: new Set(rows.filter((r) => r.blockerId === userId).map((r) => r.blockedId)),
        blockedBy: new Set(rows.filter((r) => r.blockedId === userId).map((r) => r.blockerId)),
      }));
    hit.catch(() => cache.delete(userId));
    cache.set(userId, hit);
  }
  return hit;
}

const forget = (...userIds: string[]) => userIds.forEach((id) => cache.delete(id));

/** Did `blocker` block `blocked`? */
export async function hasBlocked(blocker: string, blocked: string): Promise<boolean> {
  return (await relations(blocker)).blocked.has(blocked);
}

/** Is there a block between the two, either way? */
export async function blockedBetween(a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const r = await relations(a);
  return r.blocked.has(b) || r.blockedBy.has(b);
}

/** Everyone in a block relation with this user, either way. */
export async function blockedPeople(userId: string): Promise<Set<string>> {
  const r = await relations(userId);
  return new Set([...r.blocked, ...r.blockedBy]);
}

/** Drops the users who are in a block relation with `userId`. */
export async function withoutBlocked(userId: string, userIds: Iterable<string>): Promise<string[]> {
  const blocked = await blockedPeople(userId);
  return [...userIds].filter((id) => !blocked.has(id));
}

export async function block(userId: string, targetId: string): Promise<User> {
  if (targetId === userId) throw fail('BAD_USER_INPUT', 'You can’t block yourself');
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) throw fail('NOT_FOUND', 'No one by that name');
  await prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId: userId, blockedId: targetId } },
    create: { blockerId: userId, blockedId: targetId },
    update: {},
  });
  forget(userId, targetId);
  return target;
}

export async function unblock(userId: string, targetId: string): Promise<User | null> {
  await prisma.block.deleteMany({ where: { blockerId: userId, blockedId: targetId } });
  forget(userId, targetId);
  return prisma.user.findUnique({ where: { id: targetId } });
}

export async function listBlocked(userId: string): Promise<User[]> {
  const rows = await prisma.block.findMany({
    where: { blockerId: userId },
    orderBy: { createdAt: 'desc' },
    include: { blocked: true },
  });
  return rows.map((r) => r.blocked);
}

/** Tests only. */
export function clearBlockCache(): void {
  cache.clear();
}
