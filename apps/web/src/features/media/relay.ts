import { OPEN_RELAY } from '@/lib/gql';
import type { Channel } from './channel';
import { CHUNK_BYTES } from './limits';
import { getPeerId } from './peerId';
import { authorizationFor, serve } from './serve';
import { wsRequest } from './wsRequest';

/**
 * The fallback when a direct connection can't be made (or "Hide my IP address" is on): both tabs
 * connect to /media-relay and the server pipes frames between them in memory.
 *
 * On secure origins every frame is iv(12) ‖ AES-256-GCM(type(1) ‖ payload), with a key the
 * requester makes and the server forwards to the holder, so the relay only sees ciphertext. The IV
 * is the direction byte, 3 random bytes per transfer, then a 64-bit counter; receivers insist on
 * the other direction and a strictly increasing counter, so frames can't be reflected or replayed.
 * On plain HTTP the page itself is cleartext, so frames are just type(1) ‖ payload.
 */
const TEXT = 0;
const BINARY = 1;
const FROM_REQUESTER = 0x01;
const FROM_HOLDER = 0x02;
const POLL_MS = 50;
const CONNECT_TIMEOUT_MS = 10_000;

const sockets = new Set<WebSocket>();
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const secure = () =>
  typeof window !== 'undefined' && window.isSecureContext && typeof crypto.subtle !== 'undefined';

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function connect(relayId: string): Promise<WebSocket> {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${location.host}/media-relay?relay=${encodeURIComponent(relayId)}&peer=${encodeURIComponent(getPeerId())}`;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    sockets.add(ws);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('RELAY_TIMEOUT'));
    }, CONNECT_TIMEOUT_MS);
    ws.onopen = () => {
      clearTimeout(timer);
      resolve(ws);
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error('RELAY_FAILED'));
    };
    ws.addEventListener('close', () => sockets.delete(ws));
  });
}

/** Wraps a relay socket as a Channel, encrypting and decrypting in order. */
export function wrapRelay(
  ws: WebSocket,
  key: CryptoKey | null,
  role: 'requester' | 'holder',
): Channel {
  const outDir = role === 'requester' ? FROM_REQUESTER : FROM_HOLDER;
  const inDir = role === 'requester' ? FROM_HOLDER : FROM_REQUESTER;
  const salt = crypto.getRandomValues(new Uint8Array(3));
  let sendCounter = 0n;
  let recvCounter = -1n;
  let pendingBytes = 0;
  let sending: Promise<void> = Promise.resolve();
  let receiving: Promise<void> = Promise.resolve();
  let closed = false;
  let poll: ReturnType<typeof setInterval> | null = null;

  const channel: Channel = {
    send(data) {
      if (closed || ws.readyState !== WebSocket.OPEN) throw new Error('closed');
      const body = typeof data === 'string' ? encoder.encode(data) : new Uint8Array(data);
      const plain = new Uint8Array(1 + body.length);
      plain[0] = typeof data === 'string' ? TEXT : BINARY;
      plain.set(body, 1);
      pendingBytes += plain.length;
      const counter = sendCounter++;
      sending = sending.then(async () => {
        let frame: Uint8Array = plain;
        if (key) {
          const iv = new Uint8Array(12);
          iv[0] = outDir;
          iv.set(salt, 1);
          new DataView(iv.buffer).setBigUint64(4, counter);
          const sealed = new Uint8Array(
            await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain),
          );
          frame = new Uint8Array(12 + sealed.length);
          frame.set(iv);
          frame.set(sealed, 12);
        }
        pendingBytes -= plain.length;
        if (!closed && ws.readyState === WebSocket.OPEN) ws.send(frame);
      });
      sending.catch(() => fail());
      watchBuffer();
    },
    get bufferedAmount() {
      return ws.bufferedAmount + pendingBytes;
    },
    bufferedAmountLowThreshold: 0,
    onbufferedamountlow: null,
    onmessage: null,
    onclose: null,
    maxMessageSize: CHUNK_BYTES,
    close() {
      if (closed) return;
      // Let queued frames go out first, like a data channel does.
      void sending.finally(() => ws.close(1000));
    },
  };

  /** WebSockets have no bufferedamountlow event: poll while above the threshold. */
  function watchBuffer() {
    if (poll || channel.bufferedAmount <= channel.bufferedAmountLowThreshold) return;
    poll = setInterval(() => {
      if (channel.bufferedAmount > channel.bufferedAmountLowThreshold) return;
      clearInterval(poll!);
      poll = null;
      channel.onbufferedamountlow?.();
    }, POLL_MS);
  }

  function fail() {
    if (closed) return;
    closed = true;
    if (poll) clearInterval(poll);
    try {
      ws.close(1000);
    } catch {
      /* already closed */
    }
    channel.onclose?.();
  }

  ws.onmessage = (e: MessageEvent<ArrayBuffer | string>) => {
    if (typeof e.data === 'string') return fail(); // the protocol is binary frames only
    const frame = new Uint8Array(e.data);
    receiving = receiving.then(async () => {
      if (closed) return;
      let plain = frame;
      if (key) {
        if (frame.length < 12 + 16 + 1 || frame[0] !== inDir) return fail();
        const counter = new DataView(frame.buffer, frame.byteOffset, 12).getBigUint64(4);
        if (counter <= recvCounter) return fail();
        recvCounter = counter;
        try {
          plain = new Uint8Array(
            await crypto.subtle.decrypt(
              { name: 'AES-GCM', iv: frame.subarray(0, 12) },
              key,
              frame.subarray(12),
            ),
          );
        } catch {
          return fail(); // tampered with
        }
      }
      if (plain.length < 1 || closed) return;
      const body = plain.subarray(1);
      if (plain[0] === TEXT) channel.onmessage?.(decoder.decode(body));
      else channel.onmessage?.(body.slice().buffer);
    });
  };
  ws.addEventListener('close', () => {
    // Deliver what was already decrypted before reporting the close.
    void receiving.finally(fail);
  });
  return channel;
}

async function makeKey(): Promise<{ key: CryptoKey | null; text: string }> {
  if (!secure()) return { key: null, text: '' };
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  return { key, text: base64url(raw) };
}

async function importKey(text: string): Promise<CryptoKey | null> {
  if (!text) return null;
  if (!secure()) throw new Error('RELAY_INSECURE');
  return crypto.subtle.importKey('raw', fromBase64url(text) as BufferSource, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

/** Requester: ask the server for a relay to this holder and connect to it. */
export async function openRelayChannel(requestId: string, holderPeerId: string): Promise<Channel> {
  const { key, text } = await makeKey();
  const { openRelay: relayId } = await wsRequest(OPEN_RELAY, {
    requestId,
    holderPeerId,
    key: text,
  });
  const ws = await connect(relayId);
  return wrapRelay(ws, key, 'requester');
}

/** Holder: the server says a requester we answered HAVE to wants the file through the relay. */
export async function onRelay(
  event: { requestId: string; fromPeerId: string },
  payload: { relayId?: unknown; key?: unknown },
): Promise<void> {
  if (typeof payload.relayId !== 'string' || typeof payload.key !== 'string') return;
  if (!authorizationFor(event.requestId, event.fromPeerId)) return;
  try {
    const key = await importKey(payload.key);
    const ws = await connect(payload.relayId);
    await serve(wrapRelay(ws, key, 'holder'), event.fromPeerId);
  } catch {
    /* the requester will try someone else */
  }
}

export function closeAll(): void {
  for (const ws of sockets) ws.close(1000);
  sockets.clear();
}
