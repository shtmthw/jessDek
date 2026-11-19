import { useMutation } from '@apollo/client';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { REACT, type Reaction } from '@/lib/gql';
import { useViewer } from '../../session/ViewerProvider';
import { applyReaction, myReaction, toggleTarget } from './reactions';
import { pushRecent } from './recent';

/**
 * Reacting to a message. The chip changes at once (an optimistic answer); if the server says no,
 * Apollo puts the old reactions back and a toast explains.
 */
export function useReact() {
  const viewer = useViewer();
  const [mutate] = useMutation(REACT);
  return useCallback(
    (message: { id: string; reactions?: readonly Reaction[] }, picked: string | null) => {
      const current = message.reactions ?? [];
      const emoji = toggleTarget(myReaction(current, viewer.id), picked);
      if (emoji) pushRecent(emoji);
      mutate({
        variables: { messageId: message.id, emoji },
        optimisticResponse: {
          react: {
            __typename: 'Message',
            id: message.id,
            reactions: applyReaction(current, viewer, emoji),
          },
        },
      }).catch((err: { graphQLErrors?: Array<{ message: string }> }) => {
        toast.error(err.graphQLErrors?.[0]?.message ?? 'Couldn’t react. Try again.');
      });
    },
    [mutate, viewer],
  );
}
