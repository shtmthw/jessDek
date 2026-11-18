import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { fail, parseInput } from '../errors.js';
import { publishToUsers } from '../pubsub.js';
import { RateLimiter } from '../rateLimit.js';
import { messageInclude, type MessageWithSender } from '../types.js';
import { blockedBetween, withoutBlocked } from './blocks.js';
import { memberIds, notifyConversation, requireMember } from './conversations.js';

const captionSchema = z
  .string({ required_error: 'Write a message first' })
  .transform((s) => s.trim())
  .pipe(z.string().max(4000, 'Messages can be up to 4000 characters'));

const SHA256 = /^[0-9a-f]{64}$/;
const THUMBHASH = /^[A-Za-z0-9+/]{1,64}={0,2}$/;
const dim = z.number().int().min(1).max(16384);
const fileName = (fallback: string) =>
  z.string().transform(
    (s) =>
      s
        .normalize('NFC')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f/\\]/g, '')
        .trim()
        .slice(0, 120) || fallback,
  );
const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);

const imageSchema = z.object({
  kind: z.literal('IMAGE'),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']),
  name: fileName('photo'),
  size: z
    .number()
    .int()
    .min(1)
    .max(config.media.maxImageBytes, `Photos can be up to ${mb(config.media.maxImageBytes)} MB`),
  width: dim,
  height: dim,
  sha256: z.string().regex(SHA256, 'Invalid file hash'),
  thumbhash: z.string().regex(THUMBHASH).nullish(),
});
const videoSchema = z.object({
  kind: z.literal('VIDEO'),
  mimeType: z.enum(['video/mp4', 'video/webm', 'video/quicktime']),
  name: fileName('video'),
  size: z
    .number()
    .int()
    .min(1)
    .max(config.media.maxVideoBytes, `Videos can be up to ${mb(config.media.maxVideoBytes)} MB`),
  width: dim,
  height: dim,
  durationMs: z
    .number()
    .int()
    .min(0)
    .max(3 * 60 * 60 * 1000),
  sha256: z.string().regex(SHA256, 'Invalid file hash'),
  thumbhash: z.string().regex(THUMBHASH).nullish(),
  posterSha256: z.string().regex(SHA256, 'Invalid poster hash'),
  posterSize: z.number().int().min(1).max(config.media.maxPosterBytes),
  posterMime: z.enum(['image/jpeg', 'image/webp']),
});
const attachmentsSchema = z
  .array(z.discriminatedUnion('kind', [imageSchema, videoSchema]))
  .max(config.media.maxAttachments, `You can send up to ${config.media.maxAttachments} at a time`);

type AttachmentInput = z.infer<typeof attachmentsSchema>[number];

const toRow = (a: AttachmentInput, position: number) => ({
  position,
  kind: a.kind,
  mimeType: a.mimeType,
  name: a.name,
  size: a.size,
  width: a.width,
  height: a.height,
  sha256: a.sha256,
  thumbhash: a.thumbhash ?? null,
  durationMs: a.kind === 'VIDEO' ? a.durationMs : null,
  posterSha256: a.kind === 'VIDEO' ? a.posterSha256 : null,
  posterSize: a.kind === 'VIDEO' ? a.posterSize : null,
  posterMime: a.kind === 'VIDEO' ? a.posterMime : null,
});

// 30 messages per 10 seconds per user; typing pings are cheaper but still bounded.
export const sendLimiter = new RateLimiter(30, 10_000);
export const typingLimiter = new RateLimiter(20, 10_000);

export interface MessagePage {
  messages: MessageWithSender[];
  hasMore: boolean;
}

export async function listMessages(
  userId: string,
  conversationId: string,
  before: string | null | undefined,
  limit: number | null | undefined,
): Promise<MessagePage> {
  await requireMember(userId, conversationId);
  const take = Math.min(Math.max(limit ?? 30, 1), 100);

  let cursorWhere = {};
  if (before) {
    const anchor = await prisma.message.findFirst({ where: { id: before, conversationId } });
    if (!anchor) throw fail('BAD_USER_INPUT', 'Unknown cursor');
    cursorWhere = {
      OR: [
        { createdAt: { lt: anchor.createdAt } },
        { createdAt: anchor.createdAt, id: { lt: anchor.id } },
      ],
    };
  }

  const rows = await prisma.message.findMany({
    where: { conversationId, ...cursorWhere },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    include: messageInclude,
  });
  const hasMore = rows.length > take;
  // Newest page first from the DB, returned oldest → newest for rendering.
  return { messages: rows.slice(0, take).reverse(), hasMore };
}

export async function sendMessage(
  userId: string,
  conversationId: string,
  body: unknown,
  attachments?: unknown,
): Promise<MessageWithSender> {
  const text = parseInput(captionSchema, body);
  const list = parseInput(attachmentsSchema, attachments ?? [], 'attachments');
  if (!text && list.length === 0) throw fail('BAD_USER_INPUT', 'Write a message first');
  if (list.length && !config.media.enabled)
    throw fail('FORBIDDEN', 'Photos and videos are turned off on this server');
  await requireMember(userId, conversationId);
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: { type: true, members: { select: { userId: true, hiddenAt: true } } },
  });
  if (conversation.type === 'DIRECT') {
    const other = conversation.members.find((m) => m.userId !== userId);
    if (!other || (await blockedBetween(userId, other.userId)))
      throw fail('FORBIDDEN', 'You can’t message this person');
  }
  if (!sendLimiter.allow(userId)) throw fail('RATE_LIMITED', 'You’re sending messages too fast');
  sendLimiter.hit(userId);

  const now = new Date();
  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        body: text,
        createdAt: now,
        attachments: { create: list.map(toRow) },
      },
      include: messageInclude,
    }),
    prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } }),
    prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: now },
    }),
    // Something new: anyone who had removed this chat from their list gets it back.
    prisma.conversationMember.updateMany({
      where: { conversationId, hiddenAt: { not: null } },
      data: { hiddenAt: null },
    }),
  ]);
  const unhidden = conversation.members.filter((m) => m.hiddenAt).map((m) => m.userId);
  if (unhidden.length) notifyConversation(unhidden, conversationId);

  publishToUsers(await memberIds(conversationId), {
    __typename: 'MessageAdded',
    conversationId,
    message,
  });
  return message;
}

export async function setTyping(userId: string, conversationId: string): Promise<boolean> {
  await requireMember(userId, conversationId);
  if (!typingLimiter.allow(userId)) return false;
  typingLimiter.hit(userId);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  // Typing never crosses a block, in either direction.
  const others = await withoutBlocked(
    userId,
    (await memberIds(conversationId)).filter((id) => id !== userId),
  );
  publishToUsers(others, { __typename: 'TypingStarted', conversationId, user });
  return true;
}
