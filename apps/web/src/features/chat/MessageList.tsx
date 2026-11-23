import { AlertCircle, ArrowDown, Check, Loader2, RotateCcw, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { Avatar } from '@/components/Avatar';
import { useSharingSummary } from '@/features/media/transfers';
import { cn } from '@/lib/cn';
import type { Reaction, User } from '@/lib/gql';
import { prefersReducedMotion } from '@/lib/media';
import { buildTimeline, type ChatMessage, type TimelineItem } from '@/lib/messages';
import { exit, spring } from '@/lib/motion';
import { formatClock } from '@/lib/time';
import { useStable } from '@/lib/useStable';
import type { Typer } from '../realtime/typing';
import { MessageMenu, type MenuRequest } from './actions/MessageMenu';
import { MessageToolbar, SwipeReplyHint } from './actions/MessageToolbar';
import { useBubbleGestures } from './actions/useBubbleGestures';
import { bubbleCorners } from './bubbleStyle';
import { Linkify } from './Linkify';
import { MediaBubble } from './media/MediaBubble';
import { ScrollRootContext } from './media/ScrollRoot';
import { EmojiPickerDialog } from './reactions/EmojiPickerDialog';
import { ReactionChips } from './reactions/ReactionChips';
import { myReaction } from './reactions/reactions';
import { ReactionsDialog } from './reactions/ReactionsDialog';
import { ReplyQuote } from './replies/ReplyQuote';
import { TypingBubble } from './TypingBubble';
import { useOpenCard } from '../card/CardDialogProvider';

/** A message as shown on screen. `id` is a stable key: a sent message keeps the key it had while pending. */
export interface DisplayMessage extends ChatMessage {
  status?: 'sending' | 'failed' | 'sent';
  tempId?: string;
  /** Your own photos and videos are still being resized and hashed before they can be sent. */
  preparing?: boolean;
  /** The server's id, when `id` is the key it was shown under while sending. */
  serverId?: string;
}

/** The id to reply to or react to: confirmed messages only (null while sending or failed). */
export const serverIdOf = (m: DisplayMessage): string | null =>
  m.status === 'sending' || m.status === 'failed' ? null : (m.serverId ?? m.id);

type Run = Extract<TimelineItem<DisplayMessage>, { kind: 'run' }>;

const NEAR_BOTTOM_PX = 120;
const SLOW_SEND_MS = 400;
const RECEIPT_DELAY_S = 0.2;
const FAR_FROM_BOTTOM_PX = 480;

function Bubble({
  text,
  mine,
  first,
  last,
  status,
  quote,
  flash,
  onClick,
}: {
  text: string;
  mine: boolean;
  first: boolean;
  last: boolean;
  status?: DisplayMessage['status'];
  /** The quoted message, when this is a reply. */
  quote?: ReactNode;
  flash?: boolean;
  onClick: (e: MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      data-bubble
      onClick={onClick}
      className={cn(
        'w-fit max-w-full whitespace-pre-wrap break-words px-3.5 py-2 text-[15px] leading-[1.42] md:px-4',
        'transition-[border-radius,opacity,background-color,color,outline-color,box-shadow] duration-300 ease-out-quint',
        // On touch screens a long-press opens the message's actions (Copy text among them).
        'pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]',
        quote && 'pt-1.5 md:pt-1.5',
        flash && 'message-flash',
        mine ? 'bg-mine text-mine-foreground' : 'bg-bubble text-bubble-foreground',
        bubbleCorners(mine, first, last),
        status === 'sending' && 'opacity-70',
        status === 'failed' && 'opacity-60',
        mine
          ? '[&_a]:text-mine-foreground [&_a]:decoration-current/50'
          : '[&_a]:text-brand-text [&_a]:decoration-current/40',
      )}
    >
      {quote ? <div className="-mx-2 mb-1 md:-mx-2.5">{quote}</div> : null}
      <Linkify text={text} />
    </div>
  );
}

function StatusLine({
  message,
  showDelivery,
  sharingText,
  onRetry,
  onDiscard,
}: {
  message: DisplayMessage;
  showDelivery: boolean;
  /** "Sharing with Bob · 45%" while someone is downloading your photos from this tab. */
  sharingText?: string | null;
  onRetry: (tempId: string) => void;
  onDiscard: (tempId: string) => void;
}) {
  const { status, tempId } = message;
  // "Sending…" is only worth showing when a send takes a noticeable moment.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (status !== 'sending') return setSlow(false);
    const t = setTimeout(() => setSlow(true), SLOW_SEND_MS);
    return () => clearTimeout(t);
  }, [status]);
  const key =
    status === 'failed'
      ? 'failed'
      : status === 'sending' && message.preparing
        ? 'preparing' // no delay: resizing a photo is slow enough to deserve a word at once
        : sharingText
          ? 'sharing' // shown on any of your media messages, not just the newest
          : !showDelivery
            ? null
            : status === 'sending'
              ? slow
                ? 'sending'
                : null
              : (status ?? null);
  // One label at a time, in one grid cell under its bubble: the old one leaves before the next
  // arrives. When the line goes away entirely (a newer message took over), it leaves at once.
  const leave = {
    exit: (next: string | null) => ({
      opacity: 0,
      transition: next ? exit.fast : { duration: 0 },
    }),
  };
  return (
    <div className="grid justify-items-end">
      <AnimatePresence initial={false} custom={key} mode="wait">
        {key === 'failed' && tempId ? (
          <motion.div
            key="failed"
            role="alert"
            className="col-start-1 row-start-1 flex items-center gap-1 px-1 pt-1 text-xs text-danger"
            variants={leave}
            custom={key}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit="exit"
            transition={spring.snappy}
          >
            Not sent
            <button
              onClick={() => onRetry(tempId)}
              className="ml-1 inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-medium hover:bg-danger/10"
            >
              <RotateCcw className="size-3" /> Retry
            </button>
            <button
              onClick={() => onDiscard(tempId)}
              aria-label="Discard message"
              className="rounded-md p-1 hover:bg-danger/10"
            >
              <X className="size-3" />
            </button>
          </motion.div>
        ) : key === 'sending' || key === 'preparing' || key === 'sharing' ? (
          <motion.span
            key={key}
            className="tabular col-start-1 row-start-1 px-1 pt-1 text-[11px] text-muted-foreground"
            variants={leave}
            custom={key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.2 } }}
            exit="exit"
          >
            {key === 'sending' ? 'Sending…' : key === 'preparing' ? 'Preparing…' : sharingText}
          </motion.span>
        ) : key === 'sent' ? (
          <motion.span
            key="sent"
            className="col-start-1 row-start-1 inline-flex items-center gap-1 px-1 pt-1 text-[11px] text-muted-foreground"
            variants={leave}
            custom={key}
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit="exit"
            // Wait for the bubble to have mostly arrived before confirming it.
            transition={{ ...spring.snappy, delay: RECEIPT_DELAY_S }}
          >
            <motion.span
              className="inline-flex"
              initial={{ scale: 0.4 }}
              animate={{ scale: 1 }}
              transition={{ ...spring.pop, delay: RECEIPT_DELAY_S }}
            >
              <Check className="size-3" strokeWidth={2.5} />
            </motion.span>
            Sent
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** "Sharing with Bob · 45%", or "Sharing with 2 people". */
function sharingLabel(
  sharing: { peers: string[]; progress: number } | undefined,
  nameOf: (userId: string) => string | undefined,
): string | null {
  if (!sharing) return null;
  if (sharing.peers.length === 1) {
    const name = nameOf(sharing.peers[0]!)?.split(' ')[0];
    const pct = `${Math.round(sharing.progress * 100)}%`;
    return name ? `Sharing with ${name} · ${pct}` : `Sharing with 1 person · ${pct}`;
  }
  return `Sharing with ${sharing.peers.length} people`;
}

/** What a row can do with its message, shared by every row of the list. */
interface RowActions {
  /** Reacting and replying are allowed in this chat (not, say, a blocked direct chat). */
  canAct: boolean;
  viewerId: string;
  onMenu: (message: DisplayMessage, request: MenuRequest) => void;
  onReply: (message: DisplayMessage) => void;
  onOpenReactions: (message: DisplayMessage) => void;
  onJump: (messageId: string) => void;
}

/**
 * A message's row. Only a message that arrives while the chat is open plays an entrance; history
 * mounts as a plain element, which keeps opening a chat and loading older messages light.
 */
function RowShell({
  enters,
  mine,
  children,
}: {
  enters: boolean;
  mine: boolean;
  children: ReactNode;
}) {
  const className = cn(
    'group/msg flex w-full items-center gap-2',
    mine ? 'flex-row-reverse' : 'flex-row',
  );
  if (!enters) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      style={{ transformOrigin: mine ? '100% 100%' : '0% 100%' }}
      initial={{ opacity: 0, y: mine ? 16 : 10, scale: mine ? 0.92 : 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={mine ? spring.send : spring.soft}
    >
      {children}
    </motion.div>
  );
}

/** Memoised: a new message, a timer or the typing bubble re-renders the list, not every row in it. */
const MessageRow = memo(function MessageRow({
  message,
  mine,
  first,
  last,
  fresh,
  showDelivery,
  conversationId,
  isGroup,
  memberName,
  onOpenMedia,
  onRetry,
  onDiscard,
  actions,
  flash,
  tabbable,
  menuOpen,
}: {
  message: DisplayMessage;
  mine: boolean;
  first: boolean;
  last: boolean;
  fresh: boolean;
  showDelivery: boolean;
  conversationId: string;
  isGroup: boolean;
  memberName: (userId: string) => string | undefined;
  onOpenMedia: (messageId: string, index: number) => void;
  onRetry: (tempId: string) => void;
  onDiscard: (tempId: string) => void;
  actions: RowActions;
  /** Ring the bubble briefly: a quote just jumped here. */
  flash: boolean;
  /** This message is the list's one Tab stop (arrow keys move it). */
  tabbable: boolean;
  /** Its actions menu is open (keeps the toolbar up). */
  menuOpen: boolean;
}) {
  const [reveal, setReveal] = useState(false);
  // Decided once: a row never swaps elements mid-entrance.
  const [enters] = useState(fresh);
  const media = message.attachments?.length ? message.attachments : null;
  const sharing = useSharingSummary(
    mine && media ? media.flatMap((m) => [m.sha256, m.posterSha256 ?? undefined]) : [],
  );
  const wrap = useRef<HTMLDivElement>(null);
  const serverId = serverIdOf(message);
  const actionable = actions.canAct && serverId !== null;
  const bubbleEl = () => wrap.current?.querySelector<HTMLElement>('[data-bubble]') ?? wrap.current!;
  const openMenu = (mode: MenuRequest['mode'], returnFocus: HTMLElement | null) =>
    actions.onMenu(message, { bubble: bubbleEl(), mode, touch: false, returnFocus });

  const gestures = useBubbleGestures({
    enabled: actionable,
    onLongPress: (bubble) =>
      actions.onMenu(message, { bubble, mode: 'full', touch: true, returnFocus: null }),
    onSwipe: () => actions.onReply(message),
  });

  // Tap (or click) a bubble to pin its time; links and text selection keep working as usual.
  function toggle(e: MouseEvent<HTMLElement>) {
    if ((e.target as HTMLElement).closest('a')) return;
    if (window.getSelection()?.toString()) return;
    setReveal((r) => !r);
  }

  const replyTo = message.replyTo;
  const quote = replyTo ? (
    <ReplyQuote
      quote={replyTo}
      viewerId={actions.viewerId}
      mine={mine}
      onJump={() => actions.onJump(replyTo.id)}
    />
  ) : null;
  const sender = mine ? 'You' : message.sender.displayName;

  return (
    <div className={cn('flex w-full flex-col', mine ? 'items-end' : 'items-start')}>
      <RowShell enters={enters} mine={mine}>
        <div
          ref={wrap}
          data-message-key={message.id}
          data-message-id={serverId ?? undefined}
          tabIndex={tabbable ? 0 : -1}
          aria-label={`${sender}, ${formatClock(message.createdAt)}`}
          aria-keyshortcuts={actionable ? 'Enter R' : undefined}
          className={cn(
            'relative min-w-0 rounded-[20px] outline-offset-2',
            media ? 'max-w-full' : 'max-w-[min(80%,clamp(34rem,45%,48rem))]',
          )}
        >
          {actionable ? <SwipeReplyHint x={gestures.x} /> : null}
          <motion.div
            className={cn(
              'relative flex flex-col',
              mine ? 'items-end' : 'items-start',
              actionable && 'touch-pan-y',
            )}
            style={{ x: gestures.x, scale: gestures.press }}
            {...(actionable ? gestures.handlers : {})}
            onContextMenu={(e: MouseEvent<HTMLElement>) => {
              if (!actionable) return;
              e.preventDefault(); // our menu instead of the browser's
              if (gestures.wasTouch()) return; // a held finger already opened it
              openMenu('full', document.activeElement as HTMLElement | null);
            }}
          >
            {media ? (
              <MediaBubble
                items={media}
                caption={message.body}
                mine={mine}
                first={first}
                last={last}
                failed={message.status === 'failed'}
                conversationId={conversationId}
                who={{
                  dm: !isGroup,
                  mine,
                  firstName: message.sender.displayName.split(' ')[0] ?? '',
                }}
                senderName={message.sender.displayName}
                onToggleTime={toggle}
                onOpen={(index) => onOpenMedia(message.id, index)}
                quote={quote}
                flash={flash}
              />
            ) : (
              <Bubble
                text={message.body}
                mine={mine}
                first={first}
                last={last}
                status={message.status}
                quote={quote}
                flash={flash}
                onClick={toggle}
              />
            )}
            <ReactionChips
              reactions={message.reactions}
              viewerId={actions.viewerId}
              mine={mine}
              onOpen={() => actions.onOpenReactions(message)}
            />
          </motion.div>
        </div>
        {message.status === 'failed' ? (
          <AlertCircle className="size-4 shrink-0 text-danger" aria-hidden />
        ) : (
          <time
            dateTime={message.createdAt}
            className={cn(
              'tabular shrink-0 select-none text-[11px] text-muted-foreground transition-opacity duration-200',
              reveal || menuOpen ? 'opacity-100' : 'opacity-0 group-hover/msg:opacity-100',
            )}
          >
            {formatClock(message.createdAt)}
          </time>
        )}
        {actionable ? (
          <MessageToolbar
            active={menuOpen}
            onReact={(button) => openMenu('react', button)}
            onReply={() => actions.onReply(message)}
            onMore={(button) => openMenu('full', button)}
          />
        ) : null}
      </RowShell>
      <StatusLine
        message={message}
        showDelivery={showDelivery}
        sharingText={sharingLabel(sharing, memberName)}
        onRetry={onRetry}
        onDiscard={onDiscard}
      />
    </div>
  );
});

/** A theme change (or another event) shown in the timeline, and how to act on it. */
export interface ChatNotice {
  /** When it happened (ISO 8601). */
  at: string;
  text: string;
  /** Shows a "Change" link (opens the theme sheet). */
  onChange?: () => void;
}

function Separator({
  item,
  notice,
}: {
  item: Exclude<TimelineItem, { kind: 'run' | 'day' }>;
  notice?: ChatNotice | null;
}) {
  if (item.kind === 'notice') {
    if (!notice) return null;
    return (
      <p
        data-chat-notice
        className="mx-auto my-3 w-fit max-w-[85%] text-balance rounded-2xl bg-background/85 px-3 py-1 text-center text-xs text-muted-foreground shadow-sm ring-1 ring-border backdrop-blur-md"
      >
        {notice.text}
        {notice.onChange ? (
          <>
            {' · '}
            <button
              type="button"
              onClick={notice.onChange}
              className="-mx-1 -my-1 rounded px-1 py-1 font-semibold text-brand-text hover:underline"
            >
              Change
            </button>
          </>
        ) : null}
      </p>
    );
  }
  if (item.kind === 'unread') {
    return (
      <div
        data-unread-divider
        className="my-4 flex items-center gap-3 text-xs font-semibold text-brand-text"
      >
        <span className="h-px flex-1 bg-brand-text/30" />
        New messages
        <span className="h-px flex-1 bg-brand-text/30" />
      </div>
    );
  }
  return (
    <p className="tabular mb-2 mt-5 text-center text-xs font-medium text-muted-foreground">
      {item.label}
    </p>
  );
}

export function MessageList({
  messages,
  viewerId,
  conversationId,
  memberName,
  onOpenMedia,
  isGroup,
  hasMore,
  loadingMore,
  onLoadMore,
  onRetry,
  onDiscard,
  typing,
  firstUnreadId,
  intro,
  empty,
  canAct,
  members,
  onReply,
  onReact,
  onJump,
  jump,
  memberStyle,
  notice,
}: {
  messages: DisplayMessage[];
  viewerId: string;
  conversationId: string;
  /** A member's display name by user id (for "Sharing with Bob"). */
  memberName: (userId: string) => string | undefined;
  /** A photo or video tile was tapped: which message, and which of its attachments. */
  onOpenMedia: (messageId: string, index: number) => void;
  isGroup: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRetry: (tempId: string) => void;
  onDiscard: (tempId: string) => void;
  /** People typing right now. */
  typing: Typer[];
  firstUnreadId?: string;
  /** Shown above the first message once the whole history is loaded. */
  intro?: ReactNode;
  /** Shown instead of the list when there are no messages yet. */
  empty?: ReactNode;
  /** Reacting and replying are allowed (false in a blocked direct chat). */
  canAct: boolean;
  /** The chat's members, for avatars in "Reactions". */
  members: readonly User[];
  /** Reply to a confirmed message (by its server id). */
  onReply: (messageId: string) => void;
  /** Set (or with null remove) your reaction; picking your current emoji again removes it. */
  onReact: (message: { id: string; reactions?: readonly Reaction[] }, emoji: string | null) => void;
  /** A quote was tapped: bring its message into view (loading history if need be). */
  onJump: (messageId: string) => void;
  /** Scroll to this message and ring it (set after `onJump` found it). `nonce` repeats a jump. */
  jump?: { id: string; nonce: number } | null;
  /** Groups: a member's colour (CSS variables) for their runs. */
  memberStyle?: (userId: string) => CSSProperties | undefined;
  /** The latest theme change, shown at its place in the timeline. */
  notice?: ChatNotice | null;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const topSentinel = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const initialised = useRef(false);
  const lastSeenId = useRef<string | undefined>(undefined);
  const prepend = useRef<{ height: number; firstId: string | undefined } | null>(null);
  const [unseen, setUnseen] = useState(0);
  const [far, setFar] = useState(false);
  const [menu, setMenu] = useState<{ key: string; request: MenuRequest } | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [reactionsFor, setReactionsFor] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const byKey = (key: string | null) => (key ? messages.find((m) => m.id === key) : undefined);
  const closeMenu = useCallback(() => setMenu(null), []);

  // Stable callbacks for the memoised rows (the parent passes fresh inline ones on every render).
  const replyFrom = useStable((message: DisplayMessage) => {
    const id = serverIdOf(message);
    if (id) onReply(id);
  });
  const jumpTo = useStable(onJump);
  const rowMemberName = useStable(memberName);
  const rowOpenMedia = useStable(onOpenMedia);
  const rowRetry = useStable(onRetry);
  const rowDiscard = useStable(onDiscard);
  const rowActions = useMemo<RowActions>(
    () => ({
      canAct,
      viewerId,
      onMenu: (message, request) => setMenu({ key: message.id, request }),
      onReply: replyFrom,
      onOpenReactions: (message) => setReactionsFor(message.id),
      onJump: jumpTo,
    }),
    [canAct, viewerId, replyFrom, jumpTo],
  );

  /** React to a message on screen by its display key. */
  function reactTo(key: string, emoji: string | null) {
    const m = byKey(key);
    const id = m ? serverIdOf(m) : null;
    if (m && id) onReact({ id, reactions: m.reactions }, emoji);
  }

  function copyText(key: string) {
    const body = byKey(key)?.body;
    if (!body) return;
    navigator.clipboard?.writeText(body).then(
      () => toast.success('Copied'),
      () => toast.error('Couldn’t copy'),
    );
  }

  // Bring the message a quote points at into view, then ring it. If older history is still on its
  // way in, wait for it: each new render of the list tries again until the message is there.
  const handledJump = useRef(0);
  useLayoutEffect(() => {
    const root = scroller.current;
    if (!jump || !root || handledJump.current === jump.nonce) return;
    const el = root.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(jump.id)}"]`);
    if (!el) return;
    handledJump.current = jump.nonce;
    const box = root.getBoundingClientRect();
    const at = el.getBoundingClientRect();
    const top = root.scrollTop + at.top - box.top - (box.height - at.height) / 2;
    stick.current = false;
    root.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    setFlashId(null);
    requestAnimationFrame(() => setFlashId(jump.id)); // restart the ring on a repeat jump
    setFocusKey(el.dataset.messageKey ?? null);
  }, [jump, messages]);
  useEffect(() => {
    if (!flashId) return;
    const t = setTimeout(() => setFlashId(null), 1700);
    return () => clearTimeout(t);
  }, [flashId]);

  /** Arrow keys walk the messages; Enter opens one's actions, R replies to it. */
  function onLogKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-message-key]');
    if (!el || e.target !== el || e.altKey || e.ctrlKey || e.metaKey) return;
    const all = [...(scroller.current?.querySelectorAll<HTMLElement>('[data-message-key]') ?? [])];
    const i = all.indexOf(el);
    const go = (target: HTMLElement | undefined) => {
      if (!target) return;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'nearest' });
    };
    const key = el.dataset.messageKey!;
    const m = byKey(key);
    const actionable = Boolean(canAct && m && serverIdOf(m));
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      go(all[i + (e.key === 'ArrowDown' ? 1 : -1)]);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      go(e.key === 'Home' ? all[0] : all[all.length - 1]);
    } else if (
      actionable &&
      (e.key === 'Enter' || e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))
    ) {
      e.preventDefault();
      const bubble = el.querySelector<HTMLElement>('[data-bubble]') ?? el;
      setMenu({ key, request: { bubble, mode: 'full', touch: false, returnFocus: el } });
    } else if (actionable && !e.shiftKey && (e.key === 'r' || e.key === 'R')) {
      e.preventDefault(); // not the composer's "type anywhere"
      rowActions.onReply(m!);
    }
  }

  // Only messages that arrive while the chat is open get an entrance; history just appears.
  const openCard = useOpenCard();
  const known = useRef<Set<string> | null>(null);
  const newestKnown = useRef(0);
  if (known.current === null) {
    known.current = new Set(messages.map((m) => m.id));
    newestKnown.current = Math.max(0, ...messages.map((m) => Date.parse(m.createdAt)));
  }
  const isFresh = (m: DisplayMessage) =>
    !known.current!.has(m.id) &&
    (m.status !== undefined || Date.parse(m.createdAt) >= newestKnown.current);
  useEffect(() => {
    for (const m of messages) {
      known.current!.add(m.id);
      newestKnown.current = Math.max(newestKnown.current, Date.parse(m.createdAt));
    }
  }, [messages]);

  const noticeAt = notice?.at;
  const timeline = useMemo(
    () =>
      buildTimeline(messages, viewerId, new Date(), {
        firstUnreadId,
        notice: noticeAt ? { key: 'theme-notice', at: noticeAt, leading: !hasMore } : null,
      }),
    [messages, viewerId, firstUnreadId, noticeAt, hasMore],
  );
  // Each day is its own section so its label can stick to the top while you scroll through it.
  const sections = useMemo(() => {
    const out: Array<{ key: string; label: string; items: TimelineItem<DisplayMessage>[] }> = [];
    for (const item of timeline) {
      if (item.kind === 'day') out.push({ key: item.key, label: item.label, items: [] });
      else out.at(-1)?.items.push(item);
    }
    return out;
  }, [timeline]);
  const lastMessage = messages[messages.length - 1];
  // One Tab stop in the list: the message you last focused, or the newest.
  const tabKey = byKey(focusKey) ? focusKey : (lastMessage?.id ?? null);

  const scrollToBottom = (smooth: boolean) => {
    const el = scroller.current;
    if (el)
      el.scrollTo({
        top: el.scrollHeight,
        behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto',
      });
  };

  // Keep the viewport sensible whenever the list changes.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const first = messages[0];
    const last = messages[messages.length - 1];

    // Older messages were added above: keep what the reader was looking at in place.
    if (prepend.current) {
      if (first?.id !== prepend.current.firstId)
        el.scrollTop += el.scrollHeight - prepend.current.height;
      prepend.current = null;
      lastSeenId.current = last?.id;
      return;
    }
    if (!initialised.current) {
      if (messages.length === 0) return;
      initialised.current = true;
      lastSeenId.current = last?.id;
      // Open at the first unread message when there is one, otherwise at the latest.
      const divider = el.querySelector<HTMLElement>('[data-unread-divider]');
      if (divider) {
        const offset = divider.getBoundingClientRect().top - el.getBoundingClientRect().top;
        el.scrollTop = Math.max(0, el.scrollTop + offset - 56);
      } else {
        el.scrollTop = el.scrollHeight;
      }
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
      return;
    }
    if (last && last.id !== lastSeenId.current) {
      lastSeenId.current = last.id;
      if (last.sender.id === viewerId || stick.current) scrollToBottom(true);
      else setUnseen((n) => n + 1);
    }
  }, [messages, viewerId]);

  // Keep the typing bubble in view when you're already at the bottom.
  const someoneTyping = typing.length > 0;
  useLayoutEffect(() => {
    if (someoneTyping && stick.current) scrollToBottom(true);
  }, [someoneTyping]);

  // Stay pinned to the bottom when the viewport resizes (e.g. the mobile keyboard opens).
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Load older history when the top of the list comes into view.
  useEffect(() => {
    const el = scroller.current;
    const sentinel = topSentinel.current;
    if (!el || !sentinel || !hasMore || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore && initialised.current) {
          prepend.current = { height: el.scrollHeight, firstId: messages[0]?.id };
          onLoadMore();
        }
      },
      { root: el, rootMargin: '300px 0px 0px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore, messages]);

  // A day label that has floated up to stay pinned over other days' messages shows while you
  // scroll and fades once you stop, so it doesn't sit on top of a message (index.css).
  const scrollIdle = useRef<number | undefined>(undefined);
  const lastInput = useRef(0);
  const markInput = () => {
    lastInput.current = Date.now();
  };
  const markPinnedDays = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    el.querySelectorAll<HTMLElement>('[data-day-pill]').forEach((pill) => {
      const section = pill.parentElement!.getBoundingClientRect();
      const pinned = section.top < top - 1 && section.bottom > top;
      if (pinned === pill.hasAttribute('data-pinned')) return;
      // Pinned by the app's own scrolling (a chat opening at its newest message): hide at once
      // rather than fading out over the top message.
      const instant = !el.hasAttribute('data-scrolling');
      if (instant) pill.style.transition = 'none';
      pill.toggleAttribute('data-pinned', pinned);
      if (instant) {
        void pill.offsetHeight; // apply the change before the transition comes back
        pill.style.transition = '';
      }
    });
  }, []);
  useLayoutEffect(markPinnedDays, [markPinnedDays, messages]);
  useEffect(() => () => window.clearTimeout(scrollIdle.current), []);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    markPinnedDays();
    // Only your own scrolling shows the pinned day label (and its momentum keeps it shown), not
    // the app jumping to the newest message when a chat opens or a message arrives.
    const byYou = Date.now() - lastInput.current < 1500 || el.hasAttribute('data-scrolling');
    if (byYou) {
      el.setAttribute('data-scrolling', '');
      window.clearTimeout(scrollIdle.current);
      scrollIdle.current = window.setTimeout(() => el.removeAttribute('data-scrolling'), 1100);
    }
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stick.current = distance < NEAR_BOTTOM_PX;
    if (stick.current) setUnseen(0);
    setFar(distance > FAR_FROM_BOTTOM_PX);
  }

  function renderRun(run: Run) {
    const others = !run.mine && isGroup;
    // The avatar sits by the run's last bubble. A reaction pill hangs 18px below that bubble
    // (26px tall, tucked 8px under it), so lift the avatar by as much to stay level with the bubble.
    const pillBelow = (run.messages[run.messages.length - 1]?.reactions?.length ?? 0) > 0;
    const colored = others ? memberStyle?.(run.sender.id) : undefined;
    return (
      <div
        key={run.key}
        data-member={colored ? '' : undefined}
        style={colored}
        className={cn('mt-3 flex items-end gap-2 first:mt-0', run.mine && 'justify-end')}
      >
        {others ? (
          <button
            type="button"
            onClick={() =>
              run.sender.username &&
              openCard({
                ...run.sender,
                username: run.sender.username,
                avatar: run.sender.avatar ?? null,
              })
            }
            aria-label={`${run.sender.displayName}'s card`}
            title={`${run.sender.displayName}'s card`}
            className={cn(
              'shrink-0 rounded-full transition-[margin,scale] duration-200 ease-out-quint motion-safe:active:scale-90',
              pillBelow ? 'mb-[18px]' : 'mb-px',
            )}
          >
            <Avatar
              name={run.sender.displayName}
              color={run.sender.avatarColor}
              avatar={run.sender.avatar}
              size="sm"
            />
          </button>
        ) : null}
        <div
          className={cn(
            'flex min-w-0 flex-1 flex-col gap-0.5',
            run.mine ? 'items-end' : 'items-start',
          )}
        >
          {others ? (
            <span
              className={cn(
                'mb-0.5 px-3.5 text-xs font-medium',
                colored ? 'text-[var(--member-name)]' : 'text-muted-foreground',
              )}
            >
              {run.sender.displayName}
            </span>
          ) : null}
          {run.messages.map((m, i) => (
            <MessageRow
              key={m.id}
              message={m}
              mine={run.mine}
              first={i === 0}
              last={i === run.messages.length - 1}
              fresh={isFresh(m)}
              showDelivery={m === lastMessage}
              conversationId={conversationId}
              isGroup={isGroup}
              memberName={rowMemberName}
              onOpenMedia={rowOpenMedia}
              onRetry={rowRetry}
              onDiscard={rowDiscard}
              actions={rowActions}
              flash={flashId !== null && (m.serverId ?? m.id) === flashId}
              tabbable={m.id === tabKey}
              menuOpen={menu?.key === m.id}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <ScrollRootContext.Provider value={scroller}>
      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          onScroll={onScroll}
          onWheel={markInput}
          onTouchStart={markInput}
          onTouchMove={markInput}
          onPointerDown={markInput}
          onKeyDown={(e) => {
            markInput();
            onLogKeyDown(e);
          }}
          onFocus={(e) => {
            const key = (e.target as HTMLElement).dataset?.messageKey;
            if (key) setFocusKey(key);
          }}
          className="h-full overflow-y-auto overscroll-contain"
          role="log"
          aria-live="polite"
          aria-label="Messages"
        >
          <div className="chat-column flex min-h-full flex-col justify-end pb-3 pt-2">
            <div ref={topSentinel} className="h-px shrink-0" />
            {loadingMore ? (
              <div className="flex justify-center py-3 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-label="Loading earlier messages" />
              </div>
            ) : !hasMore && messages.length > 0 ? (
              intro
            ) : null}

            {messages.length === 0 ? empty : null}

            {sections.map((section) => (
              <div key={section.key} role="group" aria-label={section.label}>
                <div
                  data-day-pill
                  className="pointer-events-none sticky top-0 z-10 flex justify-center py-2.5"
                >
                  <span className="rounded-full bg-background/85 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm ring-1 ring-border backdrop-blur-md">
                    {section.label}
                  </span>
                </div>
                {section.items.map((item) =>
                  item.kind === 'run' ? (
                    renderRun(item)
                  ) : item.kind === 'day' ? null : (
                    <Separator key={item.key} item={item} notice={notice} />
                  ),
                )}
              </div>
            ))}

            <AnimatePresence>
              {someoneTyping ? <TypingBubble key="typing" typers={typing} group={isGroup} /> : null}
            </AnimatePresence>
          </div>
        </div>

        <AnimatePresence>
          {unseen > 0 ? (
            <motion.button
              key="unseen"
              onClick={() => {
                scrollToBottom(true);
                setUnseen(0);
              }}
              className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 text-sm font-medium text-brand-foreground shadow-md"
              initial={{ opacity: 0, y: 12, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95, transition: exit.fast }}
              transition={spring.pop}
            >
              <ArrowDown className="size-4" />
              {unseen === 1 ? '1 new message' : `${unseen} new messages`}
            </motion.button>
          ) : far ? (
            <motion.button
              key="latest"
              aria-label="Jump to latest message"
              title="Jump to latest"
              onClick={() => scrollToBottom(true)}
              className="absolute bottom-3 right-4 inline-flex size-10 items-center justify-center rounded-full bg-background text-muted-foreground shadow-md ring-1 ring-border hover:text-foreground md:right-6"
              initial={{ opacity: 0, y: 12, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8, transition: exit.fast }}
              transition={spring.pop}
            >
              <ArrowDown className="size-[18px]" />
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {menu && byKey(menu.key) ? (
          <MessageMenu
            key={menu.key}
            request={menu.request}
            mine={byKey(menu.key)!.sender.id === viewerId}
            current={myReaction(byKey(menu.key)!.reactions, viewerId)}
            canCopy={Boolean(byKey(menu.key)!.body.trim())}
            onClose={closeMenu}
            onReact={(emoji) => {
              reactTo(menu.key, emoji);
              closeMenu();
            }}
            onMore={() => {
              setPickerFor(menu.key);
              closeMenu();
            }}
            onReply={() => {
              rowActions.onReply(byKey(menu.key)!);
              closeMenu();
            }}
            onCopy={() => {
              copyText(menu.key);
              closeMenu();
            }}
          />
        ) : null}
      </AnimatePresence>

      <EmojiPickerDialog
        open={pickerFor !== null && Boolean(byKey(pickerFor))}
        onOpenChange={(open) => !open && setPickerFor(null)}
        current={myReaction(byKey(pickerFor)?.reactions, viewerId)}
        onPick={(emoji) => pickerFor && reactTo(pickerFor, emoji)}
      />

      <ReactionsDialog
        open={reactionsFor !== null && (byKey(reactionsFor)?.reactions?.length ?? 0) > 0}
        onOpenChange={(open) => !open && setReactionsFor(null)}
        reactions={byKey(reactionsFor)?.reactions ?? []}
        viewerId={viewerId}
        members={members}
        onRemoveMine={() => reactionsFor && reactTo(reactionsFor, null)}
      />
    </ScrollRootContext.Provider>
  );
}
