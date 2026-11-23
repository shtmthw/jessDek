import { useApolloClient, useMutation } from '@apollo/client';
import { UsersRound } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Avatar } from '@/components/Avatar';
import { Button, buttonClass } from '@/components/Button';
import { Skeleton } from '@/components/Skeleton';
import { upsertConversation } from '@/lib/cacheUpdates';
import { RESPOND_TO_INVITE, type User } from '@/lib/gql';
import { spring } from '@/lib/motion';
import { applyInvite, firstName, useRequestInbox } from './inbox';
import { PaneHeader } from './RequestsPage';

const messageOf = (err: unknown) =>
  (err as { graphQLErrors?: Array<{ message: string }> }).graphQLErrors?.[0]?.message ??
  'Something went wrong. Try again.';

/** "Carol, Alice and Bob", or "Carol, Alice, Bob and 4 others". */
function namesOf(users: User[]): string {
  const names = users.map((u) => firstName(u.displayName));
  if (names.length <= 1) return names.join('');
  if (names.length <= 4) return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  const rest = names.length - 3;
  return `${names.slice(0, 3).join(', ')} and ${rest} others`;
}

/** An invite to a group: just enough to decide (name, who invited you, who's in it). */
export function InvitePage() {
  const { id = '' } = useParams();
  const client = useApolloClient();
  const navigate = useNavigate();
  const { invites, loading } = useRequestInbox();
  const [respond] = useMutation(RESPOND_TO_INVITE);
  const [busy, setBusy] = useState<'join' | 'decline' | null>(null);
  const invite = invites.find((i) => i.conversationId === id);

  async function answer(accept: boolean) {
    if (!invite) return;
    setBusy(accept ? 'join' : 'decline');
    try {
      const { data } = await respond({ variables: { conversationId: id, accept } });
      applyInvite(client, id, null);
      if (accept && data?.respondToInvite) {
        upsertConversation(client, data.respondToInvite);
        navigate(`/c/${id}`, { replace: true });
        toast.success(`You joined ${invite.name}`);
      } else {
        navigate('/requests', { replace: true });
        toast.success('Invite declined', {
          description: `${firstName(invite.invitedBy.displayName)} will see that you said no.`,
        });
      }
    } catch (err) {
      toast.error(messageOf(err));
      setBusy(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <PaneHeader title="Group invite" back="/requests" />
      <div className="flex flex-1 items-center justify-center px-5 py-10">
        {!invite && loading ? (
          <div className="flex flex-col items-center gap-3" aria-busy>
            <Skeleton className="size-16 rounded-full" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
        ) : !invite ? (
          <motion.div
            className="flex flex-col items-center text-center"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring.soft}
          >
            <div className="mb-3 inline-flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <UsersRound className="size-5" />
            </div>
            <p className="font-semibold">This invite isn’t open anymore</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              It may have been answered on another device, or taken back.
            </p>
            <Link to="/requests" className={buttonClass('secondary', 'md', 'mt-4')}>
              Back to requests
            </Link>
          </motion.div>
        ) : (
          <motion.div
            className="w-full max-w-sm rounded-3xl border border-border bg-surface px-6 pb-6 pt-8 text-center shadow-sm"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={spring.soft}
          >
            <Avatar name={invite.name} group size="lg" className="mx-auto" />
            <h2 className="mt-4 text-xl font-semibold tracking-tight">{invite.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {firstName(invite.invitedBy.displayName)}
              </span>{' '}
              invited you to join
            </p>

            <div className="mt-6 flex flex-col items-center gap-2">
              <div className="flex -space-x-2" aria-hidden>
                {invite.members.slice(0, 5).map((m, i) => (
                  <motion.span
                    key={m.id}
                    className="rounded-full ring-2 ring-surface"
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...spring.soft, delay: 0.06 * i }}
                  >
                    <Avatar name={m.displayName} color={m.avatarColor} avatar={m.avatar} />
                  </motion.span>
                ))}
              </div>
              <p className="text-sm">{namesOf(invite.members)}</p>
              <p className="text-xs text-muted-foreground">
                {invite.members.length} {invite.members.length === 1 ? 'member' : 'members'}
              </p>
            </div>

            <p className="mt-6 text-xs text-muted-foreground">
              You’ll see the group’s messages once you join.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                loading={busy === 'decline'}
                disabled={busy !== null}
                onClick={() => void answer(false)}
              >
                Decline
              </Button>
              <Button
                loading={busy === 'join'}
                disabled={busy !== null}
                onClick={() => void answer(true)}
              >
                Join group
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
