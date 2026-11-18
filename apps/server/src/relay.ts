import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { FastifyBaseLogger } from 'fastify';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { sessionFromCookieHeader } from './auth.js';
import { deny, sameOrigin } from './origin.js';
import { getPeer } from './services/peers.js';

/**
 * The fallback path for photos and videos: when two devices can't connect directly, both open a
 * WebSocket to /media-relay and the server forwards frames between them *as they are*. Frames only
 * pass through memory (bounded by backpressure), are never logged and never written anywhere.
 * On HTTPS they are end-to-end encrypted by the browsers, so the relay only sees ciphertext.
 */
type Side = 'a' | 'b';

interface Relay {
  id: string;
  /** a = the requester's device, b = the holder's. */
  peers: Record<Side, string>;
  users: Record<Side, string>;
  /** Most bytes the holder may send (the file plus framing overhead). */
  maxBytes: number;
  sockets: Partial<Record<Side, WebSocket>>;
  sent: Record<Side, number>;
  joinTimer?: ReturnType<typeof setTimeout>;
  idleTimer?: ReturnType<typeof setTimeout>;
  closed: boolean;
}

export const RELAY_CLOSE = { auth: 4403, timeout: 4408, tooBig: 4413 } as const;
/** Mutable for tests. */
export const relayTimeouts = { joinMs: 20_000, idleMs: 30_000 };
const MAX_FRAME = 256 * 1024;
const HIGH_WATER = 1024 * 1024;
const LOW_WATER = 256 * 1024;
/** The requester only ever sends small control frames. */
const MAX_REQUESTER_BYTES = 64 * 1024;

const relays = new Map<string, Relay>();
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME });
let log: FastifyBaseLogger | undefined;

export function setRelayLogger(logger: FastifyBaseLogger): void {
  log = logger;
}

/** Bytes the holder may send for a file of `size`: 64 bytes of framing per 64 KiB chunk, plus control frames. */
export const maxRelayBytes = (size: number) => size + Math.ceil(size / 65536) * 64 + 65536;

export function createRelay(opts: {
  requesterPeerId: string;
  holderPeerId: string;
  requesterUserId: string;
  holderUserId: string;
  size: number;
}): string {
  const relay: Relay = {
    id: randomUUID(),
    peers: { a: opts.requesterPeerId, b: opts.holderPeerId },
    users: { a: opts.requesterUserId, b: opts.holderUserId },
    maxBytes: maxRelayBytes(opts.size),
    sockets: {},
    sent: { a: 0, b: 0 },
    closed: false,
  };
  relay.joinTimer = setTimeout(() => close(relay, RELAY_CLOSE.timeout), relayTimeouts.joinMs);
  relay.joinTimer.unref?.();
  relays.set(relay.id, relay);
  return relay.id;
}

/** Live relays a user takes part in (for the concurrency cap). */
export const relayCountFor = (userId: string) =>
  [...relays.values()].filter((r) => r.users.a === userId || r.users.b === userId).length;

function close(relay: Relay, code: number) {
  if (relay.closed) return;
  relay.closed = true;
  clearTimeout(relay.joinTimer);
  clearTimeout(relay.idleTimer);
  relays.delete(relay.id);
  for (const ws of Object.values(relay.sockets)) {
    try {
      // A paused socket would never read the other end's close reply.
      ws.resume();
      ws.close(code);
    } catch {
      ws.terminate();
    }
  }
  log?.debug(
    { relayId: relay.id, users: relay.users, bytes: relay.sent, code },
    'media relay closed',
  );
}

/** A device's socket went away: end its relays. */
export function closeRelaysOf(peerId: string): void {
  for (const relay of [...relays.values()]) {
    if (relay.peers.a === peerId || relay.peers.b === peerId) close(relay, 1000);
  }
}

function bumpIdle(relay: Relay) {
  clearTimeout(relay.idleTimer);
  relay.idleTimer = setTimeout(() => close(relay, RELAY_CLOSE.timeout), relayTimeouts.idleMs);
  relay.idleTimer.unref?.();
}

const sizeOf = (data: RawData) =>
  Array.isArray(data)
    ? data.reduce((n, b) => n + b.length, 0)
    : data instanceof ArrayBuffer
      ? data.byteLength
      : data.length;

/** Forwards src → dst with bounded memory: pause the source while too much is in flight. */
function pipe(relay: Relay, from: Side) {
  const to: Side = from === 'a' ? 'b' : 'a';
  const src = relay.sockets[from]!;
  const dst = relay.sockets[to]!;
  const cap = from === 'b' ? relay.maxBytes : MAX_REQUESTER_BYTES;
  let inFlight = 0;
  let paused = false;
  src.on('message', (data, isBinary) => {
    if (relay.closed) return;
    const n = sizeOf(data);
    relay.sent[from] += n;
    if (relay.sent[from] > cap) return close(relay, RELAY_CLOSE.tooBig);
    bumpIdle(relay);
    inFlight += n;
    dst.send(data, { binary: isBinary }, () => {
      inFlight -= n;
      if (paused && inFlight < LOW_WATER) {
        paused = false;
        src.resume();
      }
    });
    if (!paused && inFlight > HIGH_WATER) {
      paused = true;
      src.pause();
    }
  });
}

function attach(relay: Relay, side: Side, ws: WebSocket) {
  relay.sockets[side] = ws;
  // Nothing is read until both ends are here (frames wait in the kernel, not in our memory).
  ws.pause();
  ws.on('close', () => close(relay, 1000));
  ws.on('error', () => close(relay, 1000));
  if (relay.sockets.a && relay.sockets.b) {
    clearTimeout(relay.joinTimer);
    pipe(relay, 'a');
    pipe(relay, 'b');
    bumpIdle(relay);
    relay.sockets.a.resume();
    relay.sockets.b.resume();
  }
}

/** Upgrade handler for /media-relay?relay=<id>&peer=<peerId>. */
export async function handleRelayUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): Promise<void> {
  if (!sameOrigin(req)) return deny(socket);
  const url = new URL(req.url ?? '', 'http://relay.local');
  const relayId = url.searchParams.get('relay') ?? '';
  const peerId = url.searchParams.get('peer') ?? '';
  const userId = await sessionFromCookieHeader(req.headers.cookie).catch(() => null);

  const relay = relays.get(relayId);
  const side: Side | null =
    relay?.peers.a === peerId ? 'a' : relay?.peers.b === peerId ? 'b' : null;
  const ok =
    userId &&
    relay &&
    !relay.closed &&
    side &&
    getPeer(peerId)?.userId === userId &&
    relay.users[side] === userId &&
    !relay.sockets[side];
  if (!ok) return deny(socket);

  wss.handleUpgrade(req, socket, head, (ws) => {
    if (relay.closed || relay.sockets[side]) return ws.close(RELAY_CLOSE.auth);
    attach(relay, side, ws);
  });
}

export function closeAllRelays(): void {
  for (const relay of [...relays.values()]) close(relay, 1001);
  for (const client of wss.clients) client.terminate();
}

/** Tests only. */
export function clearRelays(): void {
  closeAllRelays();
  relayTimeouts.joinMs = 20_000;
  relayTimeouts.idleMs = 30_000;
}
