import { prisma } from '../db.js';
import { fail } from '../errors.js';
import { RateLimiter } from '../rateLimit.js';
import {
  getConversation,
  memberIds,
  notifyConversation,
  requireMember,
  type ConversationView,
} from './conversations.js';
import { blockedBetween } from './blocks.js';

/**
 * Chat themes and group member colours (THEMES_PLAN.md). The server never draws a theme: it checks
 * the recipe's shape and size, stores it re-serialized, and tells every member.
 */

const THEME_MAX = 512;
const KEYS_MAX = 12;
const SLUG = /^[a-z0-9-]{1,24}$/;
const KEY = /^[a-zA-Z]{1,16}$/;

const bad = (message = 'That theme can’t be used', field = 'theme') =>
  fail('BAD_USER_INPUT', message, { field });

/** Parses, checks and re-serializes a theme recipe. `null`/`undefined` (Classic) pass through as null. */
export function parseThemeRecipe(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string' || raw.length > THEME_MAX * 4) throw bad();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw bad();
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw bad();
  const src = parsed as Record<string, unknown>;
  const keys = Object.keys(src);
  if (keys.length > KEYS_MAX || !keys.every((k) => KEY.test(k))) throw bad();
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = src[key];
    if (key === 'v') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 999)
        throw bad();
      out.v = value;
    } else if (typeof value === 'string' && SLUG.test(value)) {
      out[key] = value;
    } else {
      throw bad();
    }
  }
  if (typeof out.preset !== 'string') throw bad();
  const stored = JSON.stringify(out);
  if (stored.length > THEME_MAX) throw bad();
  return stored;
}

/** A member colour slug, or null for automatic. */
export function parseMemberColor(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string' || !SLUG.test(raw)) throw bad('That colour can’t be used', 'color');
  return raw;
}

// A person tapping through themes saves once per pick at most; 30 a minute is plenty.
export const themeLimiter = new RateLimiter(30, 60 * 1000);

function limit(userId: string) {
  if (!themeLimiter.allow(userId)) {
    throw fail('RATE_LIMITED', 'You’re changing the theme very quickly. Try again in a minute.');
  }
  themeLimiter.hit(userId);
}

async function requireView(userId: string, conversationId: string): Promise<ConversationView> {
  const view = await getConversation(userId, conversationId);
  if (!view) throw fail('NOT_FOUND', 'Conversation not found');
  return view;
}

/**
 * Sets the chat's theme for everyone in it (null goes back to Classic) and remembers who changed it.
 * Not in a direct chat with a block either way. Setting the theme it already has changes nothing.
 */
export async function setChatTheme(
  userId: string,
  conversationId: string,
  raw: unknown,
): Promise<ConversationView> {
  await requireMember(userId, conversationId);
  const theme = parseThemeRecipe(raw);
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { members: { select: { userId: true } } },
  });
  if (conversation.type === 'DIRECT') {
    const other = conversation.members.find((m) => m.userId !== userId)?.userId;
    if (!other || (await blockedBetween(userId, other)))
      throw fail('FORBIDDEN', 'You can’t change the theme of this conversation');
  }
  if (conversation.theme === theme) return requireView(userId, conversationId);
  limit(userId);
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { theme, themeSetById: userId, themeSetAt: new Date() },
  });
  notifyConversation(await memberIds(conversationId), conversationId);
  return requireView(userId, conversationId);
}

/** Your own colour in a group (null: automatic). Everyone in the group sees it. */
export async function setMemberColor(
  userId: string,
  conversationId: string,
  raw: unknown,
): Promise<ConversationView> {
  const member = await requireMember(userId, conversationId);
  const color = parseMemberColor(raw);
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
  });
  if (conversation.type !== 'GROUP') throw bad('Colours are for group chats', 'color');
  if (member.color === color) return requireView(userId, conversationId);
  limit(userId);
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { color },
  });
  notifyConversation(await memberIds(conversationId), conversationId);
  return requireView(userId, conversationId);
}
