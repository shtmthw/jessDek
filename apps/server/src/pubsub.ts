import { createPubSub } from 'graphql-yoga';
import type { Peer } from './services/peers.js';
import type { ServerEvent } from './types.js';

export const pubsub = createPubSub<{ [topic: string]: [ServerEvent] }>();

export const userTopic = (userId: string) => `user:${userId}`;

export function publishToUsers(userIds: Iterable<string>, event: ServerEvent): void {
  for (const id of new Set(userIds)) pubsub.publish(userTopic(id), event);
}

/** Delivered through the user's topic; the `events` subscription drops it for every other tab. */
export function publishToPeer(peer: Peer, event: ServerEvent): void {
  pubsub.publish(userTopic(peer.userId), event);
}
