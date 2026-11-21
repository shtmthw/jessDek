import { Prisma, type User } from '@prisma/client';
import { z } from 'zod';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../auth.js';
import { prisma } from '../db.js';
import { fail, parseInput } from '../errors.js';
import { RateLimiter } from '../rateLimit.js';

const usernameSchema = z
  .string({ required_error: 'Choose a username' })
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, 'Username must be 3–20 letters, numbers or underscores');

const signUpSchema = z.object({
  username: usernameSchema,
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long'),
  displayName: z
    .string()
    .trim()
    .min(1, 'Display name can’t be empty')
    .max(40, 'Display name is too long')
    .optional(),
});

const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Display name can’t be empty')
    .max(40, 'Display name is too long'),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a valid color'),
});

const avatarColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a valid color');

/** The server never draws avatars, so it only checks the recipe's shape (AVATAR_PLAN.md §2). */
const recipeSchema = z
  .record(
    z.string().regex(/^[a-zA-Z]{1,16}$/),
    z.union([z.string().regex(/^[a-z0-9-]{1,24}$/), z.number().int().min(0).max(999)]),
  )
  .refine((r) => Object.keys(r).length <= 32);

const AVATAR_MAX = 1024;
const BAD_AVATAR = 'That avatar can’t be saved';

/** Parses and re-serializes a recipe, so only a flat, small object is ever stored. */
function parseAvatar(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string' || raw.length > AVATAR_MAX * 2) {
    throw fail('BAD_USER_INPUT', BAD_AVATAR, { field: 'avatar' });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw fail('BAD_USER_INPUT', BAD_AVATAR, { field: 'avatar' });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw fail('BAD_USER_INPUT', BAD_AVATAR, { field: 'avatar' });
  }
  const result = recipeSchema.safeParse(parsed);
  if (!result.success) throw fail('BAD_USER_INPUT', BAD_AVATAR, { field: 'avatar' });
  const stored = JSON.stringify(result.data);
  if (stored.length > AVATAR_MAX) throw fail('BAD_USER_INPUT', BAD_AVATAR, { field: 'avatar' });
  return stored;
}

// Every avatar save fans out an event to everyone you share a chat with: 30 a minute per user.
export const avatarLimiter = new RateLimiter(30, 60 * 1000);

export const AVATAR_COLORS = [
  '#6366f1',
  '#0ea5e9',
  '#14b8a6',
  '#22c55e',
  '#eab308',
  '#f97316',
  '#ec4899',
  '#a855f7',
];

const colorFor = (username: string) => {
  let h = 0;
  for (const ch of username) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
};

// 10 failed sign-ins per identifier+IP per 15 minutes.
export const signInLimiter = new RateLimiter(10, 15 * 60 * 1000);

export async function signUp(input: unknown): Promise<User> {
  const data = parseInput(signUpSchema, input);
  try {
    return await prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        displayName: data.displayName ?? data.username,
        passwordHash: await hashPassword(data.password),
        avatarColor: colorFor(data.username),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = String(err.meta?.target ?? '');
      if (target.includes('email')) {
        throw fail('CONFLICT', 'An account with that email already exists', { field: 'email' });
      }
      throw fail('CONFLICT', 'That username is taken', { field: 'username' });
    }
    throw err;
  }
}

export async function signIn(
  input: { identifier: string; password: string },
  ip: string,
): Promise<User> {
  const identifier = String(input.identifier ?? '')
    .trim()
    .toLowerCase();
  const password = String(input.password ?? '');
  if (!identifier || !password)
    throw fail('BAD_USER_INPUT', 'Enter your username or email and password');

  const key = `${ip}|${identifier}`;
  if (!signInLimiter.allow(key)) {
    throw fail('RATE_LIMITED', 'Too many attempts. Try again in a few minutes.');
  }

  const user = await prisma.user.findFirst({
    where: { OR: [{ username: identifier }, { email: identifier }] },
  });
  const ok = user
    ? await verifyPassword(user.passwordHash, password)
    : (await burnPasswordCheck(password), false);
  if (!user || !ok) {
    signInLimiter.hit(key);
    throw fail('UNAUTHENTICATED', 'Incorrect username/email or password');
  }
  signInLimiter.reset(key);
  return user;
}

export const getUser = (id: string) => prisma.user.findUnique({ where: { id } });

export async function searchUsers(viewerId: string, query: string): Promise<User[]> {
  const q = query.trim().toLowerCase().replace(/^@/, '');
  if (q.length < 2) return [];
  return prisma.user.findMany({
    where: {
      id: { not: viewerId },
      OR: [
        { username: { startsWith: q } },
        { displayName: { startsWith: q, mode: 'insensitive' } },
      ],
    },
    orderBy: { username: 'asc' },
    take: 10,
  });
}

export async function updateProfile(userId: string, input: unknown): Promise<User> {
  const data = parseInput(profileSchema, input);
  return prisma.user.update({ where: { id: userId }, data });
}

/** The one-time welcome has been seen. Only the first time counts. */
export async function dismissWelcome(userId: string): Promise<User> {
  await prisma.user.updateMany({
    where: { id: userId, welcomedAt: null },
    data: { welcomedAt: new Date() },
  });
  return prisma.user.findUniqueOrThrow({ where: { id: userId } });
}

export async function updateAvatar(userId: string, input: unknown): Promise<User> {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const avatarColor = parseInput(avatarColorSchema, src.avatarColor, 'avatarColor');
  // Left out: keep the current avatar (a colour-only change). Null: back to the default character.
  const avatar = 'avatar' in src ? parseAvatar(src.avatar) : undefined;
  if (!avatarLimiter.allow(userId)) {
    throw fail('RATE_LIMITED', 'You’re changing your avatar very quickly. Try again in a minute.');
  }
  avatarLimiter.hit(userId);
  return prisma.user.update({
    where: { id: userId },
    data: avatar === undefined ? { avatarColor } : { avatarColor, avatar },
  });
}
