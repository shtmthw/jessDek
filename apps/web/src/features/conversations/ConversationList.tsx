import { useQuery } from '@apollo/client';
import { BellOff, Image as ImageIcon, MessageSquarePlus, Search, Video, X } from 'lucide-react';
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useIsPresent,
  useReducedMotion,
  type Transition,
} from 'motion/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, useMatch } from 'react-router';
import { Avatar } from '@/components/Avatar';
import { buttonClass } from '@/components/Button';
import { Kbd } from '@/components/Kbd';
import { Skeleton } from '@/components/Skeleton';
import { cn } from '@/lib/cn';
import { useTray } from '@/features/media/trayStore';
import { useDraft } from '@/lib/drafts';
import { CONVERSATIONS, type Conversation } from '@/lib/gql';
import { SEARCH_ID } from '@/lib/keys';
import { mediaSummary, type MediaKinds } from '@/lib/mediaText';
import { exit, spring } from '@/lib/motion';
import { formatListTime } from '@/lib/time';
import { useTypingNames } from '../realtime/typing';
import { useViewer } from '../session/ViewerProvider';
import { reactionPreviewText } from '@/lib/reactionText';

/** "Photo", "3 photos", "Video"… with a small icon, then the caption if there is one. */
function MediaPreview({
  attachments,
  caption,
}: {
  attachments: readonly MediaKinds[];
  caption: string;
}) {
  const summary = mediaSummary(attachments);
  const text = caption.replace(/\s+/g, ' ').trim();
  if (!summary) return <>{text}</>;
  const Icon = summary.icon === 'video' ? Video : ImageIcon;
  return (
    <>
      <span className="inline-flex items-center gap-1 align-bottom">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {summary.text}
      </span>
      {text ? ` · ${text}` : ''}
    </>
  );
}

function preview(c: Conversation, viewerId: string): React.ReactNode {
  // A reaction by you or on your message, newer than the last message, takes the line (quietly).
  const reacted = reactionPreviewText(c.lastReaction, c.lastMessage, viewerId);
  if (reacted) return reacted;
  const m = c.lastMessage;
  if (!m) return c.type === 'GROUP' ? 'Group created' : 'Say hello 👋';
  const who =
    m.sender.id === viewerId
      ? 'You: '
      : c.type === 'GROUP'
        ? `${m.sender.displayName.split(' ')[0]}: `
        : '';
  return (
    <>
      {who}
      {m.attachments?.length ? (
        <MediaPreview attachments={m.attachments} caption={m.body} />
      ) : (
        m.body.replace(/\s+/g, ' ')
      )}
    </>
  );
}

/** Sorts newest activity first; shared with the keyboard shortcuts that step through chats. */
export const sortConversations = (list: readonly Conversation[]) =>
  [...list].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));

function Preview({ c, active }: { c: Conversation; active: boolean }) {
  const viewer = useViewer();
  const typing = useTypingNames(c.id);
  const draft = useDraft(c.id).trim();
  const tray = useTray(c.id);
  const unread = c.unreadCount > 0;

  let key = 'last';
  let content: React.ReactNode = preview(c, viewer.id);
  if (typing.length > 0) {
    key = 'typing';
    content = (
      <span className="font-medium text-brand-text">
        {c.type === 'GROUP' ? `${typing[0]!.split(' ')[0]} typing…` : 'typing…'}
      </span>
    );
  } else if ((draft || tray.length > 0) && !active) {
    key = 'draft';
    content = (
      <>
        <span className="font-medium text-danger">Draft: </span>
        <MediaPreview attachments={tray} caption={draft} />
      </>
    );
  }

  return (
    <span className="grid min-w-0 flex-1 overflow-hidden">
      <AnimatePresence initial={false}>
        <motion.span
          key={key}
          className={cn(
            'col-start-1 row-start-1 truncate text-sm',
            unread ? 'text-foreground' : 'text-muted-foreground',
          )}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6, transition: exit.fast }}
          transition={spring.snappy}
        >
          {content}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function ConversationRow({ conversation: c }: { conversation: Conversation }) {
  const unread = c.unreadCount > 0;
  const active = useMatch(`/c/${c.id}`) !== null;
  return (
    <NavLink
      to={`/c/${c.id}`}
      data-conversation-id={c.id}
      className={cn(
        'group/row relative flex min-h-[4.25rem] items-center gap-3 rounded-xl px-3 py-2.5 outline-offset-[-2px]',
        !active && 'hover:bg-muted/70',
      )}
    >
      {active ? (
        <motion.span
          layoutId="conversation-active"
          aria-hidden
          // Painted behind every row's text (the list is its own stacking context), so it can glide
          // past other chats in either direction without covering them.
          className="absolute inset-0 -z-10 rounded-xl bg-muted ring-1 ring-border/60"
          transition={spring.soft}
        />
      ) : null}
      <Avatar
        name={c.title}
        color={c.peer?.avatarColor}
        avatar={c.peer?.avatar}
        online={c.peer?.online}
        group={c.type === 'GROUP'}
        className="relative"
      />
      <div className="relative min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1">
            <span
              className={cn(
                'truncate text-[15px] tracking-tight',
                unread ? 'font-semibold' : 'font-medium',
              )}
            >
              {c.title}
            </span>
            {c.muted ? (
              <BellOff className="size-3.5 shrink-0 text-muted-foreground" aria-label="Muted" />
            ) : null}
          </span>
          <span
            className={cn(
              'tabular shrink-0 text-xs transition-colors',
              unread && !c.muted ? 'font-semibold text-brand-text' : 'text-muted-foreground',
            )}
          >
            {formatListTime(c.lastMessage?.createdAt ?? c.lastMessageAt)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <Preview c={c} active={active} />
          <AnimatePresence initial={false}>
            {unread ? (
              <motion.span
                key="badge"
                aria-label={`${c.unreadCount} unread`}
                className={cn(
                  'tabular inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold transition-colors',
                  // A muted chat still counts, quietly.
                  c.muted
                    ? 'bg-muted-foreground/25 text-foreground'
                    : 'bg-brand text-brand-foreground',
                )}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0, transition: exit.fast }}
                transition={spring.pop}
              >
                <motion.span
                  key={c.unreadCount}
                  initial={{ y: 6, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={spring.snappy}
                >
                  {c.unreadCount > 99 ? '99+' : c.unreadCount}
                </motion.span>
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </NavLink>
  );
}

const rowEnter: Transition = { height: spring.panel, opacity: { duration: 0.22, delay: 0.05 } };
const rowExit: Transition = {
  height: { duration: 0.22, ease: [0.4, 0, 0.2, 1] },
  opacity: exit.fast,
};

/**
 * A list row that opens and closes in place. It clips its content only while its height is
 * moving, so the active highlight can still glide in from a neighbouring row.
 */
function ListRow({
  entering,
  reduced,
  children,
}: {
  entering: boolean;
  reduced: boolean;
  children: ReactNode;
}) {
  const isPresent = useIsPresent();
  const [opening, setOpening] = useState(entering);
  return (
    <motion.li
      layout="position"
      className={opening || !isPresent ? 'overflow-hidden' : undefined}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0, transition: reduced ? { duration: 0 } : rowExit }}
      transition={reduced ? { duration: 0 } : rowEnter}
      onAnimationComplete={() => setOpening(false)}
    >
      <div className="pb-0.5">{children}</div>
    </motion.li>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-1 px-5 pt-2" aria-busy>
      {['w-2/5', 'w-1/3', 'w-1/2', 'w-1/3', 'w-2/5'].map((w, i) => (
        <div key={i} className="flex items-center gap-3 py-3" style={{ opacity: 1 - i * 0.16 }}>
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className={cn('h-3.5', w)} />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ConversationList({ onNewChat }: { onNewChat: () => void }) {
  const { data, loading, error, refetch } = useQuery(CONVERSATIONS, {
    fetchPolicy: 'cache-and-network',
  });
  const [filter, setFilter] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const reduced = useReducedMotion() ?? false;
  // Rows present on the first render just appear; later ones open in place.
  const searchRef = useRef<HTMLInputElement>(null);

  const sorted = useMemo(() => sortConversations(data?.conversations ?? []), [data]);
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q
      ? sorted.filter((c) => c.title.toLowerCase().includes(q) || c.peer?.username.includes(q))
      : sorted;
  }, [sorted, filter]);

  // A chat that jumps up because of new activity gets a fresh key: it fades out where it was and
  // fades in at the top while the others slide down one place, so rows never cross each other.
  const slots = useRef(new Map<string, { gen: number; index: number; at: string }>());
  const rowsWithKeys = useMemo(
    () =>
      visible.map((c, index) => {
        const prev = slots.current.get(c.id);
        const jumped = prev !== undefined && index < prev.index && prev.at !== c.lastMessageAt;
        const gen = (prev?.gen ?? 0) + (jumped ? 1 : 0);
        slots.current.set(c.id, { gen, index, at: c.lastMessageAt });
        return { c, key: `${c.id}:${gen}` };
      }),
    [visible],
  );
  // Rows in the list's first real render just appear; rows that arrive later open in place.
  const listReady = useRef(false);
  const hasRows = rowsWithKeys.length > 0;
  useEffect(() => {
    if (hasRows) listReady.current = true;
  }, [hasRows]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pb-2 pt-1">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            ref={searchRef}
            id={SEARCH_ID}
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                if (filter) setFilter('');
                else searchRef.current?.blur();
              } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
                // Jump from the search box into the results.
                const first = document.querySelector<HTMLElement>('[data-conversation-id]');
                if (first) {
                  e.preventDefault();
                  if (e.key === 'Enter') first.click();
                  else first.focus();
                }
              }
            }}
            placeholder="Search chats"
            aria-label="Search chats"
            autoComplete="off"
            className={cn(
              'h-10 w-full rounded-xl border border-transparent bg-muted pl-9 pr-9 text-base outline-none md:h-9 md:text-sm',
              'transition-[background-color,border-color,box-shadow] duration-200',
              'focus:border-border focus:bg-background focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--brand)_10%,transparent)]',
            )}
          />
          <span className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center">
            <AnimatePresence initial={false} mode="popLayout">
              {filter ? (
                <motion.button
                  key="clear"
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setFilter('');
                    searchRef.current?.focus();
                  }}
                  className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-border/60 hover:text-foreground"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6, transition: exit.fast }}
                  transition={spring.snappy}
                >
                  <X className="size-3.5" />
                </motion.button>
              ) : !searchFocused ? (
                <motion.span
                  key="hint"
                  className="hidden pr-1 md:inline-flex"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exit.fast }}
                >
                  <Kbd>/</Kbd>
                </motion.span>
              ) : null}
            </AnimatePresence>
          </span>
        </div>
      </div>

      <nav
        aria-label="Conversations"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2"
        onKeyDown={(e) => {
          // Arrow keys move between rows; up from the first row returns to search.
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          if (e.altKey || e.metaKey || e.ctrlKey) return;
          const rows = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-conversation-id]')];
          const index = rows.indexOf(e.target as HTMLElement);
          if (index === -1) return;
          e.preventDefault();
          const next = rows[index + (e.key === 'ArrowDown' ? 1 : -1)];
          if (next) next.focus();
          else if (e.key === 'ArrowUp') searchRef.current?.focus();
        }}
      >
        {loading && !data ? (
          <ListSkeleton />
        ) : error && !data ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Couldn’t load your chats</p>
            <p className="mt-1">Check your connection.</p>
            <button
              className={buttonClass('secondary', 'sm', 'mt-4')}
              onClick={() => void refetch()}
            >
              Try again
            </button>
          </div>
        ) : sorted.length === 0 ? (
          <motion.div
            className="flex flex-col items-center px-8 py-14 text-center"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring.soft}
          >
            <div className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <MessageSquarePlus className="size-5" />
            </div>
            <p className="font-semibold">No chats yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Find someone by username to start talking.
            </p>
            <button onClick={onNewChat} className={buttonClass('primary', 'md', 'mt-5')}>
              Start a chat
            </button>
          </motion.div>
        ) : (
          <LayoutGroup id="conversations">
            <ul className="relative isolate">
              {/* Rows open and close in place (height), so the list reflows smoothly and no row
                  ever slides across another. */}
              <AnimatePresence initial={false}>
                {rowsWithKeys.map(({ c, key }) => (
                  <ListRow key={key} entering={listReady.current} reduced={reduced}>
                    <ConversationRow conversation={c} />
                  </ListRow>
                ))}
              </AnimatePresence>
            </ul>
            <AnimatePresence>
              {visible.length === 0 ? (
                <motion.p
                  key="no-match"
                  className="px-6 py-10 text-center text-sm text-muted-foreground"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exit.fast }}
                >
                  No chats match “{filter.trim()}”.
                </motion.p>
              ) : null}
            </AnimatePresence>
          </LayoutGroup>
        )}
      </nav>
    </div>
  );
}
