import { useApolloClient, useMutation, useQuery } from '@apollo/client';
import {
  Ban,
  Crown,
  LogOut,
  MoreHorizontal,
  ChevronRight,
  Palette,
  Pencil,
  ShieldCheck,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Input } from '@/components/Input';
import { Menu, MenuItem } from '@/components/Menu';
import { Switch } from '@/components/Switch';
import { removeConversation } from '@/lib/cacheUpdates';
import {
  ADD_MEMBERS,
  BLOCKED_USERS,
  LEAVE_GROUP,
  RENAME_GROUP,
  type Conversation,
  type User,
} from '@/lib/gql';
import { exit, spring } from '@/lib/motion';
import { UserPicker } from '../conversations/NewChatDialog';
import { useOpenCard } from '../card/CardDialogProvider';
import { useViewer } from '../session/ViewerProvider';
import { useChatActions } from './useChatActions';
import { parseTheme, themeSpec } from '../theme/recipe';

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
  onOpenTheme,
}: {
  conversation: Conversation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens the theme sheet (theme and your colour). */
  onOpenTheme?: () => void;
}) {
  const viewer = useViewer();
  const themeLabel = themeSpec(parseTheme(conversation.theme)).label;
  const openCard = useOpenCard();
  const client = useApolloClient();
  const navigate = useNavigate();
  const [name, setName] = useState(conversation.title);
  const [adding, setAdding] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [renameGroup, rename] = useMutation(RENAME_GROUP);
  const [addMembers] = useMutation(ADD_MEMBERS);
  const [leaveGroup, leave] = useMutation(LEAVE_GROUP);
  const actions = useChatActions();
  const { data: blockedData } = useQuery(BLOCKED_USERS, {
    skip: !open,
    fetchPolicy: 'cache-and-network',
  });
  const blocked = new Set(blockedData?.blockedUsers.map((u) => u.id));
  const isOwner = conversation.ownerId === viewer.id;

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

      <div className="mb-6 flex items-center justify-between gap-4">
        <span id="group-mute-label" className="text-sm font-medium">
          Mute notifications
        </span>
        <Switch
          checked={conversation.muted}
          onChange={(muted) => void actions.mute(conversation, muted)}
          aria-labelledby="group-mute-label"
        />
      </div>

      {onOpenTheme ? (
        <button
          type="button"
          onClick={onOpenTheme}
          className="-mx-1 mb-6 flex min-h-12 w-[calc(100%+0.5rem)] items-center gap-3 rounded-xl px-1 py-1.5 text-left transition-colors hover:bg-muted/70"
        >
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Palette className="size-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Theme and your colour</span>
            <span className="block truncate text-xs text-muted-foreground">{themeLabel}</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </button>
      ) : null}

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
              <button
                type="button"
                onClick={() => openCard(m)}
                aria-label={`${m.displayName}, see their card`}
                className="-my-1 flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1 text-left transition-colors hover:bg-muted/70"
              >
                <Avatar
                  name={m.displayName}
                  color={m.avatarColor}
                  avatar={m.avatar}
                  online={m.online || m.id === viewer.id}
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-sm font-semibold">
                    <span className="truncate">{m.displayName}</span>
                    {m.id === viewer.id ? (
                      <span className="font-normal text-muted-foreground"> (you)</span>
                    ) : null}
                    {m.id === conversation.ownerId ? (
                      <Crown
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-label="Owner"
                      />
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    @{m.username}
                    {blocked.has(m.id) ? ' · Blocked' : ''}
                  </p>
                </div>
              </button>
              {m.id !== viewer.id ? (
                <Menu
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Options for ${m.displayName}`}
                      className="-mr-1"
                    >
                      <MoreHorizontal className="size-[18px]" />
                    </Button>
                  }
                >
                  {blocked.has(m.id) ? (
                    <MenuItem icon={ShieldCheck} onSelect={() => void actions.unblock(m)}>
                      Unblock
                    </MenuItem>
                  ) : (
                    <MenuItem icon={Ban} danger onSelect={() => void actions.block(m)}>
                      Block
                    </MenuItem>
                  )}
                  {isOwner ? (
                    <MenuItem
                      icon={UserMinus}
                      danger
                      onSelect={() => void actions.removeMember(conversation, m)}
                    >
                      Remove from group
                    </MenuItem>
                  ) : null}
                </Menu>
              ) : null}
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
