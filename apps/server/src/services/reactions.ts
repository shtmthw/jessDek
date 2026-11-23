import { prisma } from '../db.js';
import { fail } from '../errors.js';
import { publishToUsers } from '../pubsub.js';
import { RateLimiter } from '../rateLimit.js';
import { messageInclude, type MessageWithSender } from '../types.js';
import { blockedBetween } from './blocks.js';
import { memberIds, requireMember } from './conversations.js';

// Built at runtime: the TS target (ES2023) rejects a `/…/v` literal, Node 22+ runs it fine.
const ONE_EMOJI = new RegExp('^\\p{RGI_Emoji}$', 'v');
const EMOJI_MAX = 64;

// 40 reaction changes per 10 seconds per user.
export const reactLimiter = new RateLimiter(40, 10_000);

/** One fully-qualified RGI emoji (a bare text heart without U+FE0F doesn't count). */
export const isEmoji = (s: string) => s.length <= EMOJI_MAX && ONE_EMOJI.test(s);

/**
 * Sets (or with `emoji: null`, removes) the caller's one reaction to a message. Reactions are quiet:
 * they never touch unread counts, the chat order or hidden chats.
 */
export async function react(
  userId: string,
  messageId: string,
  emoji: string | null | undefined,
): Promise<MessageWithSender> {
  const value = emoji ?? null;
  if (value !== null && !isEmoji(value)) throw fail('BAD_USER_INPUT', 'Pick an emoji');

  const target = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      conversationId: true,
      senderId: true,
      conversation: {
        select: { type: true, requestState: true, members: { select: { userId: true } } },
      },
    },
  });
  if (!target) throw fail('NOT_FOUND', 'Message not found');
  const { conversationId } = target;
  // Never reveal that a message exists in a chat you're not in.
  try {
    await requireMember(userId, conversationId);
  } catch {
    throw fail('NOT_FOUND', 'Message not found');
  }
  if (target.conversation.requestState)
    throw fail('FORBIDDEN', 'Reactions can wait until the request is accepted');
  if (target.conversation.type === 'DIRECT') {
    const other = target.conversation.members.find((m) => m.userId !== userId);
    if (!other || (await blockedBetween(userId, other.userId)))
      throw fail('FORBIDDEN', 'You can’t message this person');
  }
  if (!reactLimiter.allow(userId)) throw fail('RATE_LIMITED', 'You’re reacting too fast');
  reactLimiter.hit(userId);

  const key = { messageId_userId: { messageId, userId } };
  const current = await prisma.reaction.findUnique({ where: key });
  let changed = false;
  if (value === null) {
    if (current) {
      await prisma.reaction.deleteMany({ where: { messageId, userId } });
      changed = true;
    }
  } else if (current?.emoji !== value) {
    await prisma.reaction.upsert({
      where: key,
      create: { messageId, userId, emoji: value },
      update: { emoji: value },
    });
    changed = true;
  }

  const message = await prisma.message.findUniqueOrThrow({
    where: { id: messageId },
    include: messageInclude,
  });
  if (changed) {
    publishToUsers(await memberIds(conversationId), {
      __typename: 'ReactionChanged',
      conversationId,
      message,
    });
    // Only the reactor's and the author's chat-list line can mention it.
    publishToUsers([userId, target.senderId], {
      __typename: 'ConversationUpdated',
      conversationId,
    });
  }
  return message;
}
