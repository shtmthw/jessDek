import type { User } from '@prisma/client';
import * as blocks from './blocks.js';
import { directBetween, notifyConversation } from './conversations.js';
import { announcePresence } from './presence.js';

/**
 * Blocking and unblocking, with everything that has to follow on screen: the other person stops
 * (or starts again) seeing your presence, and your direct chat updates its "can message" state.
 */
async function afterChange(userId: string, targetId: string, hidden: boolean) {
  await Promise.all([
    announcePresence(userId, [targetId], hidden),
    announcePresence(targetId, [userId], hidden),
  ]);
  const dm = await directBetween(userId, targetId);
  if (dm) notifyConversation([userId, targetId], dm.id);
}

export async function blockUser(userId: string, targetId: string): Promise<User> {
  const target = await blocks.block(userId, targetId);
  await afterChange(userId, targetId, true);
  return target;
}

export async function unblockUser(userId: string, targetId: string): Promise<boolean> {
  const target = await blocks.unblock(userId, targetId);
  // Still hidden if they blocked you too.
  if (target) await afterChange(userId, targetId, await blocks.blockedBetween(userId, targetId));
  return true;
}
