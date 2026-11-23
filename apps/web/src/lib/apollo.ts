import {
  ApolloClient,
  ApolloLink,
  HttpLink,
  InMemoryCache,
  split,
  type FieldFunctionOptions,
  type Reference,
} from '@apollo/client';
import { onError } from '@apollo/client/link/error';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';
import { setConnectionState } from './connection';
import { getPeerId } from '@/features/media/peerId';
import { clearDrafts } from './drafts';
import { ME } from './gql';
import { runSignOutHooks } from './sessionHooks';

interface PageRef {
  hasMore: boolean;
  messages: Reference[];
}

/**
 * Merges pages of a conversation's messages into one list (oldest → newest):
 *  - `before` set: an older page, prepend it
 *  - otherwise: the latest page (first load, reconnect catch-up), merge by id
 */
function mergeMessagePages(
  existing: PageRef | undefined,
  incoming: PageRef,
  { args, readField }: FieldFunctionOptions,
): PageRef {
  if (!existing) return incoming;
  const idOf = (ref: Reference) => readField<string>('id', ref) ?? '';
  const known = new Set(existing.messages.map(idOf));
  const isOlderPage = Boolean(args?.before);

  if (isOlderPage) {
    const fresh = incoming.messages.filter((m) => !known.has(idOf(m)));
    return { hasMore: incoming.hasMore, messages: [...fresh, ...existing.messages] };
  }

  const overlaps = incoming.messages.some((m) => known.has(idOf(m)));
  // More than a page arrived while we weren't looking: keep it simple and start over.
  if (!overlaps && incoming.hasMore && existing.messages.length > 0) return incoming;

  const merged = [...existing.messages, ...incoming.messages.filter((m) => !known.has(idOf(m)))];
  const created = (ref: Reference) => readField<string>('createdAt', ref) ?? '';
  merged.sort((a, b) => created(a).localeCompare(created(b)) || idOf(a).localeCompare(idOf(b)));
  return {
    hasMore: existing.hasMore && incoming.hasMore ? true : existing.hasMore,
    messages: merged,
  };
}

const cache = new InMemoryCache({
  typePolicies: {
    Query: {
      fields: {
        messages: { keyArgs: ['conversationId'], merge: mergeMessagePages },
        // The chat list and pending invites always arrive whole (a fetch, or the list after a
        // live change): replace them.
        conversations: { merge: false },
        invites: { merge: false },
      },
    },
    MessagePage: { keyFields: false },
    // A group's invites (no ids of their own) are always sent whole: replace them.
    Conversation: { fields: { invites: { merge: false } } },
    // A message's reactions always arrive whole (from a fetch, a reaction or a live event): replace them.
    Message: { fields: { reactions: { merge: false } } },
  },
});

const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';

/** Longest pause between reconnect attempts. The library's default doubles without limit. */
const MAX_RETRY_WAIT_MS = 8000;
let wakeRetry: (() => void) | null = null;
// Coming back online or returning to the tab retries at once instead of sitting out the timer.
if (typeof window !== 'undefined') {
  const wake = () => wakeRetry?.();
  window.addEventListener('online', wake);
  window.addEventListener('focus', wake);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') wake();
  });
}

/** Exponential backoff (1s, 2s, 4s…) capped at a few seconds, with jitter, that can be woken early. */
function retryWait(retries: number) {
  return new Promise<void>((resolve) => {
    const delay = Math.min(1000 * 2 ** retries, MAX_RETRY_WAIT_MS) + Math.random() * 700;
    const done = () => {
      clearTimeout(timer);
      if (wakeRetry === done) wakeRetry = null;
      resolve();
    };
    const timer = setTimeout(done, delay);
    wakeRetry = done;
  });
}

export const wsClient = createClient({
  url: `${wsProtocol}://${location.host}/graphql`,
  lazy: true, // connect only once someone subscribes, i.e. after signing in
  // Identifies this tab for device-to-device photo and video transfers.
  connectionParams: () => ({ peerId: getPeerId() }),
  retryAttempts: Infinity,
  retryWait,
  // While the server is unreachable the browser reports an *error* before the close, and the
  // library's default only retries on closes, so it would give up for good. Always retry; the
  // library still stops on genuinely fatal close codes (e.g. a rejected session).
  shouldRetry: () => true,
  keepAlive: 20_000,
  on: {
    connecting: () => setConnectionState('connecting'),
    connected: () => {
      const { reconnected } = setConnectionState('connected');
      // Catch up on anything missed while the socket was down.
      if (reconnected) void client.refetchQueries({ include: ['Conversations', 'Messages'] });
    },
    closed: (event) => {
      const code = (event as CloseEvent | undefined)?.code;
      setConnectionState(code === 1000 ? 'idle' : 'closed');
      // 4401/4403: the server refused our session. Re-check who we are.
      if (code === 4401 || code === 4403) void client.refetchQueries({ include: ['Me'] });
    },
  },
});

const httpLink = new HttpLink({ uri: '/graphql', credentials: 'same-origin' });
const wsLink = new GraphQLWsLink(wsClient);

// If the session expires mid-use, fall back to the sign-in screen.
let resetting = false;
/**
 * Leaves the signed-in state: shows the sign-in screen first, then drops every cached byte of the
 * previous session so the next person on this device never sees it.
 */
export async function resetSession() {
  if (resetting) return;
  resetting = true;
  clearDrafts();
  try {
    client.writeQuery({ query: ME, data: { me: null } });
    await new Promise((resolve) => setTimeout(resolve, 0)); // let the signed-in screens unmount
    await runSignOutHooks(); // e.g. photos and videos saved on this device
    await client.resetStore();
  } catch {
    /* the Me query will report the problem */
  } finally {
    resetting = false;
  }
}

const authLink = onError(({ graphQLErrors, operation }) => {
  const unauthenticated = graphQLErrors?.some((e) => e.extensions?.code === 'UNAUTHENTICATED');
  if (
    unauthenticated &&
    operation.operationName !== 'SignIn' &&
    operation.operationName !== 'SignUp'
  ) {
    void resetSession();
  }
});

const transport = split(
  ({ query }) => {
    const def = getMainDefinition(query);
    return def.kind === 'OperationDefinition' && def.operation === 'subscription';
  },
  wsLink,
  httpLink,
);

export const client = new ApolloClient({
  cache,
  link: ApolloLink.from([authLink, transport]),
});
