import { useApolloClient, useMutation } from '@apollo/client';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { removeConversation, upsertConversation } from '@/lib/cacheUpdates';
import {
  BLOCK_USER,
  HIDE_CONVERSATION,
  MUTE_CONVERSATION,
  REMOVE_MEMBER,
  START_DIRECT,
  UNBLOCK_USER,
  type Conversation,
  type User,
} from '@/lib/gql';

const messageOf = (err: unknown) =>
  (err as { graphQLErrors?: Array<{ message: string }> }).graphQLErrors?.[0]?.message ??
  'Something went wrong. Try again.';
const firstName = (name: string) => name.split(' ')[0] ?? name;

/**
 * Mute, block, remove: the actions behind the chat menu, group info and Settings, each with the
 * toast (and an Undo where it makes sense) that confirms it happened.
 */
export function useChatActions() {
  const client = useApolloClient();
  const navigate = useNavigate();
  const [muteMutation] = useMutation(MUTE_CONVERSATION);
  const [blockMutation] = useMutation(BLOCK_USER);
  const [unblockMutation] = useMutation(UNBLOCK_USER);
  const [hideMutation] = useMutation(HIDE_CONVERSATION);
  const [removeMutation] = useMutation(REMOVE_MEMBER);
  const [startDirect] = useMutation(START_DIRECT);

  // The server re-announces the direct chat and presence; the blocked list is just refetched.
  const refreshBlocks = () =>
    client.refetchQueries({ include: ['BlockedUsers'] }).catch(() => undefined);

  async function mute(conversation: Conversation, muted: boolean) {
    try {
      await muteMutation({ variables: { conversationId: conversation.id, muted } });
      toast.success(muted ? `Muted ${conversation.title}` : `Unmuted ${conversation.title}`);
    } catch (err) {
      toast.error(messageOf(err));
    }
  }

  async function unblock(user: Pick<User, 'id' | 'displayName'>, { quiet = false } = {}) {
    try {
      await unblockMutation({ variables: { userId: user.id } });
      void refreshBlocks();
      if (!quiet) toast.success(`Unblocked ${firstName(user.displayName)}`);
    } catch (err) {
      toast.error(messageOf(err));
    }
  }

  async function block(user: Pick<User, 'id' | 'displayName'>) {
    try {
      await blockMutation({ variables: { userId: user.id } });
      void refreshBlocks();
      toast.success(`Blocked ${firstName(user.displayName)}`, {
        description: 'They can’t message you or add you to groups.',
        action: { label: 'Undo', onClick: () => void unblock(user, { quiet: true }) },
      });
    } catch (err) {
      toast.error(messageOf(err));
    }
  }

  /** Removes a direct chat from your list (it comes back with their next message). */
  async function hide(conversation: Conversation) {
    try {
      await hideMutation({ variables: { conversationId: conversation.id } });
      navigate('/', { replace: true });
      removeConversation(client, conversation.id);
      const peer = conversation.peer;
      toast.success('Chat removed', {
        description: 'It comes back if they message you.',
        action: peer
          ? {
              label: 'Undo',
              onClick: () =>
                void startDirect({ variables: { username: peer.username } }).then(({ data }) => {
                  if (!data) return;
                  upsertConversation(client, data.startDirect);
                  navigate(`/c/${data.startDirect.id}`);
                }),
            }
          : undefined,
      });
    } catch (err) {
      toast.error(messageOf(err));
    }
  }

  async function removeMember(conversation: Conversation, user: User) {
    try {
      await removeMutation({ variables: { conversationId: conversation.id, userId: user.id } });
      toast.success(`Removed ${firstName(user.displayName)} from ${conversation.title}`);
    } catch (err) {
      toast.error(messageOf(err));
    }
  }

  return { mute, block, unblock, hide, removeMember };
}
