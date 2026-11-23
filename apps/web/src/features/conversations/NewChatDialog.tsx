import { useApolloClient, useMutation } from '@apollo/client';
import { Check, IdCard, Loader2, Search, UserRoundSearch, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Field, Input } from '@/components/Input';
import { Reveal } from '@/components/Reveal';
import { Segmented } from '@/components/Segmented';
import { cn } from '@/lib/cn';
import { upsertConversation } from '@/lib/cacheUpdates';
import { CREATE_GROUP, SEARCH_USERS, START_DIRECT, type User } from '@/lib/gql';
import { expectOwnConversation } from '@/lib/sounds';
import { useOpenCard } from '../card/CardDialogProvider';
import { exit, spring } from '@/lib/motion';

type Tab = 'direct' | 'group';

const messageOf = (err: unknown) =>
  (err as { graphQLErrors?: Array<{ message: string }> }).graphQLErrors?.[0]?.message ??
  'Something went wrong. Try again.';

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function Hint({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'danger';
}) {
  return (
    <motion.li
      className={cn(
        'flex flex-col items-center gap-2 px-2 py-6 text-center text-sm',
        tone === 'danger' ? 'text-danger' : 'text-muted-foreground',
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.li>
  );
}

/** Live username search. `selected` marks results that are already picked. */
export function UserPicker({
  selected,
  onPick,
  excludeIds = [],
  autoFocus,
  busyId,
}: {
  selected: string[];
  onPick: (user: User) => void;
  excludeIds?: string[];
  autoFocus?: boolean;
  /** A result that is being acted on (shows a spinner). */
  busyId?: string | null;
}) {
  const client = useApolloClient();
  const openCard = useOpenCard();
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim().replace(/^@/, ''), 200);
  const list = useRef<HTMLUListElement>(null);
  const [state, setState] = useState<{ loading: boolean; users: User[]; error: boolean }>({
    loading: false,
    users: [],
    error: false,
  });

  useEffect(() => {
    if (debounced.length < 2) {
      setState({ loading: false, users: [], error: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: false }));
    client
      .query({ query: SEARCH_USERS, variables: { query: debounced }, fetchPolicy: 'network-only' })
      .then(
        ({ data }) =>
          !cancelled && setState({ loading: false, users: data.searchUsers, error: false }),
      )
      .catch(() => !cancelled && setState({ loading: false, users: [], error: true }));
    return () => {
      cancelled = true;
    };
  }, [debounced, client]);

  const users = state.users.filter((u) => !excludeIds.includes(u.id));
  const results = () => [...(list.current?.querySelectorAll<HTMLElement>('[data-user]') ?? [])];

  function onInputKey(e: KeyboardEvent<HTMLInputElement>) {
    const first = users[0];
    if (e.key === 'Enter' && first) {
      e.preventDefault();
      onPick(first);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      results()[0]?.focus();
    }
  }

  function onListKey(e: KeyboardEvent<HTMLUListElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = results();
    const index = items.indexOf(e.target as HTMLElement);
    if (index === -1) return;
    e.preventDefault();
    const next = items[index + (e.key === 'ArrowDown' ? 1 : -1)];
    if (next) next.focus();
    else if (e.key === 'ArrowUp')
      (
        e.currentTarget.previousElementSibling?.querySelector('input') as HTMLElement | null
      )?.focus();
  }

  return (
    <div>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onInputKey}
          placeholder="Search by username"
          aria-label="Search people by username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          className="pl-10 pr-10"
        />
        <AnimatePresence>
          {state.loading ? (
            <motion.span
              key="spinner"
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exit.fast }}
            >
              <Loader2 className="size-4 animate-spin" />
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>
      <ul
        ref={list}
        onKeyDown={onListKey}
        className="-mx-2 mt-2 max-h-72 min-h-16 space-y-0.5 overflow-y-auto overscroll-contain px-2 py-1"
        aria-live="polite"
      >
        {debounced.length < 2 ? (
          <Hint>
            <UserRoundSearch className="size-5" aria-hidden />
            Type at least 2 letters of their username.
          </Hint>
        ) : state.error ? (
          <Hint tone="danger">Search failed. Try again.</Hint>
        ) : users.length === 0 && !state.loading ? (
          <Hint>No one found for “{debounced}”.</Hint>
        ) : (
          users.map((u, i) => {
            const picked = selected.includes(u.id);
            return (
              <motion.li
                key={u.id}
                className="flex items-center gap-1"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring.soft, delay: Math.min(i, 6) * 0.03 }}
              >
                <button
                  type="button"
                  data-user
                  onClick={() => onPick(u)}
                  className={cn(
                    'flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1.5 text-left outline-offset-[-2px] transition-colors',
                    picked
                      ? 'bg-brand/8 hover:bg-brand/12'
                      : 'hover:bg-muted focus-visible:bg-muted',
                  )}
                >
                  <Avatar
                    name={u.displayName}
                    color={u.avatarColor}
                    avatar={u.avatar}
                    online={u.online}
                    size="md"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{u.displayName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      @{u.username}
                    </span>
                  </span>
                  <span className="inline-flex size-6 items-center justify-center">
                    <AnimatePresence initial={false} mode="popLayout">
                      {busyId === u.id ? (
                        <motion.span key="busy" className="inline-flex" exit={{ opacity: 0 }}>
                          <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        </motion.span>
                      ) : picked ? (
                        <motion.span
                          key="picked"
                          className="inline-flex size-6 items-center justify-center rounded-full bg-brand text-brand-foreground"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0, transition: exit.fast }}
                          transition={spring.pop}
                        >
                          <Check className="size-3.5" strokeWidth={3} aria-label="Selected" />
                        </motion.span>
                      ) : null}
                    </AnimatePresence>
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`See ${u.displayName}'s card`}
                  title="See their card"
                  onClick={() => openCard(u)}
                >
                  <IdCard className="size-[18px]" />
                </Button>
              </motion.li>
            );
          })
        )}
      </ul>
    </div>
  );
}

export function NewChatDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New chat"
      description="Find people by their exact username."
    >
      <NewChatBody onDone={() => onOpenChange(false)} />
    </Dialog>
  );
}

/** Mounted only while the dialog is shown, so each opening starts fresh (and closing changes nothing). */
function NewChatBody({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const client = useApolloClient();
  const [tab, setTab] = useState<Tab>('direct');
  const [members, setMembers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [startDirect] = useMutation(START_DIRECT);
  const [createGroup, group] = useMutation(CREATE_GROUP);

  async function openDirect(user: User) {
    if (opening) return;
    setError(null);
    setOpening(user.id);
    expectOwnConversation();
    try {
      const { data } = await startDirect({ variables: { username: user.username } });
      if (!data) return;
      upsertConversation(client, data.startDirect);
      onDone();
      navigate(`/c/${data.startDirect.id}`);
    } catch (err) {
      setError(messageOf(err));
      setOpening(null);
    }
  }

  async function submitGroup() {
    setError(null);
    expectOwnConversation();
    try {
      const { data } = await createGroup({
        variables: { name, usernames: members.map((m) => m.username) },
      });
      if (!data) return;
      upsertConversation(client, data.createGroup);
      onDone();
      navigate(`/c/${data.createGroup.id}`);
      toast.success(`Created “${data.createGroup.title}”`, {
        description: 'Invites sent. People join when they accept.',
      });
    } catch (err) {
      setError(messageOf(err));
    }
  }

  const toggle = (u: User) =>
    setMembers((prev) =>
      prev.some((m) => m.id === u.id) ? prev.filter((m) => m.id !== u.id) : [...prev, u],
    );

  return (
    <>
      <Segmented
        kind="tabs"
        label="Chat type"
        className="mb-4"
        value={tab}
        onChange={(t) => {
          setTab(t);
          setError(null);
        }}
        options={[
          { value: 'direct', label: 'Direct message' },
          { value: 'group', label: 'Group' },
        ]}
      />

      <AnimatePresence initial={false}>
        {tab === 'group' ? (
          <Reveal key="group" className="pb-4">
            <Field label="Group name">
              {(p) => (
                <Input
                  {...p}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Weekend hike"
                  maxLength={60}
                />
              )}
            </Field>
            <AnimatePresence initial={false}>
              {members.length > 0 ? (
                <Reveal key="members" className="pt-4">
                  <ul className="flex flex-wrap gap-1.5" aria-label="Selected people">
                    <AnimatePresence initial={false} mode="popLayout">
                      {members.map((m) => (
                        <motion.li
                          key={m.id}
                          layout
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8, transition: exit.fast }}
                          transition={spring.pop}
                        >
                          <button
                            type="button"
                            onClick={() => toggle(m)}
                            aria-label={`Remove ${m.displayName}`}
                            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-muted pl-1 pr-2.5 text-sm font-medium transition-colors hover:bg-border/70"
                          >
                            <Avatar
                              name={m.displayName}
                              color={m.avatarColor}
                              avatar={m.avatar}
                              size="xs"
                            />
                            {m.displayName.split(' ')[0]}
                            <X className="size-3.5 text-muted-foreground" />
                          </button>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                </Reveal>
              ) : null}
            </AnimatePresence>
          </Reveal>
        ) : null}
      </AnimatePresence>

      <UserPicker
        autoFocus
        selected={members.map((m) => m.id)}
        busyId={opening}
        onPick={tab === 'direct' ? (u) => void openDirect(u) : toggle}
      />

      <AnimatePresence initial={false}>
        {error ? (
          <Reveal key="error" className="pt-3">
            <p role="alert" className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
              {error}
            </p>
          </Reveal>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {tab === 'group' ? (
          <Reveal key="create" className="pt-4">
            <Button
              className="w-full"
              disabled={!name.trim() || members.length === 0}
              loading={group.loading}
              onClick={() => void submitGroup()}
            >
              Create group
              {members.length > 0
                ? ` and invite ${members.length} ${members.length === 1 ? 'person' : 'people'}`
                : ''}
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              They’ll get an invite and join if they want to.
            </p>
          </Reveal>
        ) : null}
      </AnimatePresence>
    </>
  );
}
