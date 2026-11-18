import { fail } from './errors.js';

/** Mutated by resolvers; the HTTP layer turns it into Set-Cookie headers. */
export interface SessionChange {
  /** string = set this token, null = clear the cookie, undefined = leave as is. */
  token?: string | null;
}

export interface Context {
  userId: string | null;
  ip: string;
  session: SessionChange;
  /** The browser tab's peer id, only on a graphql-ws connection that sent a valid one. */
  peerId: string | null;
}

export function requireUser(ctx: Context): string {
  if (!ctx.userId) throw fail('UNAUTHENTICATED', 'Please sign in to continue');
  return ctx.userId;
}

export function requirePeer(ctx: Context): string {
  if (!ctx.peerId)
    throw fail(
      'BAD_USER_INPUT',
      'Photos and videos need a live connection. Reconnect and try again.',
    );
  return ctx.peerId;
}
