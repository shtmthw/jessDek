import { useRef, useSyncExternalStore } from 'react';
import { REQUEST_MEDIA, type MediaPart } from '@/lib/gql';
import type { Channel } from './channel';
import { getMediaConfig } from './config';
import { fetchOver, getSink, resetSink, TransferError, type Expected } from './fetch';
import { HAVE_WAIT_MS, MAX_ATTEMPTS, MAX_DOWNLOADS, PRESENCE_DEBOUNCE_MS } from './limits';
import { hasWebRTC, openChannel } from './peer';
import { getPref } from './prefs';
import { openRelayChannel } from './relay';
import { forgetRequest, waitForHave } from './signals';
import * as store from './store';
import { wsRequest, WsRequestError } from './wsRequest';

/**
 * Every download on this tab, one entry per file hash (identical files are fetched once).
 * Pulls from whichever online member's device has the file: P2P first, the relay if that fails.
 */
export type Status =
  | 'idle'
  | 'queued'
  | 'locating'
  | 'connecting'
  | 'downloading'
  | 'ready'
  | 'unavailable'
  | 'failed';

/** What the UI reads (immutable; a new object on every change). */
export interface Download {
  key: string;
  attachmentId: string;
  part: MediaPart;
  conversationId: string;
  status: Status;
  /** 0–1 while downloading. */
  progress: number;
  url?: string;
  transport?: 'p2p' | 'relay' | 'local';
  error?: string;
}

/** The attachment metadata a download needs (a subset of the GraphQL Attachment). */
export interface MediaRef {
  id: string;
  sha256: string;
  size: number;
  mimeType: string;
  posterSha256?: string | null;
  posterSize?: number | null;
  posterMime?: string | null;
}

interface Entry {
  snapshot: Download;
  expected: Expected;
  priority: number;
  seq: number;
  attempts: number;
  triedHolders: Set<string>;
  abort?: AbortController;
}

export const PRIORITY = { viewer: 100, onScreen: 50, prefetch: 10 } as const;

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let running = 0;
let seq = 0;
/** Bumped on sign-out, so runs from the old session don't hold slots in the new one. */
let generation = 0;

/** Answers "is this user in that conversation?" (set from the Apollo cache by initMedia). */
let isMember: (conversationId: string, userId: string) => boolean = () => true;
export function setMembershipResolver(fn: typeof isMember): void {
  isMember = fn;
}

function set(e: Entry, patch: Partial<Download>) {
  e.snapshot = { ...e.snapshot, ...patch };
  listeners.forEach((l) => l());
}

// Progress is published at most once per animation frame.
const frame =
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (fn: () => void) => setTimeout(fn, 16);
const dirty = new Map<Entry, number>();
function progress(e: Entry, received: number) {
  const first = dirty.size === 0;
  dirty.set(e, received / Math.max(1, e.expected.size));
  if (first)
    frame(() => {
      for (const [entry, p] of dirty)
        if (entry.snapshot.status === 'downloading') set(entry, { progress: p });
      dirty.clear();
    });
}

function enqueue(e: Entry) {
  e.seq = seq++;
  set(e, { status: 'queued', error: undefined });
  pump();
}

function pump() {
  while (running < MAX_DOWNLOADS) {
    let next: Entry | undefined;
    for (const e of entries.values()) {
      if (e.snapshot.status !== 'queued') continue;
      if (!next || e.priority > next.priority || (e.priority === next.priority && e.seq < next.seq))
        next = e;
    }
    if (!next) return;
    running += 1;
    const gen = generation;
    set(next, { status: 'locating' });
    void run(next).finally(() => {
      if (gen !== generation) return;
      running -= 1;
      pump();
    });
  }
}

/** Asks for a file (or a video's poster). Safe to call on every render or scroll. */
export function ensure(
  att: MediaRef,
  part: MediaPart,
  conversationId: string,
  priority: number = PRIORITY.onScreen,
): void {
  const expected: Expected | null =
    part === 'POSTER'
      ? att.posterSha256 && att.posterSize && att.posterMime
        ? { sha256: att.posterSha256, size: att.posterSize, mime: att.posterMime }
        : null
      : { sha256: att.sha256, size: att.size, mime: att.mimeType };
  if (!expected) return;
  const key = expected.sha256;
  let e = entries.get(key);
  if (!e) {
    e = {
      snapshot: { key, attachmentId: att.id, part, conversationId, status: 'idle', progress: 0 },
      expected,
      priority,
      seq: seq++,
      attempts: 0,
      triedHolders: new Set(),
    };
    entries.set(key, e);
  }
  if (priority > e.priority) e.priority = priority;
  const { status } = e.snapshot;
  const stuck = status === 'unavailable' || status === 'failed';
  // The same file sent again (same hash, new message): its sender may well be online even though
  // nobody had the old copy. Ask on behalf of the new attachment.
  const resent = stuck && e.snapshot.attachmentId !== att.id;
  if (resent) set(e, { attachmentId: att.id, conversationId });
  // Opening the viewer on something that failed or is waiting is a good moment to try again.
  const again = resent || (priority >= PRIORITY.viewer && stuck);
  if (status === 'idle' || again) {
    if (again) reset(e);
    enqueue(e);
  }
}

function reset(e: Entry) {
  e.attempts = 0;
  e.triedHolders.clear();
}

const transferFailure = (err: unknown) =>
  !(err instanceof TransferError && err.code === 'CANCELLED');

async function connect(requestId: string, holderPeerId: string, holderRelayOnly: boolean) {
  const relayAllowed = getMediaConfig()?.relay ?? false;
  const relayOnly = getPref('media:relayOnly') || holderRelayOnly || !hasWebRTC();
  if (!relayOnly) {
    try {
      return { channel: await openChannel(holderPeerId, requestId), transport: 'p2p' as const };
    } catch (err) {
      if (!relayAllowed) throw err;
    }
  } else if (!relayAllowed) {
    throw new Error('A direct connection isn’t possible and this server has no relay');
  }
  return { channel: await openRelayChannel(requestId, holderPeerId), transport: 'relay' as const };
}

async function run(e: Entry): Promise<void> {
  const { key, attachmentId, part, conversationId } = e.snapshot;
  const abort = new AbortController();
  e.abort = abort;
  try {
    // Another tab of this browser already has it.
    // (Shown, but not tagged with this conversation: see S6 in MEDIA_PLAN.md.)
    if (await store.hasAsync(key)) {
      set(e, { status: 'ready', url: await store.urlFor(key), transport: 'local', progress: 1 });
      return;
    }
    for (;;) {
      if (abort.signal.aborted) return;
      set(e, { status: 'locating' });
      const { requestMedia } = await wsRequest(REQUEST_MEDIA, { attachmentId, part });
      if (requestMedia.candidates === 0) return set(e, { status: 'unavailable' });

      const have = await waitForHave(requestMedia.requestId, e.triedHolders, HAVE_WAIT_MS);
      if (abort.signal.aborted) return;
      if (!have) return set(e, { status: 'unavailable' });

      let channel: Channel | null = null;
      try {
        set(e, { status: 'connecting' });
        const link = await connect(requestMedia.requestId, have.fromPeerId, have.relayOnly);
        channel = link.channel;
        if (abort.signal.aborted) {
          channel.close();
          return;
        }
        set(e, { status: 'downloading', transport: link.transport });
        const blob = await fetchOver(
          channel,
          { requestId: requestMedia.requestId, expected: e.expected },
          getSink(key),
          (received) => progress(e, received),
          abort.signal,
        );
        forgetRequest(requestMedia.requestId);
        await store.put(key, blob, e.expected.mime, conversationId, 'received', part === 'POSTER');
        set(e, { status: 'ready', url: await store.urlFor(key), progress: 1 });
        return;
      } catch (err) {
        forgetRequest(requestMedia.requestId);
        if (!transferFailure(err) || abort.signal.aborted) return;
        if (err instanceof TransferError && err.integrity) resetSink(key);
        e.triedHolders.add(have.fromPeerId);
        e.attempts += 1;
        if (e.attempts >= MAX_ATTEMPTS) {
          return set(e, {
            status: 'failed',
            error: err instanceof Error ? err.message : String(err),
          });
        }
        // …and around again, resuming from what already arrived.
      }
    }
  } catch (err) {
    if (abort.signal.aborted) return;
    // Rate limits and dropped sockets are temporary: wait for the next retry signal.
    const temporary =
      err instanceof WsRequestError &&
      (err.code === 'RATE_LIMITED' || err.code === 'NETWORK' || err.code === 'TIMEOUT');
    set(e, {
      status: temporary ? 'unavailable' : 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    if (e.abort === abort) e.abort = undefined;
  }
}

/** Stops a download (videos only, from the tile's ×). What arrived so far is dropped. */
export function cancel(key: string): void {
  const e = entries.get(key);
  if (!e) return;
  e.abort?.abort();
  resetSink(key);
  if (e.snapshot.status !== 'ready') set(e, { status: 'idle', progress: 0 });
}

/** A tap on "Retry". */
export function retry(key: string): void {
  const e = entries.get(key);
  if (!e || e.snapshot.status === 'ready' || isActive(e)) return;
  reset(e);
  enqueue(e);
}

const isActive = (e: Entry) =>
  ['queued', 'locating', 'connecting', 'downloading'].includes(e.snapshot.status);

function requeueUnavailable(filter: (e: Entry) => boolean = () => true) {
  for (const e of entries.values()) {
    if (e.snapshot.status === 'unavailable' && filter(e)) {
      reset(e);
      enqueue(e);
    }
  }
}

let cameOnline = new Set<string>();
let presenceTimer: ReturnType<typeof setTimeout> | undefined;

/** A member came online: try again whatever in their conversations was waiting (debounced). */
export function onPresence(userId: string): void {
  cameOnline.add(userId);
  clearTimeout(presenceTimer);
  presenceTimer = setTimeout(() => {
    const users = cameOnline;
    cameOnline = new Set();
    requeueUnavailable((e) => [...users].some((u) => isMember(e.snapshot.conversationId, u)));
  }, PRESENCE_DEBOUNCE_MS);
}

/** Back online after a dropped connection. */
export const onReconnect = () => requeueUnavailable();
/** The periodic retry while the tab is visible. */
export const retryUnavailable = () => requeueUnavailable();

export const getDownload = (key: string | null | undefined): Download | undefined =>
  key ? entries.get(key)?.snapshot : undefined;

export const useDownload = (key: string | null | undefined): Download | undefined =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => getDownload(key),
    () => undefined,
  );

const NONE: Array<Download | undefined> = [];

/** Several downloads at once (one tile each) without a hook per item. */
export function useDownloads(
  keys: ReadonlyArray<string | null | undefined>,
): Array<Download | undefined> {
  const last = useRef(NONE);
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => {
      const next = keys.map(getDownload);
      const same =
        next.length === last.current.length && next.every((d, i) => d === last.current[i]);
      if (!same) last.current = next;
      return last.current;
    },
    () => NONE,
  );
}

/** Sign-out: stop everything and forget it. */
export function clearDownloads(): void {
  for (const e of entries.values()) e.abort?.abort();
  entries.clear();
  generation += 1;
  running = 0;
  dirty.clear();
  clearTimeout(presenceTimer);
  cameOnline = new Set();
  listeners.forEach((l) => l());
}
