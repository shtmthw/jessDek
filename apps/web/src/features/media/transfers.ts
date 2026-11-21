import { useMemo, useSyncExternalStore } from 'react';

/** Files this tab is sending to others right now, by hash (drives "Sharing with Bob · 45%"). */
export interface Sharing {
  active: number;
  peers: string[];
  progress: number;
}

interface Serve {
  userId: string;
  sent: number;
  size: number;
}

const serves = new Map<string, Set<Serve>>();
const snapshots = new Map<string, Sharing | undefined>();
const listeners = new Set<() => void>();

let version = 0;

function update(sha: string) {
  version += 1;
  const set = serves.get(sha);
  if (!set || set.size === 0) {
    serves.delete(sha);
    snapshots.delete(sha);
  } else {
    let sent = 0;
    let size = 0;
    for (const s of set) {
      sent += s.sent;
      size += s.size;
    }
    snapshots.set(sha, {
      active: set.size,
      peers: [...new Set([...set].map((s) => s.userId))],
      progress: size ? sent / size : 0,
    });
  }
  listeners.forEach((l) => l());
}

export function startServe(sha: string, userId: string, size: number, offset = 0) {
  const serve: Serve = { userId, sent: offset, size };
  let set = serves.get(sha);
  if (!set) serves.set(sha, (set = new Set()));
  set.add(serve);
  update(sha);
  let last = 0;
  return {
    progress(sent: number) {
      serve.sent = sent;
      const now = Date.now();
      if (now - last > 100) {
        last = now;
        update(sha);
      }
    },
    end() {
      set.delete(serve);
      update(sha);
    },
  };
}

export const hasActiveSends = () => serves.size > 0;

export const getSharing = (sha: string) => snapshots.get(sha);

export const useSharing = (sha: string | undefined): Sharing | undefined =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => (sha ? snapshots.get(sha) : undefined),
    () => undefined,
  );

/** Everything this tab is sending right now for a set of files (a whole album). */
export function useSharingSummary(shas: ReadonlyArray<string | undefined>): Sharing | undefined {
  const v = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
    () => 0,
  );
  const key = shas.join(',');
  return useMemo(() => {
    let active = 0;
    let sent = 0;
    let total = 0;
    const peers = new Set<string>();
    for (const sha of shas) {
      const set = sha ? serves.get(sha) : undefined;
      if (!set) continue;
      for (const s of set) {
        active += 1;
        sent += s.sent;
        total += s.size;
        peers.add(s.userId);
      }
    }
    return active ? { active, peers: [...peers], progress: total ? sent / total : 0 } : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, v]);
}

export function clearTransfers(): void {
  serves.clear();
  snapshots.clear();
  listeners.forEach((l) => l());
}
