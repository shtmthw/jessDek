import { parseControl, sendControl, type Channel } from './channel';
import { ACK_WAIT_MS, HIGH_WATER, LOW_WATER, MAX_SERVES, REQUEST_TTL_MS } from './limits';
import * as store from './store';
import { startServe } from './transfers';

/**
 * The holder's side of a transfer. A holder serves only the hash the server named, only to that
 * request's requester device, and only if it holds that file *for that conversation*. That last
 * check blocks "put a hash guessed from another chat into a fake attachment" (MEDIA_PLAN.md S6).
 */
export interface Authorization {
  sha256: string;
  conversationId: string;
  requesterPeerId: string;
  requesterUserId: string;
  expiresAt: number;
}

/** Requests this tab answered HAVE to, by request id. */
export const authorized = new Map<string, Authorization>();

export function authorize(requestId: string, auth: Omit<Authorization, 'expiresAt'>): void {
  const now = Date.now();
  for (const [id, a] of authorized) if (a.expiresAt <= now) authorized.delete(id);
  authorized.set(requestId, { ...auth, expiresAt: now + REQUEST_TTL_MS });
}

/** A live authorization for this request from this peer, or undefined. */
export function authorizationFor(
  requestId: string,
  remotePeerId: string,
): Authorization | undefined {
  const auth = authorized.get(requestId);
  if (!auth || auth.requesterPeerId !== remotePeerId || auth.expiresAt <= Date.now())
    return undefined;
  return auth;
}

// At most MAX_SERVES at once per tab; the rest wait their turn.
let running = 0;
const waiting: (() => void)[] = [];
async function slot(): Promise<() => void> {
  if (running >= MAX_SERVES) await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    running -= 1;
    waiting.shift()?.();
  };
}

/** Serves one file over `channel` to `remotePeerId`, then closes the channel. */
export function serve(channel: Channel, remotePeerId: string): Promise<void> {
  return new Promise<void>((resolve) => {
    let closed = false;
    let stop: (() => void) | null = null;
    let onAck: ((ok: boolean) => void) | null = null;
    const finish = () => {
      if (closed) return;
      closed = true;
      stop?.();
      try {
        channel.close();
      } catch {
        /* already closed */
      }
      resolve();
    };
    channel.onclose = () => {
      onAck?.(false);
      finish();
    };

    let started = false;
    channel.onmessage = (data) => {
      if (typeof data !== 'string') return; // the requester never sends bytes
      const msg = parseControl(data);
      if (!msg) return;
      if (msg.t === 'get' && !started) {
        started = true;
        void run(msg.requestId, msg.offset);
      } else if (msg.t === 'ok') onAck?.(true);
      else if (msg.t === 'error') {
        onAck?.(false);
        finish();
      }
    };

    async function run(requestId: string, offset: number) {
      const auth = authorizationFor(requestId, remotePeerId);
      if (!auth) {
        sendControl(channel, { t: 'error', code: 'UNAUTHORIZED' });
        return finish();
      }
      if (!(await store.hasAsync(auth.sha256, auth.conversationId))) {
        sendControl(channel, { t: 'error', code: 'NOT_FOUND' });
        return finish();
      }
      const blob = await store.get(auth.sha256);
      if (!blob) {
        sendControl(channel, { t: 'error', code: 'NOT_FOUND' });
        return finish();
      }
      if (!Number.isInteger(offset) || offset < 0 || offset > blob.size) {
        sendControl(channel, { t: 'error', code: 'SIZE' });
        return finish();
      }

      const release = await slot();
      if (closed) return release();
      const share = startServe(auth.sha256, auth.requesterUserId, blob.size, offset);
      stop = () => {
        share.end();
        release();
      };

      channel.bufferedAmountLowThreshold = LOW_WATER;
      const drained = () =>
        new Promise<void>((resume) => {
          channel.onbufferedamountlow = () => {
            channel.onbufferedamountlow = null;
            resume();
          };
        });

      sendControl(channel, { t: 'head', size: blob.size, mime: blob.type });
      const size = channel.maxMessageSize;
      const read = (at: number) => blob.slice(at, at + size).arrayBuffer();
      let at = offset;
      try {
        let next = at < blob.size ? read(at) : null;
        while (next && !closed) {
          const chunk = await next;
          const after = at + chunk.byteLength;
          next = after < blob.size ? read(after) : null; // read ahead while this one sends
          if (channel.bufferedAmount > HIGH_WATER) await drained();
          if (closed) return;
          channel.send(chunk);
          at = after;
          share.progress(at);
        }
      } catch {
        return finish();
      }
      if (closed) return;
      sendControl(channel, { t: 'done' });

      // Wait for the requester to verify; it then becomes a holder too.
      await new Promise<void>((done) => {
        const timer = setTimeout(() => done(), ACK_WAIT_MS);
        onAck = () => {
          clearTimeout(timer);
          done();
        };
      });
      finish();
    }
  });
}

export function clearServes(): void {
  authorized.clear();
}
