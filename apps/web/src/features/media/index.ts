import type { ApolloClient } from '@apollo/client';
import { gql } from '@apollo/client';
import { onSignOut } from '@/lib/sessionHooks';
import { loadMediaConfig, resetMediaConfig } from './config';
import { clearDownloads, retryUnavailable, setMembershipResolver } from './downloads';
import { clearSinks } from './fetch';
import { UNAVAILABLE_RETRY_MS } from './limits';
import * as peer from './peer';
import { rotatePeerId } from './peerId';
import * as relay from './relay';
import { clearServes } from './serve';
import { clearSignals } from './signals';
import * as store from './store';
import { clearTransfers } from './transfers';
import { clearTrays } from './trayStore';

/**
 * Photos and videos, device to device (MEDIA_PLAN.md). The server stores metadata only; bytes
 * live in this browser's IndexedDB and travel over WebRTC data channels, or the in-memory relay.
 */
const MEMBERS = gql`
  fragment MediaMembers on Conversation {
    members {
      id
    }
  }
`;

/** Starts the media engine for a signed-in session. Returns a cleanup for unmount. */
export function initMedia(client: ApolloClient<object>): () => void {
  void loadMediaConfig(client);
  void store.loadIndex();
  setMembershipResolver((conversationId, userId) => {
    const data = client.cache.readFragment<{ members: { id: string }[] }>({
      id: client.cache.identify({ __typename: 'Conversation', id: conversationId }),
      fragment: MEMBERS,
    });
    return data ? data.members.some((m) => m.id === userId) : true;
  });
  // Files nobody could send are retried now and then while the tab is in front of someone.
  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') retryUnavailable();
  }, UNAVAILABLE_RETRY_MS);
  return () => clearInterval(timer);
}

/** Sign-out: everything media on this device goes (bytes, URLs, connections, downloads). */
export async function shutdownMedia(): Promise<void> {
  peer.closeAll();
  relay.closeAll();
  clearDownloads();
  clearSinks();
  clearServes();
  clearSignals();
  clearTransfers();
  clearTrays();
  resetMediaConfig();
  rotatePeerId();
  await store.clearAll();
}

onSignOut(shutdownMedia);

export { handleMediaRequested, handleMediaSignal } from './signals';
export { hasActiveSends } from './transfers';
export { hasUnsentMedia } from './trayStore';
