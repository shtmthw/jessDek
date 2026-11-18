import type { WebSocket } from 'ws';

/** A "peer" is one signed-in browser tab: a random UUID v4 the tab makes on page load. */
export const PEER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface Peer {
  peerId: string;
  userId: string;
  socket: WebSocket;
}

// Like presence, this lives in memory and assumes a single server instance.
const peers = new Map<string, Peer>();
const byUser = new Map<string, Set<string>>();

/** false = this peerId belongs to someone else (refuse the socket). A reconnect by the same user replaces it. */
export function registerPeer(peerId: string, userId: string, socket: WebSocket): boolean {
  const existing = peers.get(peerId);
  if (existing && existing.userId !== userId) return false;
  peers.set(peerId, { peerId, userId, socket });
  let set = byUser.get(userId);
  if (!set) byUser.set(userId, (set = new Set()));
  set.add(peerId);
  return true;
}

/** Removes the peer only if `socket` is still the one registered (late closes after a reconnect are ignored). */
export function unregisterPeer(peerId: string, socket: WebSocket): void {
  const peer = peers.get(peerId);
  if (!peer || peer.socket !== socket) return;
  peers.delete(peerId);
  const set = byUser.get(peer.userId);
  set?.delete(peerId);
  if (set?.size === 0) byUser.delete(peer.userId);
}

export const getPeer = (peerId: string): Peer | undefined => peers.get(peerId);

export function peersOfUsers(userIds: Iterable<string>): Peer[] {
  const out: Peer[] = [];
  for (const userId of new Set(userIds)) {
    for (const peerId of byUser.get(userId) ?? []) {
      const peer = peers.get(peerId);
      if (peer) out.push(peer);
    }
  }
  return out;
}

/** Tests only. */
export function clearPeers(): void {
  peers.clear();
  byUser.clear();
}
