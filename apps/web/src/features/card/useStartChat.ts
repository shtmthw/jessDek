import { useApolloClient, useMutation } from '@apollo/client';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { upsertConversation } from '@/lib/cacheUpdates';
import { START_DIRECT } from '@/lib/gql';
import { expectOwnConversation } from '@/lib/sounds';

const messageOf = (err: unknown) =>
  (err as { graphQLErrors?: Array<{ message: string }> }).graphQLErrors?.[0]?.message ??
  'Couldn’t open the chat. Try again.';

/** Opens (or starts) the direct chat with someone, the way New chat does. */
export function useStartChat() {
  const client = useApolloClient();
  const navigate = useNavigate();
  const [startDirect] = useMutation(START_DIRECT);
  const [busy, setBusy] = useState(false);
  const start = useCallback(
    async (username: string): Promise<boolean> => {
      setBusy(true);
      expectOwnConversation();
      try {
        const { data } = await startDirect({ variables: { username } });
        if (!data) return false;
        upsertConversation(client, data.startDirect);
        navigate(`/c/${data.startDirect.id}`);
        return true;
      } catch (err) {
        toast.error(messageOf(err));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [client, navigate, startDirect],
  );
  return { start, busy };
}
