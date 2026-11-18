import type { ApolloClient } from '@apollo/client';
import { useSyncExternalStore } from 'react';
import { MEDIA_CONFIG, type MediaConfig } from '@/lib/gql';

let current: MediaConfig | null = null;
let loading: Promise<MediaConfig | null> | null = null;
const listeners = new Set<() => void>();

/** Loads the server's media limits once per session (null if the server can't be asked). */
export function loadMediaConfig(client: ApolloClient<object>): Promise<MediaConfig | null> {
  loading ??= client
    .query({ query: MEDIA_CONFIG, fetchPolicy: 'network-only' })
    .then(({ data }) => {
      current = data.mediaConfig;
      listeners.forEach((l) => l());
      return current;
    })
    .catch(() => {
      loading = null; // try again next time
      return null;
    });
  return loading;
}

export const getMediaConfig = (): MediaConfig | null => current;

/** For tests and the dev gallery. */
export function setMediaConfig(config: MediaConfig | null): void {
  current = config;
  loading = config ? Promise.resolve(config) : null;
  listeners.forEach((l) => l());
}

export const resetMediaConfig = () => setMediaConfig(null);

export const useMediaConfig = (): MediaConfig | null =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => null,
  );
