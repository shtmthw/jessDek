import type { User } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { fail } from '../errors.js';
import { RateLimiter } from '../rateLimit.js';
import { hasBlocked } from './blocks.js';

/**
 * User cards (CARDS_PLAN.md §2). The server never draws a card, so it only checks the recipe's
 * shape and size, normalizes the free text, and stores the re-serialized object.
 */

const CARD_MAX = 4096;
const ABOUT_MAX = 150;
const ABOUT_LINES = 4;
const INTERESTS_MAX = 6;
const CUSTOM_MAX = 18;
const STICKERS_MAX = 8;
const BAD_CARD = 'That card can’t be saved';

const ONE_EMOJI = new RegExp('^\\p{RGI_Emoji}$', 'v');
const SLUG = /^[a-z0-9-]{1,24}$/;
const KEY = /^[a-zA-Z]{1,16}$/;

const codePoints = (s: string) => [...s].length;
const isControl = (ch: string, keepNewline: boolean) => {
  const c = ch.charCodeAt(0);
  return (c < 32 || c === 127) && !(keepNewline && c === 10);
};
const dropControls = (s: string, keepNewline: boolean) =>
  [...s].filter((ch) => !isControl(ch, keepNewline)).join('');

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

const bad = (message = BAD_CARD) => fail('BAD_USER_INPUT', message, { field: 'card' });

const emoji = z.string().refine((s) => ONE_EMOJI.test(s));

const interestSchema = z.union([
  z.string().regex(SLUG),
  z
    .object({ t: z.string(), e: emoji.optional() })
    .strict()
    .transform((o, ctx) => {
      const t = o.t.trim();
      const n = codePoints(t);
      if (n < 1 || n > CUSTOM_MAX || [...t].some((ch) => isControl(ch, false))) {
        ctx.addIssue({ code: z.ZodIssueCode.custom });
        return z.NEVER;
      }
      return o.e ? { t, e: o.e } : { t };
    }),
]);

const stickerSchema = z
  .object({
    k: z.string().regex(SLUG).optional(),
    e: emoji.optional(),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    s: z.number().min(0.4).max(2.5),
    r: z.number().min(-180).max(180),
    c: z.string().regex(SLUG).optional(),
  })
  .strict()
  .refine((s) => (s.k === undefined) !== (s.e === undefined))
  .transform((s) => ({
    ...(s.k !== undefined ? { k: s.k } : { e: s.e! }),
    x: round(s.x, 3),
    y: round(s.y, 3),
    s: round(s.s, 2),
    r: Math.round(s.r),
    ...(s.c !== undefined ? { c: s.c } : {}),
  }));

/** Normalizes the about text: LF only, no control characters, no trailing spaces. */
export function cleanAbout(text: string): string {
  return dropControls(text.replace(/\r\n?/g, '\n'), true)
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

/** Parses, checks and re-serializes a card recipe. `null`/`undefined` pass through as null. */
export function parseCardRecipe(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string' || raw.length > CARD_MAX * 4) throw bad();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw bad();
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw bad();
  const src = parsed as Record<string, unknown>;
  const keys = Object.keys(src);
  if (keys.length > 40 || !keys.every((k) => KEY.test(k))) throw bad();

  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = src[key];
    if (key === 'v') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 999)
        throw bad();
      out.v = value;
    } else if (key === 'about') {
      if (typeof value !== 'string') throw bad();
      const about = cleanAbout(value);
      if (codePoints(about) > ABOUT_MAX || about.split('\n').length > ABOUT_LINES) {
        throw bad('About me is too long');
      }
      out.about = about;
    } else if (key === 'interests') {
      const r = z.array(interestSchema).max(INTERESTS_MAX).safeParse(value);
      if (!r.success) throw bad();
      const seen = new Set<string>();
      out.interests = r.data.filter((it) => {
        const k = typeof it === 'string' ? `id:${it}` : `t:${it.t.toLowerCase()}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    } else if (key === 'stickers') {
      const r = z.array(stickerSchema).max(STICKERS_MAX).safeParse(value);
      if (!r.success) throw bad();
      out.stickers = r.data;
    } else if (typeof value === 'boolean' || (typeof value === 'string' && SLUG.test(value))) {
      out[key] = value;
    } else {
      throw bad();
    }
  }
  const stored = JSON.stringify(out);
  if (stored.length > CARD_MAX) throw bad();
  return stored;
}

/**
 * The keys the deck matches on (CARD_DECK_PLAN.md §2.1), from a stored recipe: `id:<built-in id>`,
 * or `t:<custom text, lower-cased>`. Two people match when they share a key.
 */
export function interestKeysOf(stored: string | null): string[] {
  if (!stored) return [];
  let interests: unknown;
  try {
    interests = (JSON.parse(stored) as { interests?: unknown }).interests;
  } catch {
    return [];
  }
  if (!Array.isArray(interests)) return [];
  const keys = new Set<string>();
  for (const it of interests) {
    if (typeof it === 'string') keys.add(`id:${it}`);
    else if (it && typeof (it as { t?: unknown }).t === 'string')
      keys.add(`t:${(it as { t: string }).t.toLowerCase()}`);
  }
  return [...keys];
}

// Every save is a write; 30 a minute per user is plenty for a person clicking Save.
export const cardLimiter = new RateLimiter(30, 60 * 1000);

export interface CardView {
  id: string;
  user: User;
  recipe: string | null;
  shared: boolean | null;
}

export const cardView = (user: User, viewerId: string | null): CardView => ({
  id: user.id,
  user,
  recipe: user.card,
  shared: viewerId === user.id ? user.cardShared : null,
});

/**
 * Someone's card. Signed out: only shared cards. Signed in: anyone's, except when the owner
 * blocked you. Unknown people and hidden cards look the same (null).
 */
export async function getCard(viewerId: string | null, username: string): Promise<CardView | null> {
  const name = String(username ?? '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
  if (!/^[a-z0-9_]{3,20}$/.test(name)) return null;
  const user = await prisma.user.findUnique({ where: { username: name } });
  if (!user) return null;
  if (!viewerId && !user.cardShared) return null;
  if (viewerId && viewerId !== user.id && (await hasBlocked(user.id, viewerId))) return null;
  return cardView(user, viewerId);
}

export async function updateCard(userId: string, input: unknown): Promise<CardView> {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const data: { card?: string | null; cardShared?: boolean; interestKeys?: string[] } = {};
  if ('recipe' in src) {
    data.card = parseCardRecipe(src.recipe);
    data.interestKeys = interestKeysOf(data.card);
  }
  if ('shared' in src && src.shared !== null && src.shared !== undefined) {
    if (typeof src.shared !== 'boolean')
      throw fail('BAD_USER_INPUT', 'Invalid value', { field: 'shared' });
    data.cardShared = src.shared;
  }
  if (!cardLimiter.allow(userId)) {
    throw fail('RATE_LIMITED', 'You’re saving your card very quickly. Try again in a minute.');
  }
  cardLimiter.hit(userId);
  const user = await prisma.user.update({ where: { id: userId }, data });
  return cardView(user, userId);
}
