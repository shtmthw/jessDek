import { useMutation, useQuery } from '@apollo/client';
import { useCallback } from 'react';
import { CARD, UPDATE_CARD } from '@/lib/gql';
import { useViewer } from '../session/ViewerProvider';

/** Your own card as the server has it, and a way to save it. */
export interface MyCard {
  /** Card recipe JSON; null is the default card. */
  recipe: string | null;
  /** Signed-out visitors can open /@username. */
  shared: boolean;
}

export interface SaveCardInput {
  recipe?: string | null;
  shared?: boolean;
}

export function useMyCard() {
  const viewer = useViewer();
  const { data, loading, error } = useQuery(CARD, {
    variables: { username: viewer.username },
    fetchPolicy: 'cache-and-network',
  });
  const [update, { loading: saving }] = useMutation(UPDATE_CARD);
  const save = useCallback(
    async (input: SaveCardInput) => {
      await update({ variables: { input } });
    },
    [update],
  );
  const card = data?.card;
  const mine: MyCard | null = card ? { recipe: card.recipe, shared: card.shared ?? false } : null;
  return { data: mine, loading, error: error ?? null, save, saving };
}
