import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';
import { requireUser, requirePeer, type Context } from '../context.js';
import { prisma } from '../db.js';
import { fail, parseInput } from '../errors.js';
import { publishToPeer } from '../pubsub.js';
import { RateLimiter } from '../rateLimit.js';
import { closeAllRelays, createRelay, relayCountFor } from '../relay.js';
import { memberIds, requireMember } from './conversations.js';
import { blockedPeople } from './blocks.js';
import { getPeer, peersOfUsers, PEER_ID } from './peers.js';

type Part = 'FILE' | 'POSTER';
type SignalType = 'HAVE' | 'OFFER' | 'ANSWER' | 'ICE' | 'BYE';

interface PendingRequest {
  id: string;
  attachmentId: string;
  conversationId: string;
  part: Part;
  sha256: string;
  size: number;
  requesterUserId: string;
  requesterPeerId: string;
  /** peerId → userId of the online devices that were asked. */
  candidates: Map<string, string>;
  expiresAt: number;
}

export const REQUEST_TTL_MS = 120_000;
export const MAX_SIGNAL_BYTES = 16 * 1024;

const requests = new Map<string, PendingRequest>();

// 60 requests per 10 s per user; 300 signals per 10 s per peer.
export const requestLimiter = new RateLimiter(60, 10_000);
export const signalLimiter = new RateLimiter(300, 10_000);
// 10 relays per 10 s per user, and at most 4 at once.
export const relayLimiter = new RateLimiter(10, 10_000);
const MAX_CONCURRENT_RELAYS = 4;
const RELAY_KEY = /^[A-Za-z0-9_-]{43}$/;

function sweep() {
  const now = Date.now();
  for (const [id, r] of requests) if (r.expiresAt <= now) requests.delete(id);
}
setInterval(sweep, 30_000).unref();

/**
 * Asks the online devices of the chat's members who has an attachment. The server never sees the
 * bytes; it only fans the question out and later passes WebRTC signals between the two devices.
 */
export async function requestMedia(
  ctx: Context,
  attachmentId: string,
  part: Part,
): Promise<{ requestId: string; candidates: number }> {
  const userId = requireUser(ctx);
  const requesterPeerId = requirePeer(ctx);
  if (!config.media.enabled)
    throw fail('FORBIDDEN', 'Photos and videos are turned off on this server');
  if (!requestLimiter.allow(userId))
    throw fail('RATE_LIMITED', 'Too many requests. Try again in a moment');
  requestLimiter.hit(userId);

  const attachment = await prisma.attachment.findUnique({
    where: { id: String(attachmentId) },
    include: { message: { select: { conversationId: true } } },
  });
  // A missing attachment and a non-member look identical, so ids can't be probed.
  if (!attachment) throw fail('NOT_FOUND', 'Conversation not found');
  const conversationId = attachment.message.conversationId;
  await requireMember(userId, conversationId);

  let sha256 = attachment.sha256;
  let size = attachment.size;
  if (part === 'POSTER') {
    if (!attachment.posterSha256 || !attachment.posterSize)
      throw fail('BAD_USER_INPUT', 'This attachment has no poster', { field: 'part' });
    sha256 = attachment.posterSha256;
    size = attachment.posterSize;
  }

  // Never between two people with a block between them: a direct transfer shows each their IP.
  const blocked = await blockedPeople(userId);
  const candidates = peersOfUsers(await memberIds(conversationId)).filter(
    (p) => p.peerId !== requesterPeerId && !blocked.has(p.userId),
  );
  const request: PendingRequest = {
    id: randomUUID(),
    attachmentId: attachment.id,
    conversationId,
    part,
    sha256,
    size,
    requesterUserId: userId,
    requesterPeerId,
    candidates: new Map(candidates.map((p) => [p.peerId, p.userId])),
    expiresAt: Date.now() + REQUEST_TTL_MS,
  };
  requests.set(request.id, request);

  for (const c of candidates) {
    publishToPeer(c, {
      __typename: 'MediaRequested',
      toPeerId: c.peerId,
      requestId: request.id,
      conversationId,
      attachmentId: attachment.id,
      part,
      sha256,
      fromUserId: userId,
      fromPeerId: requesterPeerId,
    });
  }
  return { requestId: request.id, candidates: candidates.length };
}

const payloadSchema = z
  .string()
  .refine((s) => Buffer.byteLength(s) <= MAX_SIGNAL_BYTES, 'Signal is too large');
const signalSchema = z.object({
  requestId: z.string().uuid(),
  toPeerId: z.string().regex(PEER_ID),
  // RELAY is server-only (emitted by openRelay), so it is not accepted from clients.
  type: z.enum(['HAVE', 'OFFER', 'ANSWER', 'ICE', 'BYE']),
  payload: payloadSchema,
});

/** Who may send which signal: 'candidate' → requester, 'requester' → candidate, or 'either'. */
const DIRECTION: Record<SignalType, 'candidate' | 'requester' | 'either'> = {
  HAVE: 'candidate',
  OFFER: 'requester',
  ANSWER: 'candidate',
  ICE: 'either',
  BYE: 'either',
};

/**
 * Passes one opaque signal between the two devices of a live request. The server stamps who it
 * came from and never looks inside the payload. Returns false if the target device is gone.
 */
export function sendSignal(ctx: Context, input: unknown): boolean {
  const userId = requireUser(ctx);
  const fromPeerId = requirePeer(ctx);
  const signal = parseInput(signalSchema, input);
  if (!signalLimiter.allow(fromPeerId)) throw fail('RATE_LIMITED', 'Too many signals. Slow down');
  signalLimiter.hit(fromPeerId);

  const request = requests.get(signal.requestId);
  if (!request || request.expiresAt <= Date.now()) {
    if (request) requests.delete(request.id);
    throw fail('FORBIDDEN', 'This request has ended');
  }

  const direction = DIRECTION[signal.type];
  const fromRequester = fromPeerId === request.requesterPeerId;
  const fromCandidate = request.candidates.has(fromPeerId);
  const toRequester = signal.toPeerId === request.requesterPeerId;
  const toCandidate = request.candidates.has(signal.toPeerId);

  const asRequester = fromRequester && toCandidate && direction !== 'candidate';
  const asCandidate = fromCandidate && toRequester && direction !== 'requester';
  if (!asRequester && !asCandidate) throw fail('FORBIDDEN', 'You can’t send that here');

  const target = getPeer(signal.toPeerId);
  if (!target) return false;
  publishToPeer(target, {
    __typename: 'MediaSignal',
    toPeerId: target.peerId,
    requestId: request.id,
    type: signal.type,
    payload: signal.payload,
    fromUserId: userId,
    fromPeerId,
  });
  return true;
}

/**
 * Requester only: the two devices couldn't connect directly (or one hides its IP address), so pass
 * the bytes through this server's in-memory relay. `key` is the requester's AES-GCM key (empty on
 * plain HTTP); it is handed to the holder in a RELAY signal and never used by the server.
 */
export function openRelay(
  ctx: Context,
  requestId: string,
  holderPeerId: string,
  key: string | null | undefined,
): string {
  const userId = requireUser(ctx);
  const requesterPeerId = requirePeer(ctx);
  if (!config.media.enabled || !config.media.relay)
    throw fail('FORBIDDEN', 'This server doesn’t relay photos and videos');
  const keyText = key ?? '';
  if (keyText !== '' && !RELAY_KEY.test(keyText))
    throw fail('BAD_USER_INPUT', 'Invalid relay key', { field: 'key' });
  if (!relayLimiter.allow(userId) || relayCountFor(userId) >= MAX_CONCURRENT_RELAYS)
    throw fail('RATE_LIMITED', 'Too many transfers at once. Try again in a moment');
  relayLimiter.hit(userId);

  const request = requests.get(String(requestId));
  if (!request || request.expiresAt <= Date.now())
    throw fail('FORBIDDEN', 'This request has ended');
  if (request.requesterPeerId !== requesterPeerId)
    throw fail('FORBIDDEN', 'You can’t send that here');
  const holderUserId = request.candidates.get(String(holderPeerId));
  const holder = getPeer(String(holderPeerId));
  if (!holderUserId || !holder || holder.userId !== holderUserId)
    throw fail('FORBIDDEN', 'You can’t send that here');

  const relayId = createRelay({
    requesterPeerId,
    holderPeerId: holder.peerId,
    requesterUserId: userId,
    holderUserId,
    size: request.size,
  });
  publishToPeer(holder, {
    __typename: 'MediaSignal',
    toPeerId: holder.peerId,
    requestId: request.id,
    type: 'RELAY',
    payload: JSON.stringify({ relayId, key: keyText }),
    fromUserId: userId,
    fromPeerId: requesterPeerId,
  });
  return relayId;
}

/** The user left the conversation: drop their live requests there and stop them answering others'. */
export function cancelRequestsFor(conversationId: string, userId: string): void {
  for (const [id, r] of requests) {
    if (r.conversationId !== conversationId) continue;
    if (r.requesterUserId === userId) {
      requests.delete(id);
      continue;
    }
    for (const [peerId, candidateUserId] of r.candidates) {
      if (candidateUserId === userId) r.candidates.delete(peerId);
    }
  }
}

/** Tests only. */
export function resetMediaState(): void {
  requests.clear();
  requestLimiter.clear();
  signalLimiter.clear();
  relayLimiter.clear();
  closeAllRelays();
}
