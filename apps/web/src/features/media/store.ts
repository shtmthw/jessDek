import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';

/**
 * Photos and videos kept on this device, by SHA-256, each tagged with the conversations it belongs
 * to. A device only ever serves a file into a conversation it is tagged with (MEDIA_PLAN.md S6).
 *
 * Backed by IndexedDB (one per browser profile, wiped on sign-out), with an in-memory index for
 * synchronous rendering checks, memory "holds" for sends in flight, and one object URL per file.
 * Falls back to memory only when IndexedDB isn't available (media then lasts for the tab session).
 */
export interface MediaRecord {
  sha256: string;
  blob: Blob;
  mime: string;
  size: number;
  conversationIds: string[];
  origin: 'sent' | 'received';
  savedAt: number;
  /** A video's poster frame (not counted as a photo in usage). */
  poster?: boolean;
}

interface MediaDB extends DBSchema {
  blobs: { key: string; value: MediaRecord; indexes: { byConversation: string } };
}

const DB_NAME = 'realtime-media';
const CHANNEL = 'realtime-media';

type Message =
  | { type: 'put'; sha: string; conversationIds: string[] }
  | { type: 'delete'; sha: string }
  | { type: 'clear' };

// ---- state ----------------------------------------------------------------------------------

/** sha → conversation ids, for everything in IndexedDB (or the memory fallback). */
const index = new Map<string, Set<string>>();
/** Sends in flight: servable before IndexedDB has them. */
const holds = new Map<string, { blob: Blob; conversationIds: Set<string>; poster: boolean }>();
/** Used only when IndexedDB can't be opened. */
const fallback = new Map<string, MediaRecord>();
const urls = new Map<string, string>();
const urlLoads = new Map<string, Promise<string>>();
const listeners = new Set<() => void>();

let dbPromise: Promise<IDBPDatabase<MediaDB> | null> | null = null;
let indexLoad: Promise<void> | null = null;
let askedPersist = false;
let channel: BroadcastChannel | null = null;

let version = 0;
const emit = () => {
  version += 1;
  listeners.forEach((l) => l());
};

/** Re-renders when anything on this device is added or removed (for `has()` checks while drawing). */
export const useStoreVersion = (): number =>
  useSyncExternalStore(
    onStoreChange,
    () => version,
    () => 0,
  );

export function onStoreChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function db(): Promise<IDBPDatabase<MediaDB> | null> {
  dbPromise ??= (async () => {
    if (typeof indexedDB === 'undefined') return null;
    try {
      return await openDB<MediaDB>(DB_NAME, 1, {
        upgrade(database) {
          const store = database.createObjectStore('blobs', { keyPath: 'sha256' });
          store.createIndex('byConversation', 'conversationIds', { multiEntry: true });
        },
        // Another tab is deleting the database (sign-out): let it.
        blocking(_current, _next, event) {
          (event.target as IDBDatabase).close();
          dbPromise = null;
        },
        terminated() {
          dbPromise = null;
        },
      });
    } catch {
      return null;
    }
  })();
  return dbPromise;
}

function broadcast(message: Message) {
  try {
    channel?.postMessage(message);
  } catch {
    /* the channel was closed */
  }
}

function listenToOtherTabs() {
  if (channel || typeof BroadcastChannel === 'undefined') return;
  channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (e: MessageEvent<Message>) => {
    const m = e.data;
    if (m.type === 'put') index.set(m.sha, new Set(m.conversationIds));
    else if (m.type === 'delete') {
      index.delete(m.sha);
      dropUrl(m.sha);
    } else if (m.type === 'clear') {
      index.clear();
      holds.clear();
      for (const sha of [...urls.keys()]) dropUrl(sha);
    }
    emit();
  };
}

function dropUrl(sha: string) {
  if (holds.has(sha)) return; // still shown from the in-flight send
  const url = urls.get(sha);
  if (url) URL.revokeObjectURL(url);
  urls.delete(sha);
  urlLoads.delete(sha);
}

// ---- reading --------------------------------------------------------------------------------

/** Loads the index of what this device holds. Every holder check awaits it. */
export function loadIndex(): Promise<void> {
  listenToOtherTabs();
  indexLoad ??= (async () => {
    const database = await db();
    if (!database) return;
    try {
      let cursor = await database.transaction('blobs').store.openCursor();
      while (cursor) {
        index.set(cursor.value.sha256, new Set(cursor.value.conversationIds));
        cursor = await cursor.continue();
      }
    } catch {
      /* unreadable database: start empty */
    }
    emit();
  })();
  return indexLoad;
}

const tagged = (ids: Set<string> | undefined, conversationId?: string) =>
  Boolean(ids) && (conversationId === undefined || ids!.has(conversationId));

/** Synchronous, for rendering. With a conversation id: only if tagged with that conversation. */
export function has(sha: string, conversationId?: string): boolean {
  return (
    tagged(index.get(sha), conversationId) ||
    tagged(holds.get(sha)?.conversationIds, conversationId)
  );
}

/** Like `has`, but also asks IndexedDB (another tab may have just written it). */
export async function hasAsync(sha: string, conversationId?: string): Promise<boolean> {
  await loadIndex();
  if (has(sha, conversationId)) return true;
  const record = await readRecord(sha);
  if (!record) return false;
  index.set(sha, new Set(record.conversationIds));
  return tagged(index.get(sha), conversationId);
}

async function readRecord(sha: string): Promise<MediaRecord | undefined> {
  const database = await db();
  if (!database) return fallback.get(sha);
  try {
    return await database.get('blobs', sha);
  } catch {
    return undefined;
  }
}

/** The bytes: an in-flight send first, then IndexedDB. */
export async function get(sha: string): Promise<Blob | undefined> {
  const held = holds.get(sha);
  if (held) return held.blob;
  return (await readRecord(sha))?.blob;
}

/** A cached object URL for the session (one per file, so every tile shares it). */
export function urlFor(sha: string): Promise<string> {
  const cached = urls.get(sha);
  if (cached) return Promise.resolve(cached);
  let pending = urlLoads.get(sha);
  if (!pending) {
    pending = get(sha).then((blob) => {
      urlLoads.delete(sha);
      if (!blob) throw new Error('Not on this device');
      const existing = urls.get(sha);
      if (existing) return existing;
      const url = URL.createObjectURL(blob);
      urls.set(sha, url);
      return url;
    });
    pending.catch(() => urlLoads.delete(sha));
    urlLoads.set(sha, pending);
  }
  return pending;
}

/** The URL already on screen if there is one (synchronous; no lookup). */
export const peekUrl = (sha: string): string | undefined => urls.get(sha);

/** Reuse the composer's preview URL for a sent file, so its bubble never flickers. */
export function registerUrl(sha: string, url: string): void {
  if (!urls.has(sha)) urls.set(sha, url);
}

// ---- writing --------------------------------------------------------------------------------

/** A send in flight: servable at once, before it reaches IndexedDB. */
export function holdInMemory(
  sha: string,
  blob: Blob,
  conversationId: string,
  poster = false,
): void {
  const held = holds.get(sha);
  if (held) held.conversationIds.add(conversationId);
  else holds.set(sha, { blob, conversationIds: new Set([conversationId]), poster });
  emit();
}

/** A discarded pending send. */
export function releaseMemory(sha: string): void {
  if (!holds.delete(sha)) return;
  if (!index.has(sha)) dropUrl(sha);
  emit();
}

/** Moves a held send into IndexedDB once the server has confirmed the message. */
export async function persist(
  sha: string,
  conversationId: string,
  origin: MediaRecord['origin'],
): Promise<void> {
  const held = holds.get(sha);
  if (!held) return;
  await put(sha, held.blob, held.blob.type, conversationId, origin, held.poster);
  holds.delete(sha);
}

export async function put(
  sha: string,
  blob: Blob,
  mime: string,
  conversationId: string,
  origin: MediaRecord['origin'],
  poster = false,
): Promise<void> {
  await loadIndex();
  if (!askedPersist) {
    askedPersist = true;
    // Ask the browser not to evict media under storage pressure (best effort).
    void navigator.storage?.persist?.().catch(() => undefined);
  }
  const database = await db();
  const existing = await readRecord(sha);
  const conversationIds = [...new Set([...(existing?.conversationIds ?? []), conversationId])];
  const record: MediaRecord = existing
    ? { ...existing, conversationIds }
    : {
        sha256: sha,
        blob: blob.type === mime ? blob : new Blob([blob], { type: mime }),
        mime,
        size: blob.size,
        conversationIds,
        origin,
        savedAt: Date.now(),
        poster,
      };
  if (database) {
    try {
      await database.put('blobs', record);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        toast.error('This device is out of space for photos and videos. Clear some in Settings.');
      }
      throw err;
    }
  } else fallback.set(sha, record);
  index.set(sha, new Set(conversationIds));
  broadcast({ type: 'put', sha, conversationIds });
  emit();
}

/** You left (or lost) a conversation: untag its media and delete what no other chat uses. */
export async function forgetConversation(conversationId: string): Promise<void> {
  await loadIndex();
  const database = await db();
  const affected = [...index].filter(([, ids]) => ids.has(conversationId)).map(([sha]) => sha);
  for (const sha of affected) {
    const record = await readRecord(sha);
    const rest = (record?.conversationIds ?? []).filter((id) => id !== conversationId);
    if (rest.length === 0) {
      if (database) await database.delete('blobs', sha).catch(() => undefined);
      else fallback.delete(sha);
      index.delete(sha);
      dropUrl(sha);
      broadcast({ type: 'delete', sha });
    } else if (record) {
      const next = { ...record, conversationIds: rest };
      if (database) await database.put('blobs', next).catch(() => undefined);
      else fallback.set(sha, next);
      index.set(sha, new Set(rest));
      broadcast({ type: 'put', sha, conversationIds: rest });
    }
  }
  for (const [, held] of holds) held.conversationIds.delete(conversationId);
  emit();
}

export interface Usage {
  bytes: number;
  photos: number;
  videos: number;
  quota?: number;
}

export async function usage(): Promise<Usage> {
  const database = await db();
  const out: Usage = { bytes: 0, photos: 0, videos: 0 };
  const count = (r: Pick<MediaRecord, 'size' | 'mime' | 'poster'>) => {
    out.bytes += r.size;
    if (r.poster) return;
    if (r.mime.startsWith('video/')) out.videos += 1;
    else out.photos += 1;
  };
  if (database) {
    try {
      let cursor = await database.transaction('blobs').store.openCursor();
      while (cursor) {
        count(cursor.value);
        cursor = await cursor.continue();
      }
    } catch {
      /* unreadable: report what we have */
    }
  } else fallback.forEach(count);
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.quota) out.quota = estimate.quota;
  } catch {
    /* not supported */
  }
  return out;
}

/** Everything on this device, gone (sign-out, or "Clear…" in Settings). */
export async function clearAll(): Promise<void> {
  const database = await db();
  if (database) {
    await database.clear('blobs').catch(() => undefined);
    database.close();
  }
  dbPromise = null;
  indexLoad = null;
  // Deleting can wait on other tabs closing their connection; the data is already cleared.
  await Promise.race([
    deleteDB(DB_NAME).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 1000)),
  ]);
  index.clear();
  holds.clear();
  fallback.clear();
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
  urlLoads.clear();
  broadcast({ type: 'clear' });
  emit();
}
