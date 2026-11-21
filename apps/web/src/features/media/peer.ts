import { fromDataChannel, type Channel } from './channel';
import { getMediaConfig } from './config';
import { ICE_TIMEOUT_MS, IDLE_PEER_CLOSE_MS } from './limits';
import { uuidv4 } from './peerId';
import { getPref } from './prefs';
import { authorizationFor, serve } from './serve';
import { signal } from './wsRequest';

/**
 * RTCPeerConnection lifecycle. The requester makes the offer; the holder answers only for a
 * request it said HAVE to. One connection per remote tab is reused for later transfers (a new data
 * channel needs no renegotiation), and closed after a minute with no open channels.
 */
export class PeerError extends Error {
  constructor(readonly code: 'ICE_TIMEOUT' | 'REFUSED' | 'UNSUPPORTED') {
    super(code);
    this.name = 'PeerError';
  }
}

interface Link {
  connectionId: string;
  remotePeerId: string;
  /** The request this connection was negotiated for (its signals travel under it). */
  requestId: string;
  role: 'requester' | 'holder';
  pc: RTCPeerConnection;
  openChannels: number;
  remoteSet: boolean;
  iceQueue: RTCIceCandidateInit[];
  idleTimer?: ReturnType<typeof setTimeout>;
  connected: Promise<void>;
  settle: (err?: PeerError) => void;
  closed: boolean;
}

interface SignalFrom {
  requestId: string;
  fromPeerId: string;
}
interface Sdp {
  connectionId?: unknown;
  sdp?: unknown;
}

const links = new Map<string, Link>(); // by connectionId
const outgoing = new Map<string, Link>(); // requester side, by remotePeerId (reused)
const earlyIce = new Map<string, { candidates: RTCIceCandidateInit[]; at: number }>();

export const hasWebRTC = () =>
  typeof window !== 'undefined' && typeof window.RTCPeerConnection === 'function';

function iceServers(): RTCIceServer[] {
  return (getMediaConfig()?.iceServers ?? []).map((s) => ({
    urls: s.urls,
    ...(s.username ? { username: s.username } : {}),
    ...(s.credential ? { credential: s.credential } : {}),
  }));
}

const noop = () => undefined;

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

function makeLink(
  remotePeerId: string,
  requestId: string,
  role: Link['role'],
  connectionId = uuidv4(),
): Link {
  const pc = new RTCPeerConnection({ iceServers: iceServers() });
  let settle!: Link['settle'];
  const connected = new Promise<void>((resolve, reject) => {
    settle = (err) => (err ? reject(err) : resolve());
  });
  connected.catch(noop);
  const link: Link = {
    connectionId,
    remotePeerId,
    requestId,
    role,
    pc,
    openChannels: 0,
    remoteSet: false,
    iceQueue: [],
    connected,
    settle,
    closed: false,
  };
  links.set(connectionId, link);
  if (role === 'requester') outgoing.set(remotePeerId, link);

  pc.onicecandidate = (e) => {
    void signal(link.requestId, remotePeerId, 'ICE', {
      connectionId,
      candidate: e.candidate ? e.candidate.toJSON() : null,
    }).catch(noop);
  };
  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    if (state === 'connected') link.settle();
    else if (state === 'failed' || state === 'closed') closeLink(link, false);
  };
  // Candidates that arrived before we knew about this connection.
  const early = earlyIce.get(connectionId);
  if (early) {
    link.iceQueue.push(...early.candidates);
    earlyIce.delete(connectionId);
  }
  scheduleIdle(link);
  return link;
}

function closeLink(link: Link, sayBye: boolean) {
  if (link.closed) return;
  link.closed = true;
  clearTimeout(link.idleTimer);
  link.settle(new PeerError('REFUSED'));
  try {
    link.pc.close();
  } catch {
    /* already closed */
  }
  links.delete(link.connectionId);
  if (outgoing.get(link.remotePeerId) === link) outgoing.delete(link.remotePeerId);
  if (sayBye)
    void signal(link.requestId, link.remotePeerId, 'BYE', {
      connectionId: link.connectionId,
    }).catch(noop);
}

function scheduleIdle(link: Link) {
  clearTimeout(link.idleTimer);
  if (link.openChannels > 0) return;
  link.idleTimer = setTimeout(() => closeLink(link, true), IDLE_PEER_CLOSE_MS);
}

function track(link: Link, dc: RTCDataChannel) {
  link.openChannels += 1;
  clearTimeout(link.idleTimer);
  let done = false;
  const release = () => {
    if (done) return;
    done = true;
    link.openChannels -= 1;
    scheduleIdle(link);
  };
  dc.addEventListener('close', release);
  dc.addEventListener('error', release);
}

async function flushIce(link: Link) {
  link.remoteSet = true;
  for (const candidate of link.iceQueue.splice(0)) {
    await link.pc.addIceCandidate(candidate).catch(noop);
  }
}

function openOn(link: Link, requestId: string): Promise<Channel> {
  const dc = link.pc.createDataChannel(`get:${requestId}`, { ordered: true });
  track(link, dc);
  const open = new Promise<Channel>((resolve, reject) => {
    if (dc.readyState === 'open') return resolve(fromDataChannel(dc, link.pc));
    dc.addEventListener('open', () => resolve(fromDataChannel(dc, link.pc)), { once: true });
    dc.addEventListener('close', () => reject(new PeerError('REFUSED')), { once: true });
  });
  return withTimeout(open, ICE_TIMEOUT_MS, () => {
    dc.close();
    return new PeerError('ICE_TIMEOUT');
  });
}

/** Requester: a data channel to the holder for this request, over a new or reused connection. */
export async function openChannel(remotePeerId: string, requestId: string): Promise<Channel> {
  if (!hasWebRTC()) throw new PeerError('UNSUPPORTED');
  const existing = outgoing.get(remotePeerId);
  if (existing && !existing.closed) {
    if (existing.pc.connectionState === 'connected') return openOn(existing, requestId);
    // Several downloads from the same device at once: the first one is still connecting. Wait for
    // it and share the connection, rather than tearing it down and racing each other.
    const state = existing.pc.connectionState;
    if (state === 'new' || state === 'connecting') {
      try {
        await withTimeout(existing.connected, ICE_TIMEOUT_MS, () => new PeerError('ICE_TIMEOUT'));
        if (!existing.closed) return await openOn(existing, requestId);
      } catch {
        /* that connection failed: make a fresh one below */
      }
    }
  }
  const stale = outgoing.get(remotePeerId);
  if (stale) closeLink(stale, true);

  const link = makeLink(remotePeerId, requestId, 'requester');
  // The channel must exist before the offer, so the offer includes the data section.
  const channel = openOn(link, requestId);
  channel.catch(noop);
  try {
    await link.pc.setLocalDescription(await link.pc.createOffer());
    await signal(requestId, remotePeerId, 'OFFER', {
      connectionId: link.connectionId,
      sdp: link.pc.localDescription!.sdp,
    });
    await withTimeout(link.connected, ICE_TIMEOUT_MS, () => new PeerError('ICE_TIMEOUT'));
    return await channel;
  } catch (err) {
    closeLink(link, true);
    throw err instanceof PeerError ? err : new PeerError('ICE_TIMEOUT');
  }
}

/** Holder: answer an offer, but only for a request we said HAVE to, from that requester. */
export async function onOffer(event: SignalFrom, payload: Sdp): Promise<void> {
  const connectionId = typeof payload.connectionId === 'string' ? payload.connectionId : null;
  if (!connectionId || typeof payload.sdp !== 'string' || links.has(connectionId)) return;
  const allowed =
    authorizationFor(event.requestId, event.fromPeerId) &&
    !getPref('media:relayOnly') &&
    hasWebRTC();
  if (!allowed) {
    void signal(event.requestId, event.fromPeerId, 'BYE', { connectionId }).catch(noop);
    return;
  }
  const link = makeLink(event.fromPeerId, event.requestId, 'holder', connectionId);
  link.pc.ondatachannel = (e) => {
    // "Hide my IP address" turned on since this connection was made: stop using it.
    if (getPref('media:relayOnly')) return closeLink(link, true);
    track(link, e.channel);
    void serve(fromDataChannel(e.channel, link.pc), link.remotePeerId);
  };
  try {
    await link.pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
    await flushIce(link);
    await link.pc.setLocalDescription(await link.pc.createAnswer());
    await signal(event.requestId, event.fromPeerId, 'ANSWER', {
      connectionId,
      sdp: link.pc.localDescription!.sdp,
    });
  } catch {
    closeLink(link, true);
  }
}

export async function onAnswer(event: SignalFrom, payload: Sdp): Promise<void> {
  const link =
    typeof payload.connectionId === 'string' ? links.get(payload.connectionId) : undefined;
  if (!link || link.role !== 'requester' || link.remotePeerId !== event.fromPeerId) return;
  if (typeof payload.sdp !== 'string' || link.remoteSet) return;
  try {
    await link.pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
    await flushIce(link);
  } catch {
    closeLink(link, true);
  }
}

export function onIce(
  event: SignalFrom,
  payload: { connectionId?: unknown; candidate?: unknown },
): void {
  if (typeof payload.connectionId !== 'string') return;
  const candidate = payload.candidate as RTCIceCandidateInit | null | undefined;
  if (!candidate || typeof candidate !== 'object') return; // end-of-candidates needs no action
  const link = links.get(payload.connectionId);
  if (!link) {
    // The offer is still being processed: keep a few, briefly.
    const now = Date.now();
    for (const [id, e] of earlyIce) if (now - e.at > 30_000) earlyIce.delete(id);
    const entry = earlyIce.get(payload.connectionId) ?? { candidates: [], at: now };
    if (entry.candidates.length < 50) entry.candidates.push(candidate);
    earlyIce.set(payload.connectionId, entry);
    return;
  }
  if (link.remotePeerId !== event.fromPeerId) return;
  if (!link.remoteSet) link.iceQueue.push(candidate);
  else void link.pc.addIceCandidate(candidate).catch(noop);
}

export function onBye(event: SignalFrom, payload: { connectionId?: unknown }): void {
  const link =
    typeof payload.connectionId === 'string' ? links.get(payload.connectionId) : undefined;
  if (link && link.remotePeerId === event.fromPeerId) closeLink(link, false);
}

export function closeAll(): void {
  for (const link of [...links.values()]) closeLink(link, false);
  earlyIce.clear();
}
