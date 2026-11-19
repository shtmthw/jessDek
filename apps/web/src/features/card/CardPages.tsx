import { useQuery } from '@apollo/client';
import { useMemo } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { CARD } from '@/lib/gql';
import { useViewer } from '../session/ViewerProvider';
import { CardPage, type CardPageState } from './CardPage';
import { matchCardPath, PENDING_CHAT } from './CardRoute';
import { parseCard } from './recipe';
import { useStartChat } from './useStartChat';

/** The /@username pages, signed out and signed in. Loaded on demand. */

function useCardState(username: string): CardPageState {
  const { data, loading } = useQuery(CARD, {
    variables: { username },
    fetchPolicy: 'cache-and-network',
  });
  return useMemo<CardPageState>(() => {
    if (data?.card)
      return { status: 'ready', user: data.card.user, card: parseCard(data.card.recipe) };
    if (loading || !data) return { status: 'loading' };
    return { status: 'missing' };
  }, [data, loading]);
}

/** /@username for someone who isn't signed in: the card, and a way in. */
export function PublicCardPage({ username }: { username: string }) {
  const navigate = useNavigate();
  const state = useCardState(username);
  return (
    <CardPage
      username={username}
      state={state}
      signedIn={false}
      onMessage={() => {
        try {
          sessionStorage.setItem(PENDING_CHAT, username);
        } catch {
          /* storage blocked: they'll have to find the chat themselves */
        }
        navigate('/');
      }}
      onSignIn={() => navigate('/')}
      onSignUp={() => navigate('/', { state: { auth: 'signup' } })}
    />
  );
}

/** /@username inside the app (shown in the main pane). */
export function SignedInCardPage() {
  const { handle = '' } = useParams();
  const viewer = useViewer();
  const username = matchCardPath(`/${handle}`);
  const state = useCardState(username ?? '');
  const { start, busy } = useStartChat();
  if (!username) return <Navigate to="/" replace />;
  return (
    <CardPage
      username={username}
      state={state}
      signedIn
      own={username === viewer.username}
      onMessage={() => void start(username)}
      messaging={busy}
    />
  );
}
