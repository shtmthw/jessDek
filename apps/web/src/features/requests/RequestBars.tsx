import { useApolloClient, useMutation } from '@apollo/client';
import { Clock, MessageSquareOff } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/Button';
import { removeConversation, upsertConversation } from '@/lib/cacheUpdates';
import { RESPOND_TO_REQUEST, type Conversation } from '@/lib/gql';
import { spring } from '@/lib/motion';
import { useChatActions } from '../chat/useChatActions';
import { firstName } from './inbox';

const messageOf = (err: unknown) =>
  (err as { graphQLErrors?: Array<{ message: string }> }).graphQLErrors?.[0]?.message ??
  'Something went wrong. Try again.';

/** Sits where the composer would, with the composer's spacing. */
function Bar({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <motion.div
      className="chat-column shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1.5 md:pb-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
      role="region"
      aria-label={label}
    >
      {children}
    </motion.div>
  );
}

/** For whoever received the request: Accept, Decline, or Block. */
export function IncomingRequestBar({ conversation }: { conversation: Conversation }) {
  const client = useApolloClient();
  const navigate = useNavigate();
  const actions = useChatActions();
  const [respond] = useMutation(RESPOND_TO_REQUEST);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const peer = conversation.peer;
  const name = firstName(peer?.displayName ?? conversation.title);

  async function answer(accept: boolean) {
    setBusy(accept ? 'accept' : 'decline');
    try {
      const { data } = await respond({
        variables: { conversationId: conversation.id, accept },
      });
      if (accept && data?.respondToRequest) {
        upsertConversation(client, data.respondToRequest);
      } else {
        navigate('/requests', { replace: true });
        removeConversation(client, conversation.id);
        toast.success('Request declined', {
          description: `${name} can’t message you again unless you reach out.`,
        });
      }
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Bar label="Message request">
      <div className="rounded-[1.5rem] border border-border bg-background px-4 py-3.5 shadow-sm">
        <p className="text-center text-sm font-semibold tracking-tight">
          {name} wants to message you
        </p>
        <p className="mx-auto mt-0.5 max-w-sm text-center text-xs text-muted-foreground">
          They won’t know you’ve seen this unless you accept.
        </p>
        <div className="mt-3 flex items-center gap-2">
          {peer ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger hover:bg-danger/10 hover:text-danger"
              disabled={busy !== null}
              onClick={() => {
                void actions.block(peer).then(() => {
                  navigate('/requests', { replace: true });
                  removeConversation(client, conversation.id);
                });
              }}
            >
              Block
            </Button>
          ) : null}
          <span className="flex-1" />
          <Button
            variant="secondary"
            size="sm"
            loading={busy === 'decline'}
            disabled={busy !== null}
            onClick={() => void answer(false)}
          >
            Decline
          </Button>
          <Button
            size="sm"
            className="px-5"
            loading={busy === 'accept'}
            disabled={busy !== null}
            onClick={() => void answer(true)}
          >
            Accept
          </Button>
        </div>
      </div>
    </Bar>
  );
}

/** For whoever sent it, once the one message is out: waiting, or declined. */
export function SentRequestBar({ conversation }: { conversation: Conversation }) {
  const name = firstName(conversation.peer?.displayName ?? conversation.title);
  const declined = conversation.request?.state === 'DECLINED';
  const Icon = declined ? MessageSquareOff : Clock;
  return (
    <Bar label="Message request">
      <div
        role="status"
        className="flex min-h-13 items-center justify-center gap-2.5 rounded-[1.5rem] bg-muted/70 px-4 py-2 text-center text-sm text-muted-foreground"
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        {declined ? (
          <span>{name} declined your message request.</span>
        ) : (
          <span>
            <span className="font-medium text-foreground">Request sent</span> · {name} can accept or
            decline
          </span>
        )}
      </div>
    </Bar>
  );
}

/** Above the request composer, before the one message is sent. */
export function RequestHint({ conversation }: { conversation: Conversation }) {
  const name = firstName(conversation.peer?.displayName ?? conversation.title);
  return (
    <p className="chat-column -mb-0.5 pt-1 text-center text-xs text-muted-foreground">
      {name} gets this as a request. You can send one message, text only, until they accept.
    </p>
  );
}
