import type { MediaRequestedEvent, MediaSignalEvent } from '@/lib/gql';
import * as peer from './peer';
import { getPref } from './prefs';
import * as relay from './relay';
import { authorize } from './serve';
import * as store from './store';
import { signal } from './wsRequest';

/**
 * Incoming media events: answering "who has this?" as a holder, collecting HAVE answers as a
 * requester, and routing WebRTC / relay signals.
 */
export interface Have {
  fromPeerId: string;
  fromUserId: string;
  relayOnly: boolean;
}

interface Collected {
  haves: Have[];
  waiters: Set<() => void>;
  at: number;
}
/** HAVE answers by request id. They can arrive before our requestMedia call has even returned. */
const collected = new Map<string, Collected>();

function entry(requestId: string): Collected {
  let c = collected.get(requestId);
  if (!c) {
    const now = Date.now();
    for (const [id, old] of collected) if (now - old.at > 150_000) collected.delete(id);
    collected.set(requestId, (c = { haves: [], waiters: new Set(), at: now }));
  }
  return c;
}

/**
 * The first holder that answers and isn't in `exclude`. If only excluded holders answer within
 * `ms`, one of them is used after all (a dropped connection is worth one more go); null if nobody.
 */
export function waitForHave(
  requestId: string,
  exclude: Set<string>,
  ms: number,
): Promise<Have | null> {
  const c = entry(requestId);
  const fresh = () => c.haves.find((h) => !exclude.has(h.fromPeerId));
  return new Promise((resolve) => {
    const hit = fresh();
    if (hit) return resolve(hit);
    const check = () => {
      const h = fresh();
      if (!h) return;
      done(h);
    };
    const timer = setTimeout(() => done(c.haves[0] ?? null), ms);
    function done(h: Have | null) {
      clearTimeout(timer);
      c.waiters.delete(check);
      resolve(h);
    }
    c.waiters.add(check);
  });
}

export const forgetRequest = (requestId: string) => collected.delete(requestId);

/** Someone in one of our chats wants a file. Answer HAVE only if it's here *for that chat*. */
export async function handleMediaRequested(event: MediaRequestedEvent): Promise<void> {
  if (!(await store.hasAsync(event.sha256, event.conversationId))) return;
  authorize(event.requestId, {
    sha256: event.sha256,
    conversationId: event.conversationId,
    requesterPeerId: event.fromPeerId,
    requesterUserId: event.fromUserId,
  });
  await signal(event.requestId, event.fromPeerId, 'HAVE', {
    relayOnly: getPref('media:relayOnly'),
  }).catch(() => undefined);
}

export function handleMediaSignal(event: MediaSignalEvent): void {
  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(event.payload) as unknown;
    if (!parsed || typeof parsed !== 'object') return;
    payload = parsed as Record<string, unknown>;
  } catch {
    return;
  }
  switch (event.type) {
    case 'HAVE': {
      const c = entry(event.requestId);
      if (c.haves.some((h) => h.fromPeerId === event.fromPeerId)) return;
      c.haves.push({
        fromPeerId: event.fromPeerId,
        fromUserId: event.fromUserId,
        relayOnly: payload.relayOnly === true,
      });
      c.waiters.forEach((w) => w());
      return;
    }
    case 'OFFER':
      void peer.onOffer(event, payload);
      return;
    case 'ANSWER':
      void peer.onAnswer(event, payload);
      return;
    case 'ICE':
      peer.onIce(event, payload);
      return;
    case 'BYE':
      peer.onBye(event, payload);
      return;
    case 'RELAY':
      void relay.onRelay(event, payload);
      return;
  }
}

export function clearSignals(): void {
  collected.clear();
}
