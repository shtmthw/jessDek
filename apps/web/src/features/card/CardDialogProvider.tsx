import { useQuery } from '@apollo/client';
import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { CARD } from '@/lib/gql';
import { useViewer } from '../session/ViewerProvider';
import { CardDialog } from './lazy';
import type { CardUser } from './CardView';
import { parseCard } from './recipe';
import { useStartChat } from './useStartChat';

const OpenCard = createContext<((user: CardUser) => void) | null>(null);

/** `openCard(user)` shows that person's card in a dialog, from anywhere in the signed-in app. */
export function useOpenCard(): (user: CardUser) => void {
  const open = useContext(OpenCard);
  if (!open) throw new Error('useOpenCard must be used inside CardDialogProvider');
  return open;
}

/** One card dialog for the whole app. */
export function CardDialogProvider({ children }: { children: ReactNode }) {
  const viewer = useViewer();
  const [user, setUser] = useState<CardUser | null>(null);
  const [open, setOpen] = useState(false);
  const { start, busy } = useStartChat();

  const { data, loading } = useQuery(CARD, {
    variables: { username: user?.username ?? '' },
    skip: !user,
    fetchPolicy: 'cache-and-network',
  });

  const openCard = useCallback((u: CardUser) => {
    setUser(u);
    setOpen(true);
  }, []);

  const fetched = data?.card && data.card.user.username === user?.username ? data.card : null;
  const card = useMemo(
    () => (fetched ? parseCard(fetched.recipe) : loading || !data ? undefined : null),
    [fetched, loading, data],
  );
  const shown = fetched?.user ?? user;
  const own = user?.username === viewer.username;

  return (
    <OpenCard.Provider value={openCard}>
      {children}
      {shown ? (
        <Suspense fallback={null}>
          <CardDialog
            open={open}
            onOpenChange={setOpen}
            user={shown}
            card={card}
            own={own}
            messaging={busy}
            onMessage={
              own
                ? undefined
                : () =>
                    void start(shown.username).then((ok) => {
                      if (ok) setOpen(false);
                    })
            }
          />
        </Suspense>
      ) : null}
    </OpenCard.Provider>
  );
}
