import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { accept, PrepareError, prepare, type PreparedAttachment } from './prepare';

/**
 * The composer's tray of photos and videos waiting to be sent, one per chat. Kept in memory so
 * switching chats and coming back keeps them (a reload does not: the files are gone with the page).
 */
export interface TrayItem {
  localId: string;
  /** The file as picked; HD toggling re-prepares from it. */
  source: File;
  kind: 'IMAGE' | 'VIDEO';
  /** Photos show at once from the original; videos once their poster frame is ready. */
  previewUrl: string | null;
  status: 'preparing' | 'ready' | 'failed';
  prepared?: PreparedAttachment;
  /** Settles when the file is ready to send (rejects with a PrepareError). */
  done: Promise<PreparedAttachment>;
  /** The photo this item was prepared as (a re-prepare for the other quality replaces it). */
  hd: boolean;
}

const EMPTY: TrayItem[] = [];
const trays = new Map<string, TrayItem[]>();
const hdFlags = new Map<string, boolean>();
const listeners = new Set<() => void>();
/** Sends that have left a tray but aren't confirmed by the server yet. */
let unsent = 0;

const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export const getTray = (key: string): TrayItem[] => trays.get(key) ?? EMPTY;
export const getHd = (key: string): boolean => hdFlags.get(key) ?? false;
export const hasTray = (key: string): boolean => getTray(key).length > 0;

export const useTray = (key: string): TrayItem[] =>
  useSyncExternalStore(
    subscribe,
    () => getTray(key),
    () => EMPTY,
  );
export const useHd = (key: string): boolean =>
  useSyncExternalStore(
    subscribe,
    () => getHd(key),
    () => false,
  );

function patch(key: string, localId: string, change: Partial<TrayItem>) {
  const list = trays.get(key);
  if (!list?.some((i) => i.localId === localId)) return;
  trays.set(
    key,
    list.map((i) => (i.localId === localId ? { ...i, ...change } : i)),
  );
  emit();
}

function revoke(item: TrayItem) {
  const urls = new Set([item.previewUrl, item.prepared?.previewUrl]);
  for (const url of urls) if (url) URL.revokeObjectURL(url);
}

function start(key: string, source: File, hd: boolean): TrayItem {
  const p = prepare(source, { hd });
  const item: TrayItem = {
    localId: p.localId,
    source,
    kind: p.kind,
    previewUrl: p.previewUrl,
    status: 'preparing',
    done: p.done,
    hd,
  };
  p.done.then(
    (prepared) =>
      patch(key, item.localId, { status: 'ready', prepared, previewUrl: prepared.previewUrl }),
    (err: unknown) => {
      patch(key, item.localId, { status: 'failed' });
      toast.error(err instanceof PrepareError ? err.message : `“${source.name}” can’t be sent.`);
      // Long enough for the tile to shake, then it goes.
      setTimeout(() => removeItem(key, item.localId), 450);
    },
  );
  return item;
}

/** Adds picked, pasted or dropped files. Returns how many were accepted. */
export function addFiles(key: string, files: File[]): number {
  const existing = getTray(key);
  const { accepted, rejected } = accept(files, existing.length);
  // One toast per distinct reason, so dropping twenty files doesn't bury the screen.
  for (const reason of new Set(rejected.map((r) => r.reason))) toast.error(reason);
  if (accepted.length === 0) return 0;
  const hd = getHd(key);
  trays.set(key, [...existing, ...accepted.map((f) => start(key, f, hd))]);
  emit();
  return accepted.length;
}

export function removeItem(key: string, localId: string): void {
  const list = trays.get(key);
  const item = list?.find((i) => i.localId === localId);
  if (!list || !item) return;
  revoke(item);
  const rest = list.filter((i) => i.localId !== localId);
  if (rest.length) trays.set(key, rest);
  else trays.delete(key);
  emit();
}

/** Switches photos between standard and high quality (re-encodes them). */
export function setHd(key: string, hd: boolean): void {
  if (getHd(key) === hd) return;
  hdFlags.set(key, hd);
  const list = getTray(key);
  trays.set(
    key,
    list.map((item) => {
      if (item.kind !== 'IMAGE') return item;
      revoke(item);
      return start(key, item.source, hd);
    }),
  );
  emit();
}

/** The tray goes out with a message: the previews now belong to the message, so they stay alive. */
export function takeTray(key: string): TrayItem[] {
  const list = getTray(key);
  trays.delete(key);
  hdFlags.delete(key);
  emit();
  return list;
}

/** Throws a tray away (and its previews). */
export function discardTray(key: string): void {
  for (const item of getTray(key)) revoke(item);
  trays.delete(key);
  hdFlags.delete(key);
  emit();
}

export function trackUnsent(delta: 1 | -1): void {
  unsent = Math.max(0, unsent + delta);
}

/** Anything the user would lose by closing the tab right now. */
export const hasUnsentMedia = (): boolean =>
  unsent > 0 || [...trays.values()].some((t) => t.length > 0);

/** Sign-out and tests. */
export function clearTrays(): void {
  for (const list of trays.values()) list.forEach(revoke);
  trays.clear();
  hdFlags.clear();
  unsent = 0;
  emit();
}
