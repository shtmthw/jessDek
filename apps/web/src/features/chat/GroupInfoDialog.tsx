import { useApolloClient, useMutation } from '@apollo/client';
import { LogOut, Pencil, UserPlus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Input } from '@/components/Input';
import { removeConversation } from '@/lib/cacheUpdates';
import { ADD_MEMBERS, LEAVE_GROUP, RENAME_GROUP, type Conversation, type User } from '@/lib/gql';
import { exit, spring } from '@/lib/motion';
import { UserPicker } from '../conversations/NewChatDialog';
import { useViewer } from '../session/ViewerProvider';

const messageOf = (err: unknown) =>
  (err as { graphQLErrors?: Array<{ message: string }> }).graphQLErrors?.[0]?.message ??
  'Something went wrong. Try again.';

const swap = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6, transition: exit.fast },
  transition: spring.soft,
};

export function GroupInfoDialog({
  conversation,
  open,
  onOpenChange,
}: {
  conversation: Conversation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const viewer = useViewer();
  const client = useApolloClient();
  const navigate = useNavigate();
  const [name, setName] = useState(conversation.title);
  const [adding, setAdding] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [renameGroup, rename] = useMutation(RENAME_GROUP);
  const [addMembers] = useMutation(ADD_MEMBERS);
  const [leaveGroup, leave] = useMutation(LEAVE_GROUP);

  useEffect(() => {
    if (open) {
      setName(conversation.title);
      setAdding(false);
      setConfirmLeave(false);
    }
  }, [open, conversation.title]);

  const dirty = name.trim() !== '' && name.trim() !== conversation.title;
  // You first, then whoever is online, then everyone else alphabetically.
  const members = [...conversation.members].sort(
    (a, b) =>
      Number(b.id === viewer.id) - Number(a.id === viewer.id) ||
      Number(b.online) - Number(a.online) ||
      a.displayName.localeCompare(b.displayName),
  );

  async function saveName() {
    try {
      await renameGroup({ variables: { conversationId: conversation.id, name } });
      toast.success('Group renamed');
    } catch (err) {
      toast.error(messageOf(err));
    }
  }

  async function add(user: User) {
    try {
      await addMembers({
        variables: { conversationId: conversation.id, usernames: [user.username] },
      });
      toast.success(`${user.displayName} added`);
      setAdding(false);
    } catch (err) {
      toast.error(messageOf(err));
    }
  }

  async function doLeave() {
    try {
      await leaveGroup({ variables: { conversationId: conversation.id } });
      onOpenChange(false);
      navigate('/', { replace: true });
      removeConversation(client, conversation.id);
    } catch (err) {
      toast.error(messageOf(err));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Group info"
      description={`${conversation.members.length} members`}
    >
      <form
        className="mb-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) void saveName();
        }}
      >
        <div className="relative flex-1">
          <Pencil
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            aria-label="Group name"
            className="pl-10"
          />
        </div>
        <AnimatePresence initial={false}>
          {dirty ? (
            <motion.div
              key="save"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0, transition: exit.fast }}
              transition={spring.snappy}
              className="overflow-hidden"
            >
              <Button type="submit" loading={rename.loading}>
                Save
              </Button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </form>

      <h3 className="mb-1.5 text-sm font-semibold">Members</h3>
      <ul className="-mx-1 mb-4 space-y-0.5">
        <AnimatePresence initial={false}>
          {members.map((m) => (
            <motion.li
              key={m.id}
              layout="position"
              className="flex min-h-12 items-center gap-3 rounded-xl px-1 py-1.5"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exit.fast }}
              transition={spring.soft}
            >
              <Avatar
                name={m.displayName}
                color={m.avatarColor}
                online={m.online || m.id === viewer.id}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {m.displayName}
                  {m.id === viewer.id ? (
                    <span className="font-normal text-muted-foreground"> (you)</span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">@{m.username}</p>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <div className="mb-4">
        <AnimatePresence initial={false} mode="popLayout">
          {adding ? (
            <motion.div key="picker" {...swap}>
              <h3 className="mb-2 text-sm font-semibold">Add someone</h3>
              <UserPicker
                autoFocus
                selected={[]}
                excludeIds={conversation.members.map((m) => m.id)}
                onPick={(u) => void add(u)}
              />
            </motion.div>
          ) : (
            <motion.div key="add" {...swap}>
              <Button variant="secondary" className="w-full" onClick={() => setAdding(true)}>
                <UserPlus className="size-4" /> Add people
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence initial={false} mode="popLayout">
        {confirmLeave ? (
          <motion.div key="confirm" className="space-y-2" {...swap}>
            <p className="text-center text-sm text-muted-foreground">
              Leave “{conversation.title}”? You’ll stop getting its messages.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmLeave(false)}>
                Stay
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                loading={leave.loading}
                onClick={() => void doLeave()}
              >
                Yes, leave
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="leave" {...swap}>
            <Button variant="danger" className="w-full" onClick={() => setConfirmLeave(true)}>
              <LogOut className="size-4" /> Leave group
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </Dialog>
  );
}
