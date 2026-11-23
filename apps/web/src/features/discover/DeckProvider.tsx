import { useApolloClient } from '@apollo/client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { DECK_CARDS, DECK_START, type Card } from '@/lib/gql';
import { DeckStore, type DeckSnapshot } from './deckStore';

/*
 * One deck for the whole signed-in app, above the routes: going from the front page to the fan, and
 * from a card back to the deck ("Back to CD"), reuses it with no new requests (CARD_LOADING.md §6).
 */

const DeckContext = createContext<DeckStore<Card> | null>(null);

/** Resolves just after the next frame is painted. */
const afterPaint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

const staleListeners = new Set<() => void>();
/** Your interests changed (card saved): the next visit to Discover deals a new deck. */
export function markDeckStale() {
  staleListeners.forEach((fn) => fn());
}

export function DeckProvider({ children }: { children: ReactNode }) {
  const client = useApolloClient();
  const [store] = useState(
    () =>
      new DeckStore<Card>(
        async () => {
          const { data } = await client.query({ query: DECK_START, fetchPolicy: 'no-cache' });
          return data.deckStart;
        },
        async (dir, cursor, limit) => {
          // The move that asked for these is animating: start the request after its next frame.
          await afterPaint();
          const { data } = await client.query({
            query: DECK_CARDS,
            variables: { dir, cursor, limit },
            fetchPolicy: 'no-cache',
          });
          return data.deckCards.cards;
        },
        // §7 metrics: visible in the dev console; production keeps them in `store.metrics()`.
        { onEvent: import.meta.env.DEV ? (e) => console.debug('[deck]', e) : undefined },
      ),
  );

  useEffect(() => {
    const reset = () => store.reset();
    staleListeners.add(reset);
    const report = () => {
      if (import.meta.env.DEV) console.debug('[deck] session', store.metrics());
    };
    window.addEventListener('pagehide', report);
    return () => {
      staleListeners.delete(reset);
      window.removeEventListener('pagehide', report);
    };
  }, [store]);

  return <DeckContext.Provider value={store}>{children}</DeckContext.Provider>;
}

export function useDeckStore(): DeckStore<Card> {
  const store = useContext(DeckContext);
  if (!store) throw new Error('useDeckStore needs a DeckProvider');
  return store;
}

/** The deck and its current state (re-renders on every change). */
export function useDeck(): { store: DeckStore<Card>; snap: DeckSnapshot<Card> } {
  const store = useDeckStore();
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { store, snap };
}
