import { hash, verify } from '@node-rs/argon2';
import { SignJWT, jwtVerify } from 'jose';
import { config } from './config.js';
import { prisma } from './db.js';

export const SESSION_COOKIE = 'rt_session';
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 7;

const secret = new TextEncoder().encode(config.jwtSecret);

export const hashPassword = (password: string) => hash(password);

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Verified against when the account does not exist, so response time doesn't reveal which
// identifiers are registered.
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('not-a-real-password');
  await verifyPassword(await dummyHash, password);
}

export const signSession = (userId: string) =>
  new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_S}s`)
    .sign(secret);

/** Returns the user id for a valid, unexpired token; anything else behaves like "no token". */
export async function readSession(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* ignore malformed cookie */
    }
  }
  return out;
}

/**
 * The signed-in user for a request, or null. A validly signed token whose user no longer exists
 * (for example after the database was reset) counts as signed out, so clients fall back to the
 * sign-in screen instead of half-working with a ghost session.
 */
export async function sessionFromCookieHeader(header: string | undefined): Promise<string | null> {
  const userId = await readSession(parseCookies(header)[SESSION_COOKIE]);
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  return user ? userId : null;
}
